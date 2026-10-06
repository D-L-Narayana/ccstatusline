import type { SpawnSyncReturns } from 'child_process';
import { spawnSync } from 'child_process';
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

import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import type {
    NumberEditorSpec,
    TextEditorSpec,
    WidgetEditorSpec
} from '../../types/WidgetEditorSpec';
import type { CustomCommandRequest } from '../../utils/custom-command';
import { clearCustomCommandCache } from '../../utils/custom-command';
import { CustomCommandWidget } from '../CustomCommand';

// Mock the process boundary: echo back whatever is handed to stdin, the way
// `cat` would. The widget output then IS the JSON it sent, so we can assert
// exactly what the custom command received, without spawning a subprocess.
vi.mock('child_process', () => ({
    execSync: vi.fn(),
    execFileSync: vi.fn(),
    spawnSync: vi.fn()
}));

const mockSpawnSync = spawnSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: (command: string, args: string[], options: { input?: string }) => SpawnSyncReturns<string>) => void;
};

const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_USERPROFILE = process.env.USERPROFILE;
const tempPaths: string[] = [];

function echoStdin(): void {
    mockSpawnSync.mockImplementation((_command, _args, options) => {
        const request = JSON.parse(options.input ?? '{}') as CustomCommandRequest;

        return {
            pid: 4242,
            output: [],
            stdout: JSON.stringify({ status: 'ok', stdout: request.input }),
            stderr: '',
            status: 0,
            signal: null
        };
    });
}

function useTempHome(): void {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-widget-home-'));
    tempPaths.push(home);
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    vi.spyOn(os, 'homedir').mockReturnValue(home);
}

function expectTextSpec(spec: WidgetEditorSpec | null): TextEditorSpec {
    expect(spec?.kind).toBe('text');
    if (spec?.kind !== 'text') {
        throw new Error('expected a text editor spec');
    }
    return spec;
}

function expectNumberSpec(spec: WidgetEditorSpec | null): NumberEditorSpec {
    expect(spec?.kind).toBe('number');
    if (spec?.kind !== 'number') {
        throw new Error('expected a number editor spec');
    }
    return spec;
}

