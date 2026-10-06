import chalk from 'chalk';
import {
    execFile,
    execFileSync,
    execSync,
    spawn,
    spawnSync
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
    DEFAULT_SETTINGS,
    type Settings
} from '../../types/Settings';
import {
    getVisibleText,
    getVisibleWidth
} from '../../utils/ansi';
import { updateColorMap } from '../../utils/colors';
import { MAX_TERMINAL_WIDTH } from '../../utils/terminal';
import {
    parsePreviewWidth,
    runPreview,
    type PreviewJson
} from '../preview';

import {
    createCapturingIo,
    isolateEnvironment,
    writeJsonFile,
    type IsolatedEnvironment
} from './cli-test-helpers';

// A preview must never start a process: custom commands, git, memory probes
// and width detection all go through child_process, which is fully mocked.
vi.mock('child_process', () => ({
    execSync: vi.fn(),
    execFileSync: vi.fn(),
    execFile: vi.fn(),
    spawnSync: vi.fn(),
    spawn: vi.fn()
}));

const SUBPROCESS_MOCKS = { execFile, execFileSync, execSync, spawn, spawnSync };
const NON_BREAKING_SPACE = ' ';

function settingsWithLines(lines: Settings['lines']): Settings {
    return { ...DEFAULT_SETTINGS, lines };
}

function parsePreviewJson(text: string): PreviewJson {
    return JSON.parse(text) as PreviewJson;
}

describe('runPreview', () => {
    let env: IsolatedEnvironment;
    let consoleError: MockInstance<typeof console.error>;
    const originalChalkLevel = chalk.level;

    beforeEach(() => {
        env = isolateEnvironment('ccstatusline-preview-');
        vi.clearAllMocks();
        consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleError.mockRestore();
        chalk.level = originalChalkLevel;
        updateColorMap();
        env.restore();
    });

    it('renders the default configuration at the requested width, one line per row', async () => {
        writeJsonFile(env.settingsPath, DEFAULT_SETTINGS);
        const io = createCapturingIo();

        const exitCode = await runPreview({ width: 80, json: false }, io);

        expect(exitCode).toBe(0);
        expect(io.stderrText()).toBe('');
        expect(io.stdoutText().endsWith('\n')).toBe(true);
        const rows = io.stdoutText().slice(0, -1).split('\n');
        expect(rows).toHaveLength(1);
        const plain = getVisibleText(rows[0] ?? '');
        expect(plain).toContain('Model: Claude');
        expect(plain).toContain('Ctx: 18.6k');
        expect(plain).toContain('main');
        // Styled per the configured color level and printed verbatim: regular
        // spaces stay regular spaces (no non-breaking space substitution).
        expect(rows[0]).not.toBe(plain);
        expect(rows[0]).toContain(' ');
        expect(rows[0]).not.toContain(NON_BREAKING_SPACE);
    });

    it('prints the documented JSON shape', async () => {
        writeJsonFile(env.settingsPath, DEFAULT_SETTINGS);
        const io = createCapturingIo();

        const exitCode = await runPreview({ width: 80, json: true }, io);

        expect(exitCode).toBe(0);
        expect(io.stdoutText().endsWith('}\n')).toBe(true);
        const parsed = parsePreviewJson(io.stdoutText());
        expect(Object.keys(parsed)).toEqual(['width', 'lines']);
        expect(parsed.width).toBe(80);
        expect(parsed.lines).toHaveLength(1);
        const [line] = parsed.lines;
        expect(Object.keys(line ?? {})).toEqual(['index', 'text', 'plain', 'wasTruncated']);
        expect(line?.index).toBe(0);
        expect(line?.plain).toBe(getVisibleText(line?.text ?? ''));
        expect(line?.plain).toContain('Model: Claude');
        expect(line?.wasTruncated).toBe(false);
    });

    it('reports truncation when a line does not fit the width', async () => {
        writeJsonFile(env.settingsPath, settingsWithLines([
            [{ id: '1', type: 'custom-text', customText: 'x'.repeat(70) }],
            [],
            []
        ]));
        const io = createCapturingIo();

        await runPreview({ width: 30, json: true }, io);

        const [line] = parsePreviewJson(io.stdoutText()).lines;
        expect(line?.wasTruncated).toBe(true);
        expect(line?.plain.endsWith('...')).toBe(true);
        expect(getVisibleWidth(line?.text ?? '')).toBeLessThanOrEqual(30);
    });

    it('keeps the original line indices and skips empty lines', async () => {
        writeJsonFile(env.settingsPath, settingsWithLines([
            [],
            [{ id: '1', type: 'custom-text', customText: 'second' }],
            [{ id: '2', type: 'custom-text', customText: 'third' }]
        ]));
        const io = createCapturingIo();

        await runPreview({ width: 80, json: true }, io);

        const parsed = parsePreviewJson(io.stdoutText());
        expect(parsed.lines.map(line => [line.index, line.plain.trim()])).toEqual([[1, 'second'], [2, 'third']]);
    });

    it('uses CCSTATUSLINE_WIDTH when no width is given', async () => {
        writeJsonFile(env.settingsPath, DEFAULT_SETTINGS);
        process.env.CCSTATUSLINE_WIDTH = '100';
        const io = createCapturingIo();

        await runPreview({ json: true }, io);

        expect(parsePreviewJson(io.stdoutText()).width).toBe(100);
    });

    it('prefers an explicit width over CCSTATUSLINE_WIDTH', async () => {
        writeJsonFile(env.settingsPath, DEFAULT_SETTINGS);
        process.env.CCSTATUSLINE_WIDTH = '100';
        const io = createCapturingIo();

        await runPreview({ width: 80, json: true }, io);

        expect(parsePreviewJson(io.stdoutText()).width).toBe(80);
    });

    it('never executes custom commands or any other subprocess', async () => {
        writeJsonFile(env.settingsPath, settingsWithLines([
            [
                ...(DEFAULT_SETTINGS.lines[0] ?? []),
                { id: 'sep', type: 'separator' },
                { id: 'cmd', type: 'custom-command', commandPath: 'echo hi', timeout: 50 },
                { id: 'mem', type: 'free-memory' }
            ],
            [],
            []
        ]));
        const io = createCapturingIo();

        const exitCode = await runPreview({ width: 120, json: false }, io);

        expect(exitCode).toBe(0);
        expect(getVisibleText(io.stdoutText())).toContain('[cmd: echo hi]');
        const called = Object.entries(SUBPROCESS_MOCKS)
            .filter(([, mock]) => (mock as unknown as { mock: { calls: unknown[] } }).mock.calls.length > 0)
            .map(([name]) => name);
        expect(called).toEqual([]);
    });

    it('previews the built-in defaults and warns on stderr when the settings file is invalid', async () => {
        fs.mkdirSync(path.dirname(env.settingsPath), { recursive: true });
        fs.writeFileSync(env.settingsPath, '{ not json', 'utf-8');
        const io = createCapturingIo();

        const exitCode = await runPreview({ width: 80, json: false }, io);

        expect(exitCode).toBe(0);
        expect(io.stderrText()).toContain('settings.json is not valid JSON');
        expect(getVisibleText(io.stdoutText())).toContain('Model: Claude');
        expect(fs.readFileSync(env.settingsPath, 'utf-8')).toBe('{ not json');
    });

    it('prints an empty lines array when nothing renders', async () => {
        writeJsonFile(env.settingsPath, settingsWithLines([[]]));
        const io = createCapturingIo();

        await runPreview({ width: 80, json: true }, io);

        expect(parsePreviewJson(io.stdoutText())).toEqual({ width: 80, lines: [] });
    });
});

