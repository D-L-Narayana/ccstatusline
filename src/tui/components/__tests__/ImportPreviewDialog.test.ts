import { render } from 'ink';
import { PassThrough } from 'node:stream';
import React from 'react';
import stripAnsi from 'strip-ansi';
import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../../types/Settings';
import {
    ImportPreviewDialog,
    getImportPreviewKeys,
    getImportPreviewSettings
} from '../ImportPreviewDialog';

class MockTtyStream extends PassThrough {
    isTTY = true;
    columns = 120;
    rows = 40;

    setRawMode() {
        return this;
    }

    ref() {
        return this;
    }

    unref() {
        return this;
    }
}

interface CapturedWriteStream extends NodeJS.WriteStream {
    clearOutput: () => void;
    getOutput: () => string;
}

function createMockStdin(): NodeJS.ReadStream {
    return new MockTtyStream() as unknown as NodeJS.ReadStream;
}

function createMockStdout(): CapturedWriteStream {
    const stream = new MockTtyStream();
    const chunks: string[] = [];

    stream.on('data', (chunk: Buffer | string) => {
        chunks.push(chunk.toString());
    });

    return Object.assign(stream as unknown as NodeJS.WriteStream, {
        clearOutput() {
            chunks.length = 0;
        },
        getOutput() {
            return stripAnsi(chunks.join(''));
        }
    });
}

function flushInk() {
    return new Promise(resolve => setTimeout(resolve, 25));
}

/**
 * Polls until `check` holds or the timeout elapses, then yields once more so
 * ink can attach the input handlers of any component mounted by the update.
 * The assertions that follow still fail with their normal message if the
 * expected state never arrives.
 */
async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!check() && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    await flushInk();
}

type ImportPreviewDialogProps = Parameters<typeof ImportPreviewDialog>[0];

