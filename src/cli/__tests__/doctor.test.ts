import {
    execFileSync,
    execSync
} from 'child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type MockInstance
} from 'vitest';

import {
    CURRENT_VERSION,
    DEFAULT_SETTINGS
} from '../../types/Settings';
import { getPackageVersion } from '../../utils/terminal';
import {
    DOCTOR_TOOLS,
    collectDoctorReport,
    formatDoctorReport,
    runDoctor,
    type DoctorReport
} from '../doctor';

import {
    createCapturingIo,
    isolateEnvironment,
    writeJsonFile,
    type IsolatedEnvironment
} from './cli-test-helpers';

// No subprocess may run while the doctor collects its report: tool probes and
// `claude --version` go through this mock.
vi.mock('child_process', () => ({
    execSync: vi.fn(),
    execFileSync: vi.fn(),
    execFile: vi.fn(),
    spawnSync: vi.fn(),
    spawn: vi.fn()
}));

const mockExecFileSync = execFileSync as unknown as {
    mock: { calls: [string, string[], Record<string, unknown>][] };
    mockImplementation: (impl: (file: string, args: string[]) => string) => void;
};
const mockExecSync = execSync as unknown as { mockImplementation: (impl: () => string) => void };

// Distinctive token that must never leak into any doctor output.
const SECRET = 'sk-ant-oat01-DOCTOR-SECRET-9f8e7d6c5b4a';
const AVAILABLE_TOOLS = new Set(['git', 'bun']);
const STATUS_LINE_COMMAND = 'npx -y ccstatusline@latest';
const EXPECTED_SECTIONS: (keyof DoctorReport)[] = ['version', 'settings', 'claude', 'cache', 'terminal', 'environment', 'tools'];
const VISIBLE_VALUE_VARIABLES = ['CLAUDE_CONFIG_DIR', 'CCSTATUSLINE_WIDTH', 'CCSTATUSLINE_CACHE_DIR', 'CCSTATUSLINE_CONTEXT_SIZE_FALLBACK'];

function whichCommand(): string {
    return process.platform === 'win32' ? 'where' : 'which';
}

