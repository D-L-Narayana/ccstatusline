import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { getVisibleText } from '../ansi';
import { getColorAnsiCode } from '../colors';
import { renderLines } from '../render-lines';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLine
} from '../renderer';

interface LineIndices {
    globalSeparatorIndex: number;
    globalPowerlineThemeIndex: number;
    globalPowerlineStartCapIndex: number;
}

const FIRST_LINE_INDICES: LineIndices = {
    globalSeparatorIndex: 0,
    globalPowerlineThemeIndex: 0,
    globalPowerlineStartCapIndex: 0
};

function createSettings(overrides: Partial<Settings> = {}): Settings {
    return {
        ...DEFAULT_SETTINGS,
        ...overrides,
        powerline: {
            ...DEFAULT_SETTINGS.powerline,
            ...(overrides.powerline ?? {})
        }
    };
}

function text(id: string, customText: string): WidgetItem {
    return { id, type: 'custom-text', customText };
}

const SEPARATOR: WidgetItem = { id: 'sep', type: 'separator' };

// Mirrors the per-line calls the entry point makes, with the cross-line index
// state passed in explicitly.
function renderLineManually(
    settings: Settings,
    context: RenderContext,
    lineIndex: number,
    indices: LineIndices
): string {
    const preRenderedLines = preRenderAllWidgets(settings.lines, settings, context);
    const preCalculatedMaxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);

    return renderStatusLine(
        settings.lines[lineIndex] ?? [],
        settings,
        { ...context, lineIndex, ...indices },
        preRenderedLines[lineIndex] ?? [],
        preCalculatedMaxWidths
    );
}

function visibleLines(settings: Settings, context: RenderContext): string[] {
    return renderLines(settings, context).map(entry => getVisibleText(entry.line));
}

