import chalk from 'chalk';
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

import { FlexModeSchema } from '../../types/FlexMode';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { updateColorMap } from '../../utils/colors';
import { getPackageVersion } from '../../utils/terminal';
import { CLI_OPTIONS } from '../args';
import { runCli } from '../index';

import {
    createCapturingIo,
    isolateEnvironment,
    writeJsonFile,
    type IsolatedEnvironment
} from './cli-test-helpers';

// The dispatcher drives --doctor and --preview, which probe tools, width and
// `claude --version` through child_process; none of that may run for real.
vi.mock('child_process', () => ({
    execSync: vi.fn(),
    execFileSync: vi.fn(),
    execFile: vi.fn(),
    spawnSync: vi.fn(),
    spawn: vi.fn()
}));

interface LooseSchema {
    $id?: string;
    properties?: Record<string, { enum?: unknown[] } | undefined>;
}

describe('runCli', () => {
    let env: IsolatedEnvironment;
    let consoleError: MockInstance<typeof console.error>;
    const originalChalkLevel = chalk.level;

    beforeEach(() => {
        env = isolateEnvironment('ccstatusline-cli-');
        vi.clearAllMocks();
        consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleError.mockRestore();
        chalk.level = originalChalkLevel;
        updateColorMap();
        env.restore();
    });

    describe('--help', () => {
        it('prints the help text with every option and exits 0', async () => {
            const io = createCapturingIo();

            const result = await runCli(['--help'], io);

            expect(result).toEqual({ handled: true, exitCode: 0 });
            for (const option of CLI_OPTIONS) {
                expect(io.stdoutText()).toContain(option.flag);
            }
            expect(io.stdoutText()).toContain(getPackageVersion());
            expect(io.stderrText()).toBe('');
        });

        it('accepts the -h alias', async () => {
            const io = createCapturingIo();

            const result = await runCli(['-h'], io);

            expect(result).toEqual({ handled: true, exitCode: 0 });
            expect(io.stdoutText()).toContain('--help');
        });

        it('wins over any other mode so a user can always ask for help', async () => {
            const io = createCapturingIo();

            const result = await runCli(['--schema', 'bogus', '--help'], io);

            expect(result).toEqual({ handled: true, exitCode: 0 });
            expect(io.stdoutText()).toContain('Usage:');
            expect(io.stderrText()).toBe('');
        });
    });

    describe('--schema', () => {
        it('prints the settings schema by default as pretty JSON', async () => {
            const io = createCapturingIo();

            const result = await runCli(['--schema'], io);

            expect(result).toEqual({ handled: true, exitCode: 0 });
            const schema = JSON.parse(io.stdoutText()) as LooseSchema;
            expect(schema.$id).toBe('https://github.com/sirmalloc/ccstatusline/schema/settings.json');
            expect(schema.properties?.flexMode?.enum).toEqual(FlexModeSchema.options);
            expect(io.stdoutText().endsWith('}\n')).toBe(true);
            expect(io.stdoutText()).toContain('\n  "properties": {');
        });

        it('prints the status JSON schema when asked', async () => {
            const io = createCapturingIo();

            const result = await runCli(['--schema', 'status-json'], io);

            expect(result).toEqual({ handled: true, exitCode: 0 });
            const schema = JSON.parse(io.stdoutText()) as LooseSchema;
            expect(schema.$id).toBe('https://github.com/sirmalloc/ccstatusline/schema/status-json.json');
            expect(schema.properties).toHaveProperty('cost');
        });

        it('rejects an unknown schema target on stderr with exit code 2', async () => {
            const io = createCapturingIo();

            const result = await runCli(['--schema', 'widgets'], io);

            expect(result).toEqual({ handled: true, exitCode: 2 });
            expect(io.stdoutText()).toBe('');
            expect(io.stderrText()).toContain('widgets');
            expect(io.stderrText()).toContain('status-json');
        });
    });

    describe('--doctor', () => {
        it('prints JSON diagnostics with --json', async () => {
            const io = createCapturingIo();

            const result = await runCli(['--doctor', '--json'], io);

            expect(result).toEqual({ handled: true, exitCode: 0 });
            const parsed = JSON.parse(io.stdoutText()) as Record<string, unknown>;
            expect(Object.keys(parsed)).toEqual(['version', 'settings', 'claude', 'cache', 'terminal', 'environment', 'tools']);
        });

        it('prints the human-readable report without --json', async () => {
            const io = createCapturingIo();

            const result = await runCli(['--doctor'], io);

            expect(result).toEqual({ handled: true, exitCode: 0 });
            expect(io.stdoutText()).toContain('ccstatusline doctor');
            expect(io.stdoutText()).toContain(env.settingsPath);
        });
    });

    describe('--validate', () => {
        it('validates the active settings file by default', async () => {
            writeJsonFile(env.settingsPath, DEFAULT_SETTINGS);
            const io = createCapturingIo();

            const result = await runCli(['--validate'], io);

            expect(result).toEqual({ handled: true, exitCode: 0 });
            expect(io.stdoutText()).toContain(`${env.settingsPath}: valid`);
        });

        it('validates the given file and reports an invalid one with exit code 1', async () => {
            const brokenPath = path.join(env.root, 'broken.json');
            writeJsonFile(brokenPath, { version: 4, lines: 'not an array' });
            const io = createCapturingIo();

            const result = await runCli(['--validate', brokenPath], io);

            expect(result).toEqual({ handled: true, exitCode: 1 });
            expect(io.stdoutText()).toContain(`${brokenPath}: invalid`);
            expect(io.stdoutText()).toContain('lines');
        });

        it('reports an unreadable file with exit code 2', async () => {
            const missingPath = path.join(env.root, 'missing.json');
            const io = createCapturingIo();

            const result = await runCli(['--validate', missingPath], io);

            expect(result).toEqual({ handled: true, exitCode: 2 });
            expect(io.stderrText()).toContain(missingPath);
        });
    });

    describe('--preview', () => {
        it('renders the configured lines', async () => {
            writeJsonFile(env.settingsPath, DEFAULT_SETTINGS);
            const io = createCapturingIo();

            const result = await runCli(['--preview', '--width', '80'], io);

            expect(result).toEqual({ handled: true, exitCode: 0 });
            expect(io.stdoutText()).toContain('Model: Claude');
        });

        it('emits JSON with the requested width', async () => {
            writeJsonFile(env.settingsPath, DEFAULT_SETTINGS);
            const io = createCapturingIo();

            const result = await runCli(['--preview', '--json', '--width', '90'], io);

            expect(result).toEqual({ handled: true, exitCode: 0 });
            const parsed = JSON.parse(io.stdoutText()) as { width: number | null; lines: unknown[] };
            expect(parsed.width).toBe(90);
            expect(parsed.lines).toHaveLength(1);
        });

        it('rejects a width that is not a positive whole number with exit code 2', async () => {
            for (const bad of ['abc', '0', '-3', '12.5']) {
                const io = createCapturingIo();

                const result = await runCli(['--preview', '--width', bad], io);

                expect(result).toEqual({ handled: true, exitCode: 2 });
                expect(io.stdoutText()).toBe('');
                expect(io.stderrText()).toContain('--width');
                expect(io.stderrText()).toContain(bad);
            }
        });

        it('rejects --width without a value', async () => {
            const io = createCapturingIo();

            const result = await runCli(['--preview', '--width'], io);

            expect(result).toEqual({ handled: true, exitCode: 2 });
            expect(io.stderrText()).toContain('--width');
        });
    });

    describe('conflicting modes', () => {
        it('refuses to guess when two modes are requested at once', async () => {
            const io = createCapturingIo();

            const result = await runCli(['--schema', '--doctor'], io);

            expect(result).toEqual({ handled: true, exitCode: 2 });
            expect(io.stdoutText()).toBe('');
            expect(io.stderrText()).toContain('--schema');
            expect(io.stderrText()).toContain('--doctor');
        });
    });

    describe('pass-through', () => {
        it('leaves an empty argument list to the entry point', async () => {
            const io = createCapturingIo();

            expect(await runCli([], io)).toEqual({ handled: false });
            expect(io.stdoutText()).toBe('');
            expect(io.stderrText()).toBe('');
        });

        it('leaves unknown flags and internal flags to the entry point', async () => {
            const io = createCapturingIo();

            expect(await runCli(['--hook'], io)).toEqual({ handled: false });
            expect(await runCli(['--bogus'], io)).toEqual({ handled: false });
            expect(await runCli(['--width', '80', '--json'], io)).toEqual({ handled: false });
            expect(io.stdoutText()).toBe('');
        });
    });
});