describe('doctor', () => {
    let env: IsolatedEnvironment;
    let consoleError: MockInstance<typeof console.error>;

    function writeFixtures(): void {
        // A credentials file beside Claude Code's settings, as on a real machine.
        fs.writeFileSync(
            path.join(env.claudeConfigDir, '.credentials.json'),
            JSON.stringify({ claudeAiOauth: { accessToken: SECRET, refreshToken: `${SECRET}-refresh` } }),
            'utf-8'
        );
        const statusLine = { type: 'command', command: STATUS_LINE_COMMAND, padding: 0, refreshInterval: 10 };
        writeJsonFile(path.join(env.claudeConfigDir, 'settings.json'), { statusLine });
        writeJsonFile(env.settingsPath, {
            ...DEFAULT_SETTINGS,
            lines: [
                [
                    { id: '1', type: 'model' },
                    { id: '2', type: 'separator' },
                    { id: '3', type: 'custom-command', commandPath: 'git status --short' }
                ],
                [],
                []
            ]
        });
        fs.mkdirSync(path.join(env.cacheDir, 'git-cache'), { recursive: true });
        fs.writeFileSync(path.join(env.cacheDir, 'usage.json'), '{"a":1}', 'utf-8');
        fs.writeFileSync(path.join(env.cacheDir, 'git-cache', 'git-1.json'), 'abc', 'utf-8');

        process.env.CCSTATUSLINE_WIDTH = '132';
        process.env.CCSTATUSLINE_CONTEXT_SIZE_FALLBACK = '200000';
        // A proxy URL may embed credentials; the doctor reports it as set only.
        process.env.HTTPS_PROXY = `http://user:${SECRET}@proxy.example.test:8080`;
    }

    beforeEach(() => {
        env = isolateEnvironment('ccstatusline-doctor-');
        vi.clearAllMocks();
        mockExecFileSync.mockImplementation((file, args) => {
            const tool = args[0] ?? '';
            if (AVAILABLE_TOOLS.has(tool)) {
                return `/usr/bin/${tool}\n`;
            }

            throw new Error(`${file}: ${tool} not found`);
        });
        mockExecSync.mockImplementation(() => '2.1.97 (Claude Code)\n');
        consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleError.mockRestore();
        vi.restoreAllMocks();
        env.restore();
    });

    describe('collectDoctorReport', () => {
        it('reports every documented section for a configured installation', async () => {
            writeFixtures();

            const report = await collectDoctorReport();

            expect(Object.keys(report)).toEqual(EXPECTED_SECTIONS);

            expect(report.version.ccstatusline).toBe(getPackageVersion());
            expect(['bun', 'node']).toContain(report.version.runtime);
            expect(report.version.runtimeVersion).toMatch(/^\d+\.\d+/);
            expect(report.version.platform).toBe(process.platform);
            expect(report.version.arch).toBe(process.arch);

            expect(report.settings).toEqual({
                path: env.settingsPath,
                custom: true,
                exists: true,
                valid: true,
                loadError: null,
                schemaVersion: CURRENT_VERSION,
                lineCount: 1,
                widgetCount: 2
            });

            expect(report.claude).toEqual({
                configDir: env.claudeConfigDir,
                configDirFromEnvironment: true,
                settingsPath: path.join(env.claudeConfigDir, 'settings.json'),
                settingsExists: true,
                statusLineCommand: STATUS_LINE_COMMAND,
                installation: { method: 'auto-update', packageManager: 'npm' },
                refreshInterval: 10,
                claudeVersion: '2.1.97'
            });

            expect(report.cache).toEqual({
                dir: env.cacheDir,
                envOverride: true,
                exists: true,
                fileCount: 2,
                totalBytes: 10
            });

            expect(report.terminal).toEqual({ width: 132, widthOverride: '132' });

            expect(report.tools).toEqual({ git: true, gh: false, glab: false, jj: false, npm: false, bun: true });
        });

        it('probes each tool once with a bounded, silent lookup and no shell', async () => {
            // Pin the width so the terminal probe adds no subprocess calls of its own.
            process.env.CCSTATUSLINE_WIDTH = '100';

            await collectDoctorReport();

            const probes = mockExecFileSync.mock.calls.filter(call => call[0] === whichCommand());
            expect(probes.map(call => call[1])).toEqual(DOCTOR_TOOLS.map(tool => [tool]));
            for (const call of probes) {
                expect(call[2]).toEqual(expect.objectContaining({ stdio: 'ignore', timeout: 2000, windowsHide: true }));
                expect(call[2]).not.toHaveProperty('shell');
            }
        });

        it('lists the environment overrides by name and shows values only for the safe ones', async () => {
            writeFixtures();

            const { variables } = (await collectDoctorReport()).environment;

            expect(variables.map(variable => variable.name)).toEqual([
                'CLAUDE_CONFIG_DIR',
                'CLAUDE_SECURESTORAGE_CONFIG_DIR',
                'CCSTATUSLINE_WIDTH',
                'CCSTATUSLINE_CACHE_DIR',
                'CCSTATUSLINE_CONTEXT_SIZE_FALLBACK',
                'HTTPS_PROXY',
                'https_proxy',
                'DEBUG_FONT_INSTALL'
            ]);
            expect(variables).toEqual(expect.arrayContaining([
                { name: 'CLAUDE_CONFIG_DIR', set: true, value: env.claudeConfigDir },
                { name: 'CLAUDE_SECURESTORAGE_CONFIG_DIR', set: false, value: null },
                { name: 'CCSTATUSLINE_WIDTH', set: true, value: '132' },
                { name: 'CCSTATUSLINE_CACHE_DIR', set: true, value: env.cacheDir },
                { name: 'CCSTATUSLINE_CONTEXT_SIZE_FALLBACK', set: true, value: '200000' },
                { name: 'HTTPS_PROXY', set: true, value: null },
                { name: 'DEBUG_FONT_INSTALL', set: false, value: null }
            ]));
            for (const variable of variables) {
                if (!VISIBLE_VALUE_VARIABLES.includes(variable.name)) {
                    expect(variable.value).toBeNull();
                }
            }
        });

        it('reports a missing settings file without creating it', async () => {
            const report = await collectDoctorReport();

            expect(report.settings).toEqual({
                path: env.settingsPath,
                custom: true,
                exists: false,
                valid: null,
                loadError: null,
                schemaVersion: null,
                lineCount: null,
                widgetCount: null
            });
            expect(fs.existsSync(env.settingsPath)).toBe(false);
        });

        it('reports an unparseable settings file as invalid with the load error', async () => {
            fs.mkdirSync(path.dirname(env.settingsPath), { recursive: true });
            fs.writeFileSync(env.settingsPath, '{ not json', 'utf-8');

            const report = await collectDoctorReport();

            expect(report.settings).toEqual({
                path: env.settingsPath,
                custom: true,
                exists: true,
                valid: false,
                loadError: 'settings.json is not valid JSON',
                schemaVersion: null,
                lineCount: null,
                widgetCount: null
            });
            // The recovery contract holds: the broken file is left untouched.
            expect(fs.readFileSync(env.settingsPath, 'utf-8')).toBe('{ not json');
        });

        it('describes a machine without Claude Code, a cache or any tools', async () => {
            mockExecFileSync.mockImplementation(() => {
                throw new Error('not found');
            });
            mockExecSync.mockImplementation(() => {
                throw new Error('claude: command not found');
            });

            const report = await collectDoctorReport();

            expect(report.claude).toEqual({
                configDir: env.claudeConfigDir,
                configDirFromEnvironment: true,
                settingsPath: path.join(env.claudeConfigDir, 'settings.json'),
                settingsExists: false,
                statusLineCommand: null,
                installation: { method: 'unknown', packageManager: 'unknown' },
                refreshInterval: null,
                claudeVersion: null
            });
            expect(report.cache).toEqual({
                dir: env.cacheDir,
                envOverride: true,
                exists: false,
                fileCount: 0,
                totalBytes: 0
            });
            expect(report.terminal.widthOverride).toBeNull();
            expect(Object.values(report.tools)).toEqual(DOCTOR_TOOLS.map(() => false));
        });

        it('falls back to the default cache directory when no override is set', async () => {
            Reflect.deleteProperty(process.env, 'CCSTATUSLINE_CACHE_DIR');

            const report = await collectDoctorReport();

            expect(report.cache.envOverride).toBe(false);
            expect(report.cache.dir).toContain(path.join('.cache', 'ccstatusline'));
        });
    });

    describe('credential safety', () => {
        it('never reads the credentials file and never prints token-like values', async () => {
            writeFixtures();
            const readFileSync = vi.spyOn(fs, 'readFileSync');

            const report = await collectDoctorReport();
            const jsonIo = createCapturingIo();
            const textIo = createCapturingIo();
            await runDoctor({ json: true }, jsonIo);
            await runDoctor({ json: false }, textIo);

            const readPaths = readFileSync.mock.calls.map(call => String(call[0]));
            // The spy observed real reads (settings files), so the check below is not vacuous.
            expect(readPaths.length).toBeGreaterThan(0);
            expect(readPaths.filter(filePath => filePath.includes('.credentials.json'))).toEqual([]);

            for (const output of [JSON.stringify(report), formatDoctorReport(report), jsonIo.stdoutText(), textIo.stdoutText()]) {
                expect(output).not.toContain(SECRET);
                expect(output).not.toMatch(/sk-ant-/);
            }
        });

        it('does not import the usage modules that know how to read credentials', () => {
            const source = fs.readFileSync(new URL('../doctor.ts', import.meta.url), 'utf-8');

            expect(source).not.toMatch(/from '\.\.\/utils\/usage/);
            expect(source).not.toMatch(/\.credentials\.json|keychain|security/i);
        });
    });

    describe('formatDoctorReport', () => {
        it('renders every section with human-readable labels', async () => {
            writeFixtures();
            const report = await collectDoctorReport();

            const text = formatDoctorReport(report);

            for (const heading of ['Version', 'Settings', 'Claude Code', 'Cache', 'Terminal', 'Environment', 'Tools']) {
                expect(text).toContain(heading);
            }
            expect(text).toContain(env.settingsPath);
            expect(text).toContain(`schema version   ${CURRENT_VERSION}`);
            expect(text).toContain(STATUS_LINE_COMMAND);
            expect(text).toContain('auto-update (npm)');
            expect(text).toContain('2.1.97');
            expect(text).toContain('2 (10 B)');
            expect(text).toContain('132 (CCSTATUSLINE_WIDTH)');
            expect(text).toContain('CCSTATUSLINE_CACHE_DIR)');
            expect(text).toMatch(/HTTPS_PROXY\s+set\b/);
            expect(text).toMatch(/CLAUDE_SECURESTORAGE_CONFIG_DIR\s+unset\b/);
            expect(text).toMatch(/\bgit\s+available\b/);
            expect(text).toMatch(/\bgh\s+not found\b/);
            expect(text.endsWith('\n')).toBe(true);
        });

        it('explains missing pieces instead of printing null', () => {
            const text = formatDoctorReport(placeholderReport());

            expect(text).not.toContain('null');
            expect(text).toMatch(/exists\s+no\b/);
            expect(text).toMatch(/statusLine\s+not configured\b/);
            expect(text).toMatch(/claude version\s+not installed\b/);
            expect(text).toMatch(/\bgit\s+not found\b/);
            expect(text).toMatch(/width\s+not detected\b/);
        });

        it('formats larger cache sizes in binary units', () => {
            const sizes: [number, string][] = [[0, '0 B'], [1023, '1023 B'], [1024, '1.0 KB'], [1536, '1.5 KB'], [5 * 1024 * 1024, '5.0 MB'], [3 * 1024 ** 3, '3.0 GB']];
            for (const [bytes, expected] of sizes) {
                const report = { ...placeholderReport(), cache: { dir: '/cache', envOverride: false, exists: true, fileCount: 1, totalBytes: bytes } };
                expect(formatDoctorReport(report)).toContain(`1 (${expected})`);
            }
        });
    });

    describe('runDoctor', () => {
        it('prints the report as JSON with --json and exits 0', async () => {
            writeFixtures();
            const io = createCapturingIo();

            const exitCode = await runDoctor({ json: true }, io);

            expect(exitCode).toBe(0);
            expect(io.stderrText()).toBe('');
            expect(io.stdoutText().endsWith('}\n')).toBe(true);
            const parsed = JSON.parse(io.stdoutText()) as DoctorReport;
            expect(Object.keys(parsed)).toEqual(EXPECTED_SECTIONS);
            expect(parsed.settings.lineCount).toBe(1);
            expect(parsed.tools.git).toBe(true);
        });

        it('prints the human-readable report otherwise and exits 0', async () => {
            writeFixtures();
            const io = createCapturingIo();

            const exitCode = await runDoctor({ json: false }, io);

            expect(exitCode).toBe(0);
            expect(io.stderrText()).toBe('');
            expect(io.stdoutText().split('\n')[0]).toBe('ccstatusline doctor');
            expect(io.stdoutText()).toContain('Claude Code');
            expect(() => {
                JSON.parse(io.stdoutText());
            }).toThrow();
        });
    });
});

function placeholderReport(): DoctorReport {
    return {
        version: { ccstatusline: '0.0.0', runtime: 'node', runtimeVersion: '20.0.0', platform: 'linux', arch: 'x64' },
        settings: {
            path: '/settings.json',
            custom: false,
            exists: false,
            valid: null,
            loadError: null,
            schemaVersion: null,
            lineCount: null,
            widgetCount: null
        },
        claude: {
            configDir: '/claude',
            configDirFromEnvironment: false,
            settingsPath: '/claude/settings.json',
            settingsExists: false,
            statusLineCommand: null,
            installation: { method: 'unknown', packageManager: 'unknown' },
            refreshInterval: null,
            claudeVersion: null
        },
        cache: { dir: '/cache', envOverride: false, exists: false, fileCount: 0, totalBytes: 0 },
        terminal: { width: null, widthOverride: null },
        environment: { variables: [] },
        tools: { git: false, gh: false, glab: false, jj: false, npm: false, bun: false }
    };
}
