import {
    describe,
    expect,
    it
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import type {
    SymbolSlotsEditorSpec,
    WidgetEditorSpec
} from '../../types/WidgetEditorSpec';
import { CustomSymbolWidget } from '../CustomSymbol';

function expectSymbolSlotsSpec(spec: WidgetEditorSpec | null): SymbolSlotsEditorSpec {
    expect(spec?.kind).toBe('symbol-slots');
    if (spec?.kind !== 'symbol-slots') {
        throw new Error('expected a symbol-slots editor spec');
    }
    return spec;
}

describe('CustomSymbolWidget', () => {
    const widget = new CustomSymbolWidget();
    const configured: WidgetItem = {
        id: 'symbol',
        type: 'custom-symbol',
        color: 'yellow',
        customSymbol: '★'
    };
    const empty: WidgetItem = { id: 'symbol', type: 'custom-symbol' };

    it('renders the configured symbol and an empty string when unset', () => {
        expect(widget.render(configured, { isPreview: true }, DEFAULT_SETTINGS)).toBe('★');
        expect(widget.render(configured, {}, DEFAULT_SETTINGS)).toBe('★');
        expect(widget.render(empty, {}, DEFAULT_SETTINGS)).toBe('');
    });

    it('shows the symbol in the editor display', () => {
        expect(widget.getEditorDisplay(configured).displayText).toBe('Custom Symbol (★)');
        expect(widget.getEditorDisplay(empty).displayText).toBe('Custom Symbol (?)');
    });

    it('exposes the edit symbol keybind and the merge-target hideable state', () => {
        expect(widget.getCustomKeybinds()).toEqual([{ key: 'e', label: '(e)dit symbol', action: 'edit-symbol' }]);
        expect(widget.getHideableStates().map(state => state.key)).toEqual(['merge-target-hidden']);
    });

    it('returns null for unknown actions', () => {
        expect(widget.getEditorSpec(configured, 'unknown-action')).toBeNull();
    });

    it('describes the symbol editor as a single-slot symbol-slots spec', () => {
        const spec = expectSymbolSlotsSpec(widget.getEditorSpec(configured, 'edit-symbol'));

        expect(spec.title).toBe('Custom symbol');
        expect(spec.slots).toEqual([{
            id: 'customSymbol',
            label: 'Symbol',
            defaultSymbol: '',
            initialValue: '★'
        }]);
        expect(expectSymbolSlotsSpec(widget.getEditorSpec(empty, 'edit-symbol')).slots[0]?.initialValue).toBe('');
    });

    it('commits the first slot value as the custom symbol', () => {
        const spec = expectSymbolSlotsSpec(widget.getEditorSpec(configured, 'edit-symbol'));

        expect(spec.commit(configured, ['🚀'])).toEqual({ ...configured, customSymbol: '🚀' });
        expect(spec.commit(empty, ['★'])).toEqual({ ...empty, customSymbol: '★' });
        expect(spec.commit(configured, [''])).toEqual({ ...configured, customSymbol: '' });
        expect(spec.commit(configured, [])).toEqual({ ...configured, customSymbol: '' });
    });
});