function renderDialog(props: ImportPreviewDialogProps) {
    const stdin = createMockStdin();
    const stdout = createMockStdout();
    const stderr = createMockStdout();
    const instance = render(React.createElement(ImportPreviewDialog, props), {
        stdin,
        stdout,
        stderr,
        debug: true,
        exitOnCtrlC: false,
        patchConsole: false
    });

    /** The most recent full frame written by ink's debug renderer. */
    const lastFrame = (): string => {
        const output = stdout.getOutput();
        return output.slice(output.lastIndexOf('Import Preview'));
    };

    return {
        stdin,
        stdout,
        lastFrame,
        /** Waits until the latest frame contains `text` (see waitFor). */
        waitForFrame: (text: string): Promise<void> => waitFor(() => lastFrame().includes(text)),
        cleanup() {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    };
}

const SHELL_COMMAND_IMPORT: Settings = {
    ...DEFAULT_SETTINGS,
    lines: [
        [
            { id: '1', type: 'model' },
            { id: '2', type: 'custom-command', commandPath: 'git status --short' }
        ],
        [{ id: '3', type: 'link', metadata: { url: 'https://example.com/board', text: 'Board' } }],
        []
    ]
};

const HYPERLINK_ONLY_IMPORT: Settings = {
    ...DEFAULT_SETTINGS,
    lines: [
        [{ id: '1', type: 'link', metadata: { url: 'https://example.com/docs' } }],
        [],
        []
    ]
};

function validImport(data: Settings, presentKeys: (keyof Settings)[]): ImportPreviewDialogProps['validation'] {
    return { status: 'valid', data, presentKeys };
}

describe('ImportPreviewDialog helpers', () => {
    it('includes optional settings that exist only in the imported config', () => {
        const current: Settings = { ...DEFAULT_SETTINGS };
        const imported: Settings = {
            ...DEFAULT_SETTINGS,
            defaultSeparator: ' | ',
            overrideForegroundColor: 'green'
        };

        expect('defaultSeparator' in current).toBe(false);
        expect('overrideForegroundColor' in current).toBe(false);
        expect(getImportPreviewKeys(current, imported)).toEqual(
            expect.arrayContaining(['defaultSeparator', 'overrideForegroundColor'])
        );
    });

    it('previews only explicitly imported fields in merge mode', () => {
        const current: Settings = {
            ...DEFAULT_SETTINGS,
            flexMode: 'full',
            lines: [[{ id: 'custom', type: 'model' }]]
        };
        const validation = {
            status: 'valid' as const,
            data: { ...DEFAULT_SETTINGS, globalBold: true },
            presentKeys: ['version', 'globalBold'] as (keyof Settings)[]
        };

        const preview = getImportPreviewSettings(current, validation, 'merge');

        expect(preview.globalBold).toBe(true);
        expect(preview.flexMode).toBe('full');
        expect(preview.lines).toEqual(current.lines);
    });

    it('updates the dynamic preview when merge mode is highlighted', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const current: Settings = {
            ...DEFAULT_SETTINGS,
            flexMode: 'full-minus-40'
        };
        const instance = render(React.createElement(ImportPreviewDialog, {
            validation: {
                status: 'valid',
                data: { ...DEFAULT_SETTINGS, globalBold: true },
                presentKeys: ['version', 'globalBold']
            },
            currentSettings: current,
            onApply: () => undefined,
            onCancel: () => undefined
        }), {
            stdin,
            stdout,
            stderr,
            debug: true,
            exitOnCtrlC: false,
            patchConsole: false
        });

        try {
            await waitFor(() => stdout.getOutput().includes('flexMode: full-minus-40 → full'));
            expect(stdout.getOutput()).toContain('flexMode: full-minus-40 → full');

            stdout.clearOutput();
            stdin.write('\u001B[B');
            await waitFor(() => {
                const output = stdout.getOutput();
                return output.slice(output.lastIndexOf('flexMode:')).split('\n')[0] === 'flexMode: full-minus-40';
            });

            const output = stdout.getOutput();
            const lastFlexModeRow = output.slice(output.lastIndexOf('flexMode:')).split('\n')[0];
            expect(lastFlexModeRow).toBe('flexMode: full-minus-40');
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
});

describe('ImportPreviewDialog risk review', () => {
    it('lists shell commands and hyperlinks for review below the diff', async () => {
        const dialog = renderDialog({
            validation: validImport(SHELL_COMMAND_IMPORT, ['version', 'lines']),
            currentSettings: { ...DEFAULT_SETTINGS },
            onApply: vi.fn(),
            onCancel: vi.fn()
        });

        try {
            await dialog.waitForFrame('Replace All');

            const frame = dialog.lastFrame();
            expect(frame).toContain('Review before applying');
            expect(frame).toContain('line 1 · Custom Command · git status --short');
            expect(frame).toContain('line 2 · Link · https://example.com/board');

            const reviewIndex = frame.indexOf('Review before applying');
            expect(reviewIndex).toBeGreaterThan(frame.indexOf('Changes that will be applied:'));
            expect(reviewIndex).toBeLessThan(frame.indexOf('Replace All'));
        } finally {
            dialog.cleanup();
        }
    });

    it('asks for confirmation before applying a config that runs shell commands', async () => {
        const onApply = vi.fn();
        const dialog = renderDialog({
            validation: validImport(SHELL_COMMAND_IMPORT, ['version', 'lines']),
            currentSettings: { ...DEFAULT_SETTINGS },
            onApply,
            onCancel: vi.fn()
        });

        try {
            await dialog.waitForFrame('Replace All');
            dialog.stdin.write('\r');
            await dialog.waitForFrame('Apply anyway?');

            expect(onApply).not.toHaveBeenCalled();
            const confirmFrame = dialog.lastFrame();
            expect(confirmFrame).toContain('This configuration runs 1 shell command(s) on every status line refresh. Apply anyway?');
            expect(confirmFrame).toContain('Yes');
            expect(confirmFrame).toContain('No');

            dialog.stdin.write('\r');
            await waitFor(() => onApply.mock.calls.length > 0);

            expect(onApply).toHaveBeenCalledTimes(1);
            expect(onApply).toHaveBeenCalledWith('replace');
        } finally {
            dialog.cleanup();
        }
    });

    it('counts every shell command in the confirmation message', async () => {
        const onApply = vi.fn();
        const twoCommands: Settings = {
            ...DEFAULT_SETTINGS,
            lines: [
                [{ id: '1', type: 'custom-command', commandPath: 'echo one' }],
                [{ id: '2', type: 'custom-command', commandPath: 'echo two' }],
                []
            ]
        };
        const dialog = renderDialog({
            validation: validImport(twoCommands, ['version', 'lines']),
            currentSettings: { ...DEFAULT_SETTINGS },
            onApply,
            onCancel: vi.fn()
        });

        try {
            await dialog.waitForFrame('Replace All');
            dialog.stdin.write('\r');
            await dialog.waitForFrame('Apply anyway?');

            expect(onApply).not.toHaveBeenCalled();
            expect(dialog.lastFrame()).toContain('runs 2 shell command(s)');
        } finally {
            dialog.cleanup();
        }
    });

    it('returns to the highlighted mode without applying when the confirmation is declined', async () => {
        const onApply = vi.fn();
        const onCancel = vi.fn();
        const dialog = renderDialog({
            validation: validImport(SHELL_COMMAND_IMPORT, ['version', 'lines']),
            currentSettings: { ...DEFAULT_SETTINGS },
            onApply,
            onCancel
        });

        try {
            await dialog.waitForFrame('Replace All');
            // Highlight Merge, then choose it.
            dialog.stdin.write('\u001B[B');
            await dialog.waitForFrame('▶  Merge');
            dialog.stdin.write('\r');
            await dialog.waitForFrame('Apply anyway?');
            expect(onApply).not.toHaveBeenCalled();

            // Move to "No" and decline.
            dialog.stdin.write('\u001B[B');
            await dialog.waitForFrame('▶  No');
            dialog.stdin.write('\r');
            await dialog.waitForFrame('▶  Merge');

            const frame = dialog.lastFrame();
            expect(frame).not.toContain('Apply anyway?');
            expect(frame).toContain('▶  Merge');
            expect(frame).toContain('Replace All');
            expect(onApply).not.toHaveBeenCalled();
            expect(onCancel).not.toHaveBeenCalled();
        } finally {
            dialog.cleanup();
        }
    });

    it('applies immediately when the imported config has no risks', async () => {
        const onApply = vi.fn();
        const dialog = renderDialog({
            validation: validImport({ ...DEFAULT_SETTINGS, globalBold: true }, ['version', 'globalBold']),
            currentSettings: { ...DEFAULT_SETTINGS },
            onApply,
            onCancel: vi.fn()
        });

        try {
            await dialog.waitForFrame('Replace All');
            expect(dialog.stdout.getOutput()).not.toContain('Review before applying');

            dialog.stdin.write('\r');
            await waitFor(() => onApply.mock.calls.length > 0);

            expect(onApply).toHaveBeenCalledTimes(1);
            expect(onApply).toHaveBeenCalledWith('replace');
            expect(dialog.stdout.getOutput()).not.toContain('Apply anyway?');
        } finally {
            dialog.cleanup();
        }
    });

    it('lists hyperlinks for review but applies them without a confirmation step', async () => {
        const onApply = vi.fn();
        const dialog = renderDialog({
            validation: validImport(HYPERLINK_ONLY_IMPORT, ['version', 'lines']),
            currentSettings: { ...DEFAULT_SETTINGS },
            onApply,
            onCancel: vi.fn()
        });

        try {
            await dialog.waitForFrame('Replace All');
            expect(dialog.lastFrame()).toContain('line 1 · Link · https://example.com/docs');

            dialog.stdin.write('\r');
            await waitFor(() => onApply.mock.calls.length > 0);

            expect(onApply).toHaveBeenCalledTimes(1);
            expect(onApply).toHaveBeenCalledWith('replace');
            expect(dialog.stdout.getOutput()).not.toContain('Apply anyway?');
        } finally {
            dialog.cleanup();
        }
    });
});
