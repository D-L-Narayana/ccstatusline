import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    RenderContext,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type {
    SymbolSlotsEditorSpec,
    WidgetEditorSpec
} from '../../types/WidgetEditorSpec';
import { LinesChangedWidget } from '../LinesChanged';

const ITEM: WidgetItem = { id: 'lines-changed', type: 'lines-changed' };

function expectSymbolSlotsSpec(spec: WidgetEditorSpec | null): SymbolSlotsEditorSpec {
    expect(spec?.kind).toBe('symbol-slots');
    if (spec?.kind !== 'symbol-slots') {
        throw new Error('expected a symbol-slots editor spec');
    }

    return spec;
}

// Values from scripts/payload.example.json
const PAYLOAD_CONTEXT: RenderContext = { data: { cost: { total_lines_added: 156, total_lines_removed: 23 } } };
const ZERO_CONTEXT: RenderContext = { data: { cost: { total_lines_added: 0, total_lines_removed: 0 } } };

function render(item: WidgetItem = ITEM, context: RenderContext = PAYLOAD_CONTEXT): string | null {
    return new LinesChangedWidget().render(item, context, DEFAULT_SETTINGS);
}

describe('LinesChangedWidget', () => {
    describe('metadata', () => {
        it('has the documented display name, description, and category', () => {
            const widget = new LinesChangedWidget();

            expect(widget.getDisplayName()).toBe('Lines Changed');
            expect(widget.getDescription()).toBe('Shows lines added and removed in the current session');
            expect(widget.getCategory()).toBe('Session');
        });

        it('defaults to green and supports raw values and colors', () => {
            const widget = new LinesChangedWidget();

            expect(widget.getDefaultColor()).toBe('green');
            expect(widget.supportsRawValue()).toBe(true);
            expect(widget.supportsColors(ITEM)).toBe(true);
        });

        it('declares the zero hideable state', () => {
            expect(new LinesChangedWidget().getHideableStates()).toEqual([
                { key: 'zero', label: 'when no lines changed' }
            ]);
        });
    });

    describe('render()', () => {
        it('renders lines added and removed from status JSON', () => {
            expect(render()).toBe('Lines: +156 -23');
        });

        it('drops the label in raw value mode', () => {
            expect(render({ ...ITEM, rawValue: true })).toBe('+156 -23');
        });

        it('renders only the selected value', () => {
            expect(render({ ...ITEM, metadata: { value: 'added' } })).toBe('Lines: +156');
            expect(render({ ...ITEM, metadata: { value: 'removed' } })).toBe('Lines: -23');
            expect(render({ ...ITEM, rawValue: true, metadata: { value: 'added' } })).toBe('+156');
            expect(render({ ...ITEM, rawValue: true, metadata: { value: 'removed' } })).toBe('-23');
        });

        it('treats an unknown value mode as both', () => {
            expect(render({ ...ITEM, metadata: { value: 'bogus' } })).toBe('Lines: +156 -23');
        });

        it('renders the sample values in preview mode', () => {
            expect(render(ITEM, { isPreview: true })).toBe('Lines: +156 -23');
            expect(render({ ...ITEM, rawValue: true }, { isPreview: true })).toBe('+156 -23');
            expect(render({ ...ITEM, metadata: { value: 'added' } }, { isPreview: true })).toBe('Lines: +156');
            expect(render({ ...ITEM, metadata: { value: 'removed' } }, { isPreview: true })).toBe('Lines: -23');
        });

        it('ignores live data and the zero hide state in preview mode', () => {
            expect(render({ ...ITEM, metadata: { hide: 'zero' } }, { ...ZERO_CONTEXT, isPreview: true })).toBe('Lines: +156 -23');
        });

        it('renders nothing when cost data is missing', () => {
            expect(render(ITEM, {})).toBeNull();
            expect(render(ITEM, { data: {} })).toBeNull();
            expect(render(ITEM, { data: { cost: { total_cost_usd: 1 } } })).toBeNull();
        });

        it('renders nothing when a field needed by the selected value is missing', () => {
            const addedOnly: RenderContext = { data: { cost: { total_lines_added: 156 } } };

            expect(render(ITEM, addedOnly)).toBeNull();
            expect(render({ ...ITEM, metadata: { value: 'removed' } }, addedOnly)).toBeNull();
            expect(render({ ...ITEM, metadata: { value: 'added' } }, addedOnly)).toBe('Lines: +156');
        });

        it('renders zero counts by default', () => {
            expect(render(ITEM, ZERO_CONTEXT)).toBe('Lines: +0 -0');
        });

        it('hides zero counts only when the zero hide state is enabled', () => {
            const hideZero: WidgetItem = { ...ITEM, metadata: { hide: 'zero' } };

            expect(render(hideZero, ZERO_CONTEXT)).toBeNull();
            expect(render(hideZero, PAYLOAD_CONTEXT)).toBe('Lines: +156 -23');
            expect(render(hideZero, { data: { cost: { total_lines_added: 0, total_lines_removed: 1 } } })).toBe('Lines: +0 -1');
        });

        it('applies the zero hide state to the selected value only', () => {
            const addedOnly: RenderContext = { data: { cost: { total_lines_added: 5, total_lines_removed: 0 } } };

            expect(render({ ...ITEM, metadata: { value: 'removed', hide: 'zero' } }, addedOnly)).toBeNull();
            expect(render({ ...ITEM, metadata: { value: 'added', hide: 'zero' } }, addedOnly)).toBe('Lines: +5');
            expect(render({ ...ITEM, metadata: { value: 'removed' } }, addedOnly)).toBe('Lines: -0');
        });

        it('renders custom glyphs from the symbolAdded and symbolRemoved slots', () => {
            const glyphs: WidgetItem = { ...ITEM, metadata: { symbolAdded: '▲', symbolRemoved: '▼' } };

            expect(render(glyphs)).toBe('Lines: ▲156 ▼23');
            expect(render(glyphs, { isPreview: true })).toBe('Lines: ▲156 ▼23');
            expect(render({ ...glyphs, metadata: { ...glyphs.metadata, value: 'removed' } })).toBe('Lines: ▼23');
        });

        it('drops a glyph when its override is empty', () => {
            expect(render({ ...ITEM, metadata: { symbolAdded: '', symbolRemoved: '' } })).toBe('Lines: 156 23');
            expect(render({ ...ITEM, rawValue: true, metadata: { symbolRemoved: '' } })).toBe('+156 23');
        });
    });

    describe('editor', () => {
        it('offers the value cycle and the shared glyph keybind without binding h', () => {
            const widget = new LinesChangedWidget();
            const expected = [
                { key: 'v', label: '(v)alue: both/added/removed', action: 'cycle-value' },
                { key: 'g', label: '(g)lyph', action: 'edit-symbol-override' }
            ];

            expect(widget.getCustomKeybinds(ITEM)).toEqual(expected);
            expect(widget.getCustomKeybinds()).toEqual(expected);
            expect(widget.getCustomKeybinds({ ...ITEM, metadata: { value: 'added' } }).map(keybind => keybind.key)).not.toContain('h');
        });

        it('cycles both -> added -> removed -> both', () => {
            const widget = new LinesChangedWidget();
            const added = widget.handleEditorAction('cycle-value', ITEM);
            const removed = widget.handleEditorAction('cycle-value', added ?? ITEM);
            const both = widget.handleEditorAction('cycle-value', removed ?? ITEM);

            expect(added?.metadata?.value).toBe('added');
            expect(removed?.metadata?.value).toBe('removed');
            expect(both?.metadata).toBeUndefined();
        });

        it('keeps other metadata when cycling back to both', () => {
            const both = new LinesChangedWidget().handleEditorAction('cycle-value', {
                ...ITEM,
                metadata: { value: 'removed', symbolAdded: '▲' }
            });

            expect(both?.metadata).toEqual({ symbolAdded: '▲' });
        });

        it('leaves the glyph editor action to the editor', () => {
            expect(new LinesChangedWidget().handleEditorAction('edit-symbol-override', ITEM)).toBeNull();
        });

        it('describes the glyph editor as a symbol-slots spec for the added and removed glyphs', () => {
            const spec = expectSymbolSlotsSpec(new LinesChangedWidget().getEditorSpec(ITEM, 'edit-symbol-override'));

            expect(spec.slots).toEqual([
                { id: 'symbolAdded', label: 'Added', defaultSymbol: '+', initialValue: '+' },
                { id: 'symbolRemoved', label: 'Removed', defaultSymbol: '-', initialValue: '-' }
            ]);
        });

        it('pre-fills the glyph editor with the current overrides', () => {
            const spec = expectSymbolSlotsSpec(new LinesChangedWidget().getEditorSpec({
                ...ITEM,
                metadata: { symbolAdded: '▲', symbolRemoved: '' }
            }, 'edit-symbol-override'));

            expect(spec.slots.map(slot => slot.initialValue)).toEqual(['▲', '']);
        });

        it('commits glyph overrides to metadata and leaves defaults unstored', () => {
            const spec = expectSymbolSlotsSpec(new LinesChangedWidget().getEditorSpec(ITEM, 'edit-symbol-override'));

            expect(spec.commit(ITEM, ['▲', '-']).metadata).toEqual({ symbolAdded: '▲' });
        });

        it('returns no editor spec for other actions', () => {
            const widget = new LinesChangedWidget();

            expect(widget.getEditorSpec(ITEM, 'cycle-value')).toBeNull();
            expect(widget.getEditorSpec(ITEM, 'edit-hide-states')).toBeNull();
        });

        it('shows the value mode in the editor display only when it is not both', () => {
            const widget = new LinesChangedWidget();

            expect(widget.getEditorDisplay(ITEM).displayText).toBe('Lines Changed');
            expect(widget.getEditorDisplay(ITEM).modifierText).toBeUndefined();
            expect(widget.getEditorDisplay({ ...ITEM, metadata: { value: 'added' } })).toEqual({
                displayText: 'Lines Changed',
                modifierText: '(added)'
            });
            expect(widget.getEditorDisplay({ ...ITEM, metadata: { value: 'removed' } })).toEqual({
                displayText: 'Lines Changed',
                modifierText: '(removed)'
            });
        });
    });
});
