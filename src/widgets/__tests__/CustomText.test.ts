import {
    describe,
    expect,
    it
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import type {
    TextEditorSpec,
    WidgetEditorSpec
} from '../../types/WidgetEditorSpec';
import { CustomTextWidget } from '../CustomText';

function expectTextSpec(spec: WidgetEditorSpec | null): TextEditorSpec {
    expect(spec?.kind).toBe('text');
    if (spec?.kind !== 'text') {
        throw new Error('expected a text editor spec');
    }
    return spec;
}

describe('CustomTextWidget', () => {
    const widget = new CustomTextWidget();
    const configured: WidgetItem = {
        id: 'text',
        type: 'custom-text',
        color: 'green',
        customText: 'hello 🌍'
    };
    const empty: WidgetItem = { id: 'text', type: 'custom-text' };

    it('renders the configured text verbatim and an empty string when unset', () => {
        expect(widget.render(configured, { isPreview: true }, DEFAULT_SETTINGS)).toBe('hello 🌍');
        expect(widget.render(configured, {}, DEFAULT_SETTINGS)).toBe('hello 🌍');
        expect(widget.render(empty, {}, DEFAULT_SETTINGS)).toBe('');
    });

    it('shows the text in the editor display', () => {
        expect(widget.getEditorDisplay(configured).displayText).toBe('Custom Text (hello 🌍)');
        expect(widget.getEditorDisplay(empty).displayText).toBe('Custom Text (Empty)');
    });

    it('exposes the edit text keybind and the merge-target hideable state', () => {
        expect(widget.getCustomKeybinds()).toEqual([{ key: 'e', label: '(e)dit text', action: 'edit-text' }]);
        expect(widget.getHideableStates().map(state => state.key)).toEqual(['merge-target-hidden']);
    });

    it('returns null for unknown actions', () => {
        expect(widget.getEditorSpec(configured, 'unknown-action')).toBeNull();
    });

    it('describes the text editor as a text spec', () => {
        const spec = expectTextSpec(widget.getEditorSpec(configured, 'edit-text'));

        expect(spec.prompt).toBe('Enter custom text: ');
        expect(spec.initialValue).toBe('hello 🌍');
        expect(spec.hint).toBeUndefined();
        expect(spec.validate).toBeUndefined();
        expect(expectTextSpec(widget.getEditorSpec(empty, 'edit-text')).initialValue).toBe('');
    });

    it('commits the edited text and keeps the other fields', () => {
        const spec = expectTextSpec(widget.getEditorSpec(configured, 'edit-text'));

        expect(spec.commit(configured, 'bye')).toEqual({ ...configured, customText: 'bye' });
        expect(spec.commit(configured, '')).toEqual({ ...configured, customText: '' });
    });
});
