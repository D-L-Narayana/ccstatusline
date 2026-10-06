import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    CURRENT_VERSION,
    DEFAULT_SETTINGS
} from '../../types/Settings';
import {
    formatConfigRiskLine,
    runValidate
} from '../validate';

import {
    createCapturingIo,
    isolateEnvironment,
    writeJsonFile,
    type IsolatedEnvironment
} from './cli-test-helpers';

const RISKY_CONFIG = {
    ...DEFAULT_SETTINGS,
    lines: [
        [
            { id: '1', type: 'model' },
            { id: '2', type: 'separator' },
            { id: '3', type: 'custom-command', commandPath: 'git status --short' }
        ],
        [{ id: '4', type: 'link', metadata: { url: 'https://example.com/docs', text: 'Docs' } }],
        []
    ]
};

describe('runValidate', () => {
    let env: IsolatedEnvironment;

    beforeEach(() => {
        env = isolateEnvironment('ccstatusline-validate-');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        env.restore();
    });

    it('accepts the active settings file and summarizes it when no path is given', async () => {
        writeJsonFile(env.settingsPath, DEFAULT_SETTINGS);
        const io = createCapturingIo();

        const exitCode = await runValidate(undefined, io);

        expect(exitCode).toBe(0);
        expect(io.stderrText()).toBe('');
        expect(io.stdoutText()).toContain(`${env.settingsPath}: valid`);
        expect(io.stdoutText()).toContain('lines: 1, widgets: 4');
        expect(io.stdoutText()).toContain('no shell commands or hyperlinks');
    });

    it('validates an explicit file and lists its shell commands and hyperlinks', async () => {
        const exportPath = path.join(env.root, 'export.json');
        writeJsonFile(exportPath, RISKY_CONFIG);
        const io = createCapturingIo();

        const exitCode = await runValidate(exportPath, io);

        expect(exitCode).toBe(0);
        expect(io.stdoutText()).toContain(`${exportPath}: valid`);
        expect(io.stdoutText()).toContain('lines: 2, widgets: 3');
        expect(io.stdoutText()).toMatch(/shell command.*: 1/);
        expect(io.stdoutText()).toContain('line 1 · custom-command · git status --short');
        expect(io.stdoutText()).toMatch(/hyperlink.*: 1/);
        expect(io.stdoutText()).toContain('line 2 · link · https://example.com/docs');
        expect(io.stdoutText()).not.toContain('no shell commands or hyperlinks');
    });

    it('reports every schema issue with its path and exits 1', async () => {
        const brokenPath = path.join(env.root, 'broken.json');
        writeJsonFile(brokenPath, {
            version: CURRENT_VERSION,
            flexMode: 'wide',
            lines: [[{ id: 'a', type: 42 }], [], []]
        });
        const io = createCapturingIo();

        const exitCode = await runValidate(brokenPath, io);

        expect(exitCode).toBe(1);
        expect(io.stdoutText()).toContain(`${brokenPath}: invalid`);
        expect(io.stdoutText()).toContain('flexMode');
        expect(io.stdoutText()).toContain('lines[0][0].type');
        const issueLines = io.stdoutText().split('\n').filter(line => line.startsWith('  '));
        expect(issueLines.length).toBeGreaterThanOrEqual(2);
    });

    it('treats a file that is not JSON as invalid and names the problem', async () => {
        const notJsonPath = path.join(env.root, 'not-json.json');
        fs.writeFileSync(notJsonPath, '{ not json', 'utf-8');
        const io = createCapturingIo();

        const exitCode = await runValidate(notJsonPath, io);

        expect(exitCode).toBe(1);
        expect(io.stdoutText()).toContain(`${notJsonPath}: invalid`);
        expect(io.stdoutText()).toContain('File is not valid JSON');
    });

    it('rejects a config written by a newer version as invalid', async () => {
        const futurePath = path.join(env.root, 'future.json');
        writeJsonFile(futurePath, { ...DEFAULT_SETTINGS, version: CURRENT_VERSION + 1 });
        const io = createCapturingIo();

        const exitCode = await runValidate(futurePath, io);

        expect(exitCode).toBe(1);
        expect(io.stdoutText()).toContain(`newer than supported version ${CURRENT_VERSION}`);
    });

    it('exits 2 with the reason on stderr when the file does not exist', async () => {
        const missingPath = path.join(env.root, 'missing.json');
        const io = createCapturingIo();

        const exitCode = await runValidate(missingPath, io);

        expect(exitCode).toBe(2);
        expect(io.stdoutText()).toBe('');
        expect(io.stderrText()).toContain(missingPath);
        expect(io.stderrText()).toMatch(/cannot read/i);
    });

    it('exits 2 when the active settings file has not been created yet', async () => {
        const io = createCapturingIo();

        const exitCode = await runValidate(undefined, io);

        expect(exitCode).toBe(2);
        expect(io.stderrText()).toContain(env.settingsPath);
        expect(fs.existsSync(env.settingsPath)).toBe(false);
    });

    it('exits 2 when the path is a directory', async () => {
        const io = createCapturingIo();

        const exitCode = await runValidate(env.root, io);

        expect(exitCode).toBe(2);
        expect(io.stderrText()).toContain(env.root);
        expect(io.stderrText()).toMatch(/directory/i);
    });

    it('expands a leading ~ like the TUI import does', async () => {
        vi.spyOn(os, 'homedir').mockReturnValue(env.home);
        writeJsonFile(path.join(env.home, 'export.json'), DEFAULT_SETTINGS);
        const io = createCapturingIo();

        const exitCode = await runValidate('~/export.json', io);

        expect(exitCode).toBe(0);
        expect(io.stdoutText()).toContain(`${path.join(env.home, 'export.json')}: valid`);
    });
});

describe('formatConfigRiskLine', () => {
    it('renders the one-based line, the widget type and the value', () => {
        expect(formatConfigRiskLine({
            kind: 'shell-command',
            lineIndex: 2,
            itemIndex: 0,
            widgetType: 'custom-command',
            value: 'git status'
        })).toBe('line 3 · custom-command · git status');
    });
});
