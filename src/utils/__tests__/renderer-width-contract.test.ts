import {
    describe,
    expect,
    it
} from 'vitest';

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
    renderLines,
    type RenderedLine
} from '../render-lines';
import { MAX_TERMINAL_WIDTH } from '../terminal';

// Columns the renderer keeps free of content in 'full' flex mode (the
// `detectedWidth - 6` in resolveEffectiveTerminalWidth): a line rendered for a
// W-column terminal is at most W - 6 columns wide.
const RESERVED_COLUMNS_FULL = 6;

// A flex separator absorbs every column the width allows, so an impossible
// width turns straight into an impossible allocation.
const FLEX_ITEMS: WidgetItem[] = [
    { id: 'left', type: 'custom-text', customText: 'Left' },
    { id: 'flex', type: 'flex-separator' },
    { id: 'right', type: 'custom-text', customText: 'Right' }
];

const LONG_TEXT = 'abcdefghijklmnopqrstuvwxyz'.repeat(4);
const LONG_ITEMS: WidgetItem[] = [{ id: 'long', type: 'custom-text', customText: LONG_TEXT }];

// 0 is the renderer's canonical "width detection failed" value. Unlike null it
// never triggers a live terminal probe, so the fallback rendering is stable.
const UNKNOWN_WIDTH = 0;

const IMPOSSIBLE_WIDTHS: { label: string; width: number }[] = [
    { label: 'Number.MAX_SAFE_INTEGER', width: Number.MAX_SAFE_INTEGER },
    { label: 'one column past MAX_TERMINAL_WIDTH', width: MAX_TERMINAL_WIDTH + 1 },
    { label: 'a fractional width', width: 80.5 },
    { label: 'a negative width', width: -1 },
    { label: 'Infinity', width: Number.POSITIVE_INFINITY }
];

const REAL_WIDTHS: { label: string; width: number }[] = [
    { label: 'an ordinary 80-column terminal', width: 80 },
    { label: 'the widest possible terminal', width: MAX_TERMINAL_WIDTH }
];

function createSettings(lines: WidgetItem[][], powerline = false): Settings {
    return {
        ...DEFAULT_SETTINGS,
        flexMode: 'full',
        colorLevel: 0,
        lines,
        powerline: {
            ...DEFAULT_SETTINGS.powerline,
            enabled: powerline,
            separators: ['>']
        }
    };
}

function renderAt(settings: Settings, terminalWidth: number): RenderedLine[] {
    return renderLines(settings, { isPreview: false, terminalWidth });
}

function visibleLines(rendered: RenderedLine[]): string[] {
    return rendered.map(entry => getVisibleText(entry.line));
}

describe.each([
    { path: 'regular', powerline: false, flexFallback: 'Left | Right' },
    { path: 'powerline', powerline: true, flexFallback: 'Left Right' }
])('renderer terminal width contract ($path path)', ({ powerline, flexFallback }) => {
    describe.each(IMPOSSIBLE_WIDTHS)('treats $label like an unknown width', ({ width }) => {
        it('renders the flex separator in its fallback form without throwing', () => {
            const settings = createSettings([FLEX_ITEMS], powerline);
            const fallback = renderAt(settings, UNKNOWN_WIDTH);
            expect(visibleLines(fallback)).toEqual([flexFallback]);

            const render = () => renderAt(settings, width);

            expect(render).not.toThrow();
            const rendered = render();
            expect(visibleLines(rendered)).toEqual(visibleLines(fallback));
            expect(rendered.map(entry => entry.wasTruncated)).toEqual([false]);
        });

        it('leaves a long line intact and reports no truncation', () => {
            const settings = createSettings([LONG_ITEMS], powerline);

            const rendered = renderAt(settings, width);

            expect(visibleLines(rendered)).toEqual([LONG_TEXT]);
            expect(rendered.map(entry => entry.wasTruncated)).toEqual([false]);
        });
    });

    describe.each(REAL_WIDTHS)('fills $label', ({ width }) => {
        it('expands the flex separator to the width minus the reserved columns', () => {
            const rendered = renderAt(createSettings([FLEX_ITEMS], powerline), width);

            expect(rendered).toHaveLength(1);
            const text = getVisibleText(rendered[0]?.line ?? '');
            // ASCII-only by construction, so the string length is the display width.
            expect(text).toMatch(/^Left +Right$/);
            expect(text.length).toBe(width - RESERVED_COLUMNS_FULL);
            expect(rendered[0]?.wasTruncated).toBe(false);
        });
    });

    // The flex case above already pins the reserved columns at the widest
    // terminal; truncating a line that long walks every cluster and is far too
    // slow for the suite, so the over-long line is checked at 80 columns.
    it('truncates an over-long line to the width minus the reserved columns', () => {
        const settings = createSettings([LONG_ITEMS], powerline);

        const rendered = renderAt(settings, 80);

        expect(rendered).toHaveLength(1);
        expect(getVisibleWidth(rendered[0]?.line ?? '')).toBe(80 - RESERVED_COLUMNS_FULL);
        expect(rendered[0]?.wasTruncated).toBe(true);
    });
});