describe('parsePreviewWidth', () => {
    it('accepts positive whole numbers', () => {
        expect(parsePreviewWidth('80')).toBe(80);
        expect(parsePreviewWidth(' 120 ')).toBe(120);
        expect(parsePreviewWidth('1')).toBe(1);
    });

    it('rejects everything else', () => {
        const rejected = [undefined, '', '0', '-5', '80.5', 'abc', '80px', '1e3'];
        const accepted = rejected.filter(raw => parsePreviewWidth(raw) !== null);

        expect(accepted).toEqual([]);
    });

    it('accepts the largest width a terminal can report', () => {
        expect(parsePreviewWidth('65535')).toBe(65535);
        expect(parsePreviewWidth(String(MAX_TERMINAL_WIDTH))).toBe(MAX_TERMINAL_WIDTH);
    });

    it('rejects widths above the largest terminal width', () => {
        // ws_col is a 16-bit field, so no terminal can report more than 65535
        // columns; anything larger would only size strings no renderer can build.
        const tooWide = ['65536', '100000', String(Number.MAX_SAFE_INTEGER)];
        const accepted = tooWide.filter(raw => parsePreviewWidth(raw) !== null);

        expect(accepted).toEqual([]);
    });

    it('rejects digit strings that cannot be represented exactly', () => {
        // parseInt turns these into Infinity (which JSON prints as null) or a
        // silently rounded neighbour; neither is the number the user typed.
        const unrepresentable = ['9'.repeat(310), '9007199254740993', '9007199254740992'];
        const accepted = unrepresentable.filter(raw => parsePreviewWidth(raw) !== null);

        expect(accepted).toEqual([]);
    });
});