describe('renderLines', () => {
    const previewContext: RenderContext = { isPreview: true, terminalWidth: 100 };

    it('renders only the configured lines that produce visible text and keeps their indices', () => {
        const settings = createSettings({
            lines: [
                [{ id: 'model', type: 'model' }, SEPARATOR, text('tail', 'tail')],
                [],
                [text('solo', 'second line')]
            ]
        });

        const rendered = renderLines(settings, previewContext);

        expect(rendered.map(entry => entry.index)).toEqual([0, 2]);
        expect(rendered.map(entry => getVisibleText(entry.line))).toEqual([
            'Model: Claude | tail',
            'second line'
        ]);
        expect(rendered.map(entry => entry.wasTruncated)).toEqual([false, false]);
    });

    it('produces exactly the strings the renderer returns for each line', () => {
        const settings = createSettings({
            lines: [
                [{ id: 'model', type: 'model' }, SEPARATOR, text('tail', 'tail')],
                [],
                [text('solo', 'second line')]
            ]
        });

        const rendered = renderLines(settings, previewContext);

        expect(rendered[0]?.line).toBe(renderLineManually(settings, previewContext, 0, FIRST_LINE_INDICES));
        // Line 0 renders one separator slot (model | tail), so line 2 starts at slot 1.
        expect(rendered[1]?.line).toBe(renderLineManually(settings, previewContext, 2, {
            ...FIRST_LINE_INDICES,
            globalSeparatorIndex: 1
        }));
    });

    it('omits a line whose widgets all render empty without consuming separator slots', () => {
        const settings = createSettings({
            colorLevel: 0,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: true,
                separators: ['>', ')'],
                separatorInvertBackground: [false, false]
            },
            lines: [
                [{ id: 'cost', type: 'session-cost', metadata: { hide: 'zero' } }, SEPARATOR],
                [text('a', 'A'), text('b', 'B'), text('c', 'C')],
                [text('d', 'D'), text('e', 'E')]
            ]
        });
        const context: RenderContext = { isPreview: false, terminalWidth: 100 };

        const rendered = renderLines(settings, context);

        expect(rendered.map(entry => entry.index)).toEqual([1, 2]);
        // Separator glyphs cycle from slot 0 on the first visible line and
        // continue on the next one (two slots consumed by A>B)C).
        expect(rendered.map(entry => getVisibleText(entry.line))).toEqual(['A>B)C', 'D>E']);
        expect(rendered[0]?.line).toBe(renderLineManually(settings, context, 1, FIRST_LINE_INDICES));
        // Line 1 also rendered one powerline segment, so its start cap slot is consumed too.
        expect(rendered[1]?.line).toBe(renderLineManually(settings, context, 2, {
            globalSeparatorIndex: 2,
            globalPowerlineThemeIndex: 0,
            globalPowerlineStartCapIndex: 1
        }));
    });

    it('skips a line whose visible text is blank and leaves separator state untouched, like the status line entry point', () => {
        const settings = createSettings({
            colorLevel: 0,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: true,
                separators: [' ', '>'],
                separatorInvertBackground: [false, false]
            },
            lines: [
                [text('pad1', ' '), text('pad2', ' ')],
                [text('a', 'A'), text('b', 'B')]
            ]
        });

        const rendered = renderLines(settings, { isPreview: false, terminalWidth: 100 });

        expect(rendered.map(entry => entry.index)).toEqual([1]);
        expect(getVisibleText(rendered[0]?.line ?? '')).toBe('A B');
    });

    it('continues powerline theme colors across rendered lines when enabled', () => {
        const settings = createSettings({
            colorLevel: 3,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: true,
                theme: 'nord-aurora',
                continueThemeAcrossLines: true
            },
            lines: [
                [text('one', 'one'), text('two', 'two')],
                [text('three', 'three')]
            ]
        });
        const context: RenderContext = { isPreview: false, terminalWidth: 100 };

        const rendered = renderLines(settings, context);

        expect(rendered[1]?.line).toBe(renderLineManually(settings, context, 1, {
            globalSeparatorIndex: 1,
            globalPowerlineThemeIndex: 2,
            globalPowerlineStartCapIndex: 1
        }));
        expect(rendered[1]?.line).toContain(getColorAnsiCode('hex:5E81AC', 'truecolor', true));
        expect(rendered[1]?.line).not.toContain(getColorAnsiCode('hex:BF616A', 'truecolor', true));
    });

    it('restarts powerline theme colors on every line when continuation is disabled', () => {
        const settings = createSettings({
            colorLevel: 3,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: true,
                theme: 'nord-aurora',
                continueThemeAcrossLines: false
            },
            lines: [
                [text('one', 'one'), text('two', 'two')],
                [text('three', 'three')]
            ]
        });

        const rendered = renderLines(settings, { isPreview: false, terminalWidth: 100 });

        expect(rendered[1]?.line).toContain(getColorAnsiCode('hex:BF616A', 'truecolor', true));
    });

    it('continues powerline start caps across rendered lines', () => {
        const settings = createSettings({
            colorLevel: 0,
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: true,
                separators: ['>'],
                startCaps: ['[', '{']
            },
            lines: [
                [text('a', 'A')],
                [text('b', 'B')]
            ]
        });

        expect(visibleLines(settings, { isPreview: false, terminalWidth: 100 })).toEqual(['[A', '{B']);
    });

    it('forwards the shared context to widgets and reports truncation per line', () => {
        const settings = createSettings({
            flexMode: 'full',
            lines: [
                [{ id: 'model', type: 'model' }],
                [text('long', 'abcdefghijklmnopqrstuvwxyz1234567890')]
            ]
        });
        const context: RenderContext = {
            isPreview: false,
            terminalWidth: 40,
            data: { model: { id: 'claude-test', display_name: 'Claude Opus' } }
        };

        const rendered = renderLines(settings, context);

        expect(rendered.map(entry => getVisibleText(entry.line))).toEqual([
            'Model: Claude Opus',
            'abcdefghijklmnopqrstuvwxyz1234567890'.slice(0, 31) + '...'
        ]);
        expect(rendered.map(entry => entry.wasTruncated)).toEqual([false, true]);
    });

    it('keeps the TUI graph off the render path', () => {
        const source = readFileSync(fileURLToPath(new URL('../render-lines.ts', import.meta.url)), 'utf8');

        expect(source).not.toMatch(/from '(ink|react)'/);
    });
});