describe('CustomCommandWidget', () => {
    const widget = new CustomCommandWidget();

    const settings: Settings = {
        version: 3,
        lines: [],
        flexMode: 'full',
        compactThreshold: 60,
        colorLevel: 2,
        defaultPadding: ' ',
        defaultPaddingSide: 'both',
        inheritSeparatorColors: false,
        globalBold: false,
        gitCacheTtlSeconds: 5,
        terminalWidthCacheTtlSeconds: 5,
        customCommandCacheTtlSeconds: 0,
        minimalistMode: false,
        powerline: {
            enabled: false,
            separators: [],
            separatorInvertBackground: [],
            startCaps: [],
            endCaps: [],
            autoAlign: false,
            continueThemeAcrossLines: false
        }
    };

    const createItem = (): WidgetItem => ({
        id: 'test',
        type: 'custom-command',
        commandPath: 'echo'
    });

    // The TTL reaches the widget through the render context, the same route the
    // git cache TTL takes.
    const createContext = (
        terminalWidth: number | null | undefined,
        customCommandCacheTtlSeconds = 0
    ): RenderContext => ({
        data: { model: { display_name: 'Sonnet' } },
        terminalWidth,
        customCommandCacheTtlSeconds,
        isPreview: false
    });

    const renderParsed = (terminalWidth: number | null | undefined): Record<string, unknown> => {
        const output = widget.render(createItem(), createContext(terminalWidth), settings);
        if (output === null)
            throw new Error('expected command output');
        return JSON.parse(output) as Record<string, unknown>;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        clearCustomCommandCache();
        echoStdin();
    });

    afterEach(() => {
        clearCustomCommandCache();
        vi.restoreAllMocks();
        if (ORIGINAL_HOME === undefined) {
            delete process.env.HOME;
        } else {
            process.env.HOME = ORIGINAL_HOME;
        }
        if (ORIGINAL_USERPROFILE === undefined) {
            delete process.env.USERPROFILE;
        } else {
            process.env.USERPROFILE = ORIGINAL_USERPROFILE;
        }

        while (tempPaths.length > 0) {
            const tempPath = tempPaths.pop();
            if (tempPath) {
                fs.rmSync(tempPath, { recursive: true, force: true });
            }
        }
    });

    it('includes terminal_width in the JSON piped to the command', () => {
        expect(renderParsed(142).terminal_width).toBe(142);
    });

    it('still passes through the existing data fields', () => {
        const model = renderParsed(142).model as { display_name?: string } | undefined;
        expect(model?.display_name).toBe('Sonnet');
    });

    it('omits terminal_width when the width is unknown', () => {
        expect(renderParsed(null)).not.toHaveProperty('terminal_width');
    });

    it('runs the command on every render when no cache TTL is configured', () => {
        renderParsed(142);
        renderParsed(142);

        expect(mockSpawnSync.mock.calls).toHaveLength(2);
    });

    it('reuses command output across renders within the configured TTL', () => {
        useTempHome();

        const first = widget.render(createItem(), createContext(142, 5), settings);
        const second = widget.render(createItem(), createContext(142, 5), settings);

        expect(second).toBe(first);
        expect(mockSpawnSync.mock.calls).toHaveLength(1);
    });

    it('runs the command again when the terminal width changes', () => {
        useTempHome();

        widget.render(createItem(), createContext(80, 5), settings);
        widget.render(createItem(), createContext(200, 5), settings);

        expect(mockSpawnSync.mock.calls).toHaveLength(2);
    });

    describe('editor', () => {
        const configured: WidgetItem = {
            id: 'cmd',
            type: 'custom-command',
            commandPath: 'echo hi',
            maxWidth: 20,
            timeout: 2500,
            preserveColors: true
        };
        const bare: WidgetItem = { id: 'cmd', type: 'custom-command' };

        it('keeps the command, width, timeout and preserve keybinds', () => {
            expect(widget.getCustomKeybinds()).toEqual([
                { key: 'e', label: '(e)dit cmd', action: 'edit-command' },
                { key: 'w', label: '(w)idth', action: 'edit-width' },
                { key: 't', label: '(t)imeout', action: 'edit-timeout' },
                { key: 'p', label: '(p)reserve colors', action: 'toggle-preserve' }
            ]);
        });

        it('toggles preserve colors directly instead of opening an editor', () => {
            expect(widget.handleEditorAction('toggle-preserve', bare)).toEqual({ ...bare, preserveColors: true });
            expect(widget.handleEditorAction('toggle-preserve', configured)).toEqual({ ...configured, preserveColors: false });
            expect(widget.handleEditorAction('edit-command', configured)).toBeNull();
            expect(widget.getEditorSpec(configured, 'toggle-preserve')).toBeNull();
        });

        it('returns null for unknown actions', () => {
            expect(widget.getEditorSpec(configured, 'unknown-action')).toBeNull();
        });

        it('describes the command editor as a text spec', () => {
            const spec = expectTextSpec(widget.getEditorSpec(configured, 'edit-command'));

            expect(spec.prompt).toBe('Enter command path: ');
            expect(spec.initialValue).toBe('echo hi');
            expect(spec.hint).toBeUndefined();
            expect(spec.validate).toBeUndefined();
            expect(expectTextSpec(widget.getEditorSpec(bare, 'edit-command')).initialValue).toBe('');
            expect(spec.commit(configured, 'date')).toEqual({ ...configured, commandPath: 'date' });
        });

        it('describes the width editor as a number spec', () => {
            const spec = expectNumberSpec(widget.getEditorSpec(configured, 'edit-width'));

            expect(spec.prompt).toBe('Enter max width (blank for no limit): ');
            expect(spec.initialValue).toBe('20');
            expect(expectNumberSpec(widget.getEditorSpec(bare, 'edit-width')).initialValue).toBe('');
        });

        it('sets the max width on commit and removes it when cleared', () => {
            const spec = expectNumberSpec(widget.getEditorSpec(configured, 'edit-width'));

            expect(spec.commit(configured, 40)).toEqual({ ...configured, maxWidth: 40 });
            expect(spec.commit(configured, null)).not.toHaveProperty('maxWidth');
            expect(spec.commit(configured, 0)).not.toHaveProperty('maxWidth');
            expect(spec.commit(configured, null)).toEqual({
                id: 'cmd',
                type: 'custom-command',
                commandPath: 'echo hi',
                timeout: 2500,
                preserveColors: true
            });
        });

        it('describes the timeout editor as a number spec defaulting to 1000', () => {
            const spec = expectNumberSpec(widget.getEditorSpec(configured, 'edit-timeout'));

            expect(spec.prompt).toBe('Enter timeout in milliseconds (default 1000): ');
            expect(spec.initialValue).toBe('2500');
            expect(expectNumberSpec(widget.getEditorSpec(bare, 'edit-timeout')).initialValue).toBe('1000');
        });

        it('sets the timeout on commit and removes it for zero or blank input', () => {
            const spec = expectNumberSpec(widget.getEditorSpec(configured, 'edit-timeout'));

            expect(spec.commit(configured, 500)).toEqual({ ...configured, timeout: 500 });
            expect(spec.commit(configured, 0)).not.toHaveProperty('timeout');
            expect(spec.commit(configured, null)).not.toHaveProperty('timeout');
            expect(spec.commit(configured, 0)).toEqual({
                id: 'cmd',
                type: 'custom-command',
                commandPath: 'echo hi',
                maxWidth: 20,
                preserveColors: true
            });
        });
    });
});
