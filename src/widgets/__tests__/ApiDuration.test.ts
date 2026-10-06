import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    RenderContext,
    WidgetItem
} from '../../types';
import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../types/Settings';
import { ApiDurationWidget } from '../ApiDuration';

const ITEM: WidgetItem = { id: 'api-duration', type: 'api-duration' };

// Values from scripts/payload.example.json: 2300 ms of API time in a 45000 ms session (5.1%)
const PAYLOAD_CONTEXT: RenderContext = { data: { cost: { total_duration_ms: 45000, total_api_duration_ms: 2300 } } };

function render(item: WidgetItem = ITEM, context: RenderContext = PAYLOAD_CONTEXT, settings: Settings = DEFAULT_SETTINGS): string | null {
    return new ApiDurationWidget().render(item, context, settings);
}

function apiContext(apiDurationMs: number, totalDurationMs?: number): RenderContext {
    return { data: { cost: { total_api_duration_ms: apiDurationMs, total_duration_ms: totalDurationMs } } };
}

describe('ApiDurationWidget', () => {
    describe('metadata', () => {
        it('has the documented display name, description, and category', () => {
            const widget = new ApiDurationWidget();

            expect(widget.getDisplayName()).toBe('API Time');
            expect(widget.getDescription()).toBe('Shows time spent waiting on the API this session');
            expect(widget.getCategory()).toBe('Session');
        });

        it('defaults to yellow and supports raw values, colors, and number formats', () => {
            const widget = new ApiDurationWidget();

            expect(widget.getDefaultColor()).toBe('yellow');
            expect(widget.supportsRawValue()).toBe(true);
            expect(widget.supportsColors(ITEM)).toBe(true);
            expect(widget.supportsNumberFormat()).toBe(true);
        });

        it('declares the zero hideable state', () => {
            expect(new ApiDurationWidget().getHideableStates()).toEqual([
                { key: 'zero', label: 'when API time is zero' }
            ]);
        });
    });

    describe('render()', () => {
        it('renders the API duration from status JSON', () => {
            expect(render()).toBe('API: 2.3s');
        });

        it('drops the label in raw value mode', () => {
            expect(render({ ...ITEM, rawValue: true })).toBe('2.3s');
        });

        it('renders the share of the session spent on the API in percent format', () => {
            expect(render({ ...ITEM, metadata: { format: 'percent' } })).toBe('API: 5.1%');
            expect(render({ ...ITEM, rawValue: true, metadata: { format: 'percent' } })).toBe('5.1%');
        });

        it('renders duration and percent together in both format', () => {
            expect(render({ ...ITEM, metadata: { format: 'both' } })).toBe('API: 2.3s (5.1%)');
            expect(render({ ...ITEM, rawValue: true, metadata: { format: 'both' } })).toBe('2.3s (5.1%)');
        });

        it('treats an unknown format as duration', () => {
            expect(render({ ...ITEM, metadata: { format: 'bogus' } })).toBe('API: 2.3s');
        });

        it.each([
            { ms: 0, expected: '0.0s' },
            { ms: 500, expected: '0.5s' },
            { ms: 59940, expected: '59.9s' },
            { ms: 59950, expected: '1m 0s' },
            { ms: 138000, expected: '2m 18s' },
            { ms: 3599400, expected: '59m 59s' },
            { ms: 3600000, expected: '1hr 0m' },
            { ms: 3720000, expected: '1hr 2m' },
            { ms: 7380000, expected: '2hr 3m' }
        ])('formats $ms ms as $expected', ({ ms, expected }) => {
            expect(render({ ...ITEM, rawValue: true }, apiContext(ms, 7200000))).toBe(expected);
        });

        it('formats the percent with the item number format', () => {
            expect(render({ ...ITEM, metadata: { format: 'percent' }, numberFormat: { style: 'compact' } })).toBe('API: 5.1%');
            expect(render({ ...ITEM, metadata: { format: 'percent' }, numberFormat: { style: 'whole' } })).toBe('API: 5%');
            expect(render({ ...ITEM, metadata: { format: 'percent' }, numberFormat: { decimals: 2 } })).toBe('API: 5.11%');
            expect(render({ ...ITEM, metadata: { format: 'both' }, numberFormat: { style: 'whole' } })).toBe('API: 2.3s (5%)');
        });

        it('lets the global percent format win over the item format', () => {
            const settings: Settings = { ...DEFAULT_SETTINGS, numberFormat: { percent: { style: 'whole' } } };

            expect(render({ ...ITEM, metadata: { format: 'percent' }, numberFormat: { decimals: 2 } }, PAYLOAD_CONTEXT, settings)).toBe('API: 5%');
        });

        it('leaves the duration untouched by the number format', () => {
            expect(render({ ...ITEM, numberFormat: { style: 'whole' } })).toBe('API: 2.3s');
        });

        it('omits the percent when the session duration is missing or zero', () => {
            expect(render({ ...ITEM, metadata: { format: 'both' } }, apiContext(2300))).toBe('API: 2.3s');
            expect(render({ ...ITEM, metadata: { format: 'both' } }, apiContext(2300, 0))).toBe('API: 2.3s');
            expect(render({ ...ITEM, metadata: { format: 'percent' } }, apiContext(2300))).toBe('API: 2.3s');
            expect(render({ ...ITEM, rawValue: true, metadata: { format: 'percent' } }, apiContext(2300, 0))).toBe('2.3s');
        });

        it('renders nothing when cost data is missing', () => {
            expect(render(ITEM, {})).toBeNull();
            expect(render(ITEM, { data: {} })).toBeNull();
            expect(render(ITEM, { data: { cost: { total_cost_usd: 1 } } })).toBeNull();
        });

        it('renders nothing when the API duration is missing or invalid', () => {
            expect(render(ITEM, { data: { cost: { total_duration_ms: 45000 } } })).toBeNull();
            expect(render({ ...ITEM, metadata: { format: 'percent' } }, { data: { cost: { total_duration_ms: 45000 } } })).toBeNull();
            expect(render(ITEM, apiContext(-1, 45000))).toBeNull();
            expect(render(ITEM, apiContext(Number.NaN, 45000))).toBeNull();
        });

        it('renders a zero duration by default', () => {
            expect(render(ITEM, apiContext(0, 45000))).toBe('API: 0.0s');
            expect(render({ ...ITEM, metadata: { format: 'both' } }, apiContext(0, 45000))).toBe('API: 0.0s (0.0%)');
        });

        it('hides zero API time only when the zero hide state is enabled', () => {
            const hideZero: WidgetItem = { ...ITEM, metadata: { hide: 'zero' } };

            expect(render(hideZero, apiContext(0, 45000))).toBeNull();
            expect(render({ ...hideZero, metadata: { ...hideZero.metadata, format: 'percent' } }, apiContext(0, 45000))).toBeNull();
            expect(render(hideZero, PAYLOAD_CONTEXT)).toBe('API: 2.3s');
        });

        it('treats API time that displays as 0.0s as zero', () => {
            const hideZero: WidgetItem = { ...ITEM, metadata: { hide: 'zero' } };

            expect(render(hideZero, apiContext(40, 45000))).toBeNull();
            expect(render(hideZero, apiContext(50, 45000))).toBe('API: 0.1s');
        });

        it('renders the sample values in preview mode', () => {
            expect(render(ITEM, { isPreview: true })).toBe('API: 2m 18s');
            expect(render({ ...ITEM, rawValue: true }, { isPreview: true })).toBe('2m 18s');
            expect(render({ ...ITEM, metadata: { format: 'percent' } }, { isPreview: true })).toBe('API: 9.1%');
            expect(render({ ...ITEM, metadata: { format: 'both' } }, { isPreview: true })).toBe('API: 2m 18s (9.1%)');
        });

        it('formats the preview percent with the selected number format', () => {
            expect(render({ ...ITEM, metadata: { format: 'percent' }, numberFormat: { style: 'whole' } }, { isPreview: true })).toBe('API: 9%');
            expect(render({ ...ITEM, metadata: { format: 'both' }, numberFormat: { style: 'whole' } }, { isPreview: true })).toBe('API: 2m 18s (9%)');
        });

        it('ignores live data and the zero hide state in preview mode', () => {
            expect(render({ ...ITEM, metadata: { hide: 'zero' } }, { ...apiContext(0, 45000), isPreview: true })).toBe('API: 2m 18s');
        });
    });

    describe('editor', () => {
        it('offers the format cycle keybind without binding h', () => {
            const widget = new ApiDurationWidget();
            const expected = [
                { key: 'f', label: '(f)ormat: duration/percent/both', action: 'cycle-format' }
            ];

            expect(widget.getCustomKeybinds(ITEM)).toEqual(expected);
            expect(widget.getCustomKeybinds()).toEqual(expected);
            expect(widget.getCustomKeybinds({ ...ITEM, metadata: { format: 'both' } }).map(keybind => keybind.key)).not.toContain('h');
        });

        it('cycles duration -> percent -> both -> duration', () => {
            const widget = new ApiDurationWidget();
            const percent = widget.handleEditorAction('cycle-format', ITEM);
            const both = widget.handleEditorAction('cycle-format', percent ?? ITEM);
            const duration = widget.handleEditorAction('cycle-format', both ?? ITEM);

            expect(percent?.metadata?.format).toBe('percent');
            expect(both?.metadata?.format).toBe('both');
            expect(duration?.metadata).toBeUndefined();
        });

        it('keeps other metadata when cycling back to duration', () => {
            const duration = new ApiDurationWidget().handleEditorAction('cycle-format', {
                ...ITEM,
                metadata: { format: 'both', hide: 'zero' }
            });

            expect(duration?.metadata).toEqual({ hide: 'zero' });
        });

        it('ignores unknown editor actions', () => {
            expect(new ApiDurationWidget().handleEditorAction('toggle-nerd-font', ITEM)).toBeNull();
        });

        it('shows the format in the editor display only when it is not duration', () => {
            const widget = new ApiDurationWidget();

            expect(widget.getEditorDisplay(ITEM).displayText).toBe('API Time');
            expect(widget.getEditorDisplay(ITEM).modifierText).toBeUndefined();
            expect(widget.getEditorDisplay({ ...ITEM, metadata: { format: 'percent' } })).toEqual({
                displayText: 'API Time',
                modifierText: '(percent)'
            });
            expect(widget.getEditorDisplay({ ...ITEM, metadata: { format: 'both' } })).toEqual({
                displayText: 'API Time',
                modifierText: '(both)'
            });
        });
    });
});
