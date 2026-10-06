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
import {
    getVisibleText,
    getVisibleWidth
} from '../ansi';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLine,
    renderStatusLineWithInfo,
    type RenderResult
} from '../renderer';

interface RendererCase {
    mode: string;
    overrides: Partial<Settings>;
}

const RENDERER_CASES: RendererCase[] = [
    { mode: 'regular', overrides: {} },
    {
        mode: 'powerline',
        overrides: {
            powerline: {
                ...DEFAULT_SETTINGS.powerline,
                enabled: true,
                separators: [''],
                separatorInvertBackground: [false],
                theme: 'nord-aurora'
            }
        }
    }
];

function createSettings(overrides: Partial<Settings> = {}): Settings {
    return {
        ...DEFAULT_SETTINGS,
        flexMode: 'full',
        colorLevel: 3,
        ...overrides,
        powerline: {
            ...DEFAULT_SETTINGS.powerline,
            ...(overrides.powerline ?? {})
        }
    };
}

function renderWithInfo(
    widgets: WidgetItem[],
    settingsOverrides: Partial<Settings>,
    context: RenderContext
): RenderResult {
    const settings = createSettings(settingsOverrides);
    const preRenderedLines = preRenderAllWidgets([widgets], settings, context);
    const preCalculatedMaxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);

    return renderStatusLineWithInfo(widgets, settings, context, preRenderedLines[0] ?? [], preCalculatedMaxWidths);
}

// Current Working Dir with segments renders paths like '.../project'.
const ELLIPSIS_CONTENT: WidgetItem = { id: 'cwd', type: 'custom-text', customText: '.../project' };
const LONG_CONTENT: WidgetItem = {
    id: 'long',
    type: 'custom-text',
    customText: 'abcdefghijklmnopqrstuvwxyz1234567890'
};
// Full flex mode reserves six columns, so a 20-column terminal renders 14.
const EXACT_FIT_CONTENT: WidgetItem = { id: 'fit', type: 'custom-text', customText: 'abcdefghijklmn' };

describe.each(RENDERER_CASES)('renderStatusLineWithInfo truncation signal ($mode)', ({ overrides }) => {
    it('does not report truncation when the content itself contains an ellipsis', () => {
        const result = renderWithInfo([ELLIPSIS_CONTENT], overrides, { isPreview: false, terminalWidth: 100 });

        expect(getVisibleText(result.line)).toContain('.../project');
        expect(result.wasTruncated).toBe(false);
    });

    it('reports truncation when the line had to be shortened to the terminal width', () => {
        const result = renderWithInfo([LONG_CONTENT], overrides, { isPreview: false, terminalWidth: 20 });

        expect(result.wasTruncated).toBe(true);
        expect(result.line.endsWith('...')).toBe(true);
        expect(getVisibleWidth(result.line)).toBe(14);
    });

    it('does not report truncation for a line that exactly fills the available width', () => {
        const result = renderWithInfo([EXACT_FIT_CONTENT], overrides, { isPreview: false, terminalWidth: 20 });

        expect(getVisibleWidth(result.line)).toBe(14);
        expect(result.wasTruncated).toBe(false);
    });

    it('does not report truncation when the terminal width is unknown', () => {
        // A width of 0 is how the renderer is told that detection failed.
        const result = renderWithInfo([LONG_CONTENT], overrides, { isPreview: false, terminalWidth: 0 });

        expect(getVisibleText(result.line)).toContain(LONG_CONTENT.customText);
        expect(result.wasTruncated).toBe(false);
    });

    it('returns the same line as renderStatusLine', () => {
        const settings = createSettings(overrides);
        const context: RenderContext = { isPreview: false, terminalWidth: 20 };
        const preRenderedLines = preRenderAllWidgets([[LONG_CONTENT]], settings, context);
        const preCalculatedMaxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);
        const preRenderedWidgets = preRenderedLines[0] ?? [];

        const withInfo = renderStatusLineWithInfo([LONG_CONTENT], settings, context, preRenderedWidgets, preCalculatedMaxWidths);
        const plain = renderStatusLine([LONG_CONTENT], settings, context, preRenderedWidgets, preCalculatedMaxWidths);

        expect(withInfo.line).toBe(plain);
    });
});

describe('renderStatusLineWithInfo and per-widget clipping', () => {
    it('does not report per-widget maxWidth clipping as line truncation', () => {
        // Preview mode never runs the command; preserveColors routes the widget
        // through the renderer's own maxWidth clipping (which adds no ellipsis).
        const widget: WidgetItem = {
            id: 'cmd',
            type: 'custom-command',
            commandPath: 'echo hello',
            preserveColors: true,
            maxWidth: 5
        };

        const result = renderWithInfo([widget], {}, { isPreview: true, terminalWidth: 100 });

        expect(getVisibleWidth(result.line)).toBe(5);
        expect(result.wasTruncated).toBe(false);
    });

    it('does not mistake an ellipsis rendered by the widget itself for line truncation', () => {
        // The preview label shortens long command paths with its own '...'.
        const widget: WidgetItem = {
            id: 'cmd',
            type: 'custom-command',
            commandPath: '/usr/local/bin/some-long-script.sh'
        };

        const result = renderWithInfo([widget], {}, { isPreview: true, terminalWidth: 100 });

        expect(getVisibleText(result.line)).toContain('...');
        expect(result.wasTruncated).toBe(false);
    });
});
