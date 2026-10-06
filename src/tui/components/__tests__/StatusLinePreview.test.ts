import { render } from 'ink';
import { PassThrough } from 'node:stream';
import React from 'react';
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
import type { WidgetItem } from '../../../types/Widget';
import {
    getVisibleText,
    getVisibleWidth
} from '../../../utils/ansi';
import { renderOsc8Link } from '../../../utils/hyperlink';
import {
    StatusLinePreview,
    preparePreviewLineForTerminal
} from '../StatusLinePreview';

class MockTtyStream extends PassThrough {
    isTTY = true;
    columns = 160;
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

interface CapturedWriteStream extends NodeJS.WriteStream { getOutput: () => string }

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
        getOutput() {
            return chunks.join('');
        }
    });
}

function flushInk() {
    return new Promise((resolve) => {
        setTimeout(resolve, 25);
    });
}

interface PreviewRenderOptions {
    lines: WidgetItem[][];
    terminalWidth: number;
    settings: Settings;
    onTruncationChange?: (isTruncated: boolean) => void;
}

// Mounts the preview, waits for Ink to paint and returns the raw frame output.
async function renderPreview(options: PreviewRenderOptions): Promise<string> {
    const stdin = createMockStdin();
    const stdout = createMockStdout();
    const stderr = createMockStdout();
    const instance = render(
        React.createElement(StatusLinePreview, options),
        {
            stdin,
            stdout,
            stderr,
            debug: true,
            exitOnCtrlC: false,
            patchConsole: false
        }
    );

    try {
        await flushInk();
        return stdout.getOutput();
    } finally {
        instance.unmount();
        instance.cleanup();
        stdin.destroy();
        stdout.destroy();
        stderr.destroy();
    }
}

function customText(id: string, text: string): WidgetItem {
    return { id, type: 'custom-text', customText: text };
}

describe('StatusLinePreview render pipeline', () => {
    it('skips blank lines without consuming separator slots, like the status line output', async () => {
        // Powerline separators cycle per rendered slot. A first line whose
        // visible text is blank is not printed by the status line, so it must
        // not advance the cycle either: the second line keeps the ' ' glyph.
        const settings: Settings = {
            ...DEFAULT_SETTINGS,
            colorLevel: 0,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: true,
                separators: [' ', '>'],
                separatorInvertBackground: [false, false]
            }
        };
        const lines: WidgetItem[][] = [
            [customText('pad1', ' '), customText('pad2', ' ')],
            [customText('a', 'A'), customText('b', 'B')]
        ];

        const output = getVisibleText(await renderPreview({ lines, terminalWidth: 160, settings }));

        expect(output).toContain('A B');
        expect(output).not.toContain('A>B');
    });

    it('does not report truncation for content that merely contains an ellipsis', async () => {
        const onTruncationChange = vi.fn();
        const settings: Settings = { ...DEFAULT_SETTINGS, colorLevel: 0, flexMode: 'full' };
        const lines: WidgetItem[][] = [[customText('cwd', 'cwd: .../project')]];

        await renderPreview({ lines, terminalWidth: 160, settings, onTruncationChange });

        expect(onTruncationChange).toHaveBeenCalledWith(false);
        expect(onTruncationChange).not.toHaveBeenCalledWith(true);
    });

    it('reports truncation when a rendered line is wider than the terminal', async () => {
        const onTruncationChange = vi.fn();
        const settings: Settings = { ...DEFAULT_SETTINGS, colorLevel: 0, flexMode: 'full' };
        const lines: WidgetItem[][] = [[customText('long', 'abcdefghijklmnopqrstuvwxyz1234567890')]];

        await renderPreview({ lines, terminalWidth: 20, settings, onTruncationChange });

        expect(onTruncationChange).toHaveBeenCalledWith(true);
    });
});

describe('StatusLinePreview helpers', () => {
    it('strips OSC links and clamps preview lines to the terminal width', () => {
        const line = `${renderOsc8Link(
            'https://github.com/owner/repo/pull/42',
            'PR #42'
        )} OPEN ${'Example PR title '.repeat(8)}`;

        const prepared = preparePreviewLineForTerminal(line, 40);

        expect(prepared).not.toContain('github.com');
        expect(prepared.endsWith('...')).toBe(true);
        expect(getVisibleWidth(`  ${prepared}`)).toBeLessThanOrEqual(40);
    });

    it('keeps parens dim scoped in the Ink preview when global bold is active', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const settings: Settings = {
            ...DEFAULT_SETTINGS,
            colorLevel: 3,
            globalBold: true,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: true,
                theme: 'custom',
                separators: ['\uE0B0'],
                separatorInvertBackground: [false]
            }
        };
        const lines: WidgetItem[][] = [[
            {
                id: 'w1',
                type: 'custom-text',
                customText: 'Cache Hit: 87.0%',
                color: 'hex:282C34',
                backgroundColor: 'hex:61AFEF'
            },
            {
                id: 'w2',
                type: 'custom-text',
                customText: 'Cache Read: 12k (64.0%)',
                color: 'hex:ABB2BF',
                backgroundColor: 'hex:3E4452',
                dim: 'parens'
            },
            {
                id: 'w3',
                type: 'custom-text',
                customText: 'Cache Write: 3k (16.0%)',
                color: 'hex:282C34',
                backgroundColor: 'hex:98C379'
            }
        ]];

        const instance = render(
            React.createElement(StatusLinePreview, {
                lines,
                terminalWidth: 160,
                settings
            }),
            {
                stdin,
                stdout,
                stderr,
                debug: true,
                exitOnCtrlC: false,
                patchConsole: false
            }
        );

        try {
            await flushInk();
            const output = stdout.getOutput();
            const dimIndex = output.indexOf('\x1b[2m(64.0%)');
            const resetIndex = output.indexOf('\x1b[22;1m', dimIndex);
            const nextWidgetIndex = output.indexOf('Cache Write');

            expect(dimIndex).toBeGreaterThanOrEqual(0);
            expect(resetIndex).toBeGreaterThan(dimIndex);
            expect(resetIndex).toBeLessThan(nextWidgetIndex);
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
});
