import { render } from 'ink';
import React from 'react';
import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { WidgetItem } from '../../../../types/Widget';
import type {
    SymbolSlotSpec,
    SymbolSlotsEditorSpec
} from '../../../../types/WidgetEditorSpec';
import {
    KEYS,
    createInkHarness
} from '../../../__tests__/ink-harness';
import { SymbolSlotsEditor } from '../SymbolSlotsEditor';

const MULTI_SLOT_HELP = '↑↓ row, type to set, Tab default, Backspace none, Enter save, ESC cancel';
const SINGLE_SLOT_HELP = 'Type any character or emoji, Tab default, Backspace none, Enter save, ESC cancel';
// Thumbs up + medium skin tone: one grapheme, four UTF-16 code units.
const THUMBS_UP = '\u{1F44D}\u{1F3FD}';

const gitStatusSlots: SymbolSlotSpec[] = [
    { id: 'symbolConflicts', label: 'Conflicts', defaultSymbol: '!', initialValue: '!' },
    { id: 'symbolStaged', label: 'Staged', defaultSymbol: '+', initialValue: '+' },
    { id: 'symbolUnstaged', label: 'Unstaged', defaultSymbol: '*', initialValue: '*' },
    { id: 'symbolUntracked', label: 'Untracked', defaultSymbol: '?', initialValue: '?' }
];

function renderSymbolSlotsEditor(specOverrides: Partial<SymbolSlotsEditorSpec> = {}) {
    const harness = createInkHarness();
    const widget: WidgetItem = { id: 'git-status', type: 'git-status' };
    const commit = vi.fn((item: WidgetItem, values: string[]): WidgetItem => ({
        ...item,
        metadata: { symbols: values.join(',') }
    }));
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const spec: SymbolSlotsEditorSpec = {
        kind: 'symbol-slots',
        title: 'Glyphs',
        slots: gitStatusSlots,
        commit,
        ...specOverrides
    };
    const instance = render(
        <SymbolSlotsEditor widget={widget} spec={spec} onComplete={onComplete} onCancel={onCancel} />,
        harness.renderOptions
    );

    return {
        harness,
        instance,
        widget,
        commit,
        onComplete,
        onCancel
    };
}

describe('SymbolSlotsEditor', () => {
    it('right-aligns labels so glyph values start in the same column', async () => {
        const editor = renderSymbolSlotsEditor();

        try {
            await editor.harness.flush();

            const lines = editor.harness.plainOutput()
                .split('\n')
                .filter(line => gitStatusSlots.some(slot => line.includes(`${slot.label}:`)));
            const colonColumns = lines.map(line => line.indexOf(':'));

            expect(lines).toHaveLength(gitStatusSlots.length);
            expect(new Set(colonColumns)).toHaveLength(1);
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('resets the selected slot to default on Tab', async () => {
        const slots = gitStatusSlots.map((slot, index) => (index === 0 ? { ...slot, initialValue: 'x' } : slot));
        const editor = renderSymbolSlotsEditor({ slots });

        try {
            await editor.harness.flush();
            expect(editor.harness.plainOutput()).toContain('Conflicts: x');

            await editor.harness.press(KEYS.tab, KEYS.enter);

            expect(editor.commit).toHaveBeenCalledWith(editor.widget, ['!', '+', '*', '?']);
            expect(editor.onComplete).toHaveBeenCalledWith({ ...editor.widget, metadata: { symbols: '!,+,*,?' } });
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('keeps only the first grapheme of typed input', async () => {
        const editor = renderSymbolSlotsEditor();

        try {
            await editor.harness.flush();
            await editor.harness.press('ab', KEYS.enter);

            expect(editor.commit).toHaveBeenCalledWith(editor.widget, ['a', '+', '*', '?']);
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('stores a multi-code-unit emoji as one symbol', async () => {
        const editor = renderSymbolSlotsEditor();

        try {
            await editor.harness.flush();
            await editor.harness.press(THUMBS_UP, KEYS.enter);

            expect(editor.commit).toHaveBeenCalledWith(editor.widget, [THUMBS_UP, '+', '*', '?']);
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('clears the selected slot with Backspace', async () => {
        const editor = renderSymbolSlotsEditor();

        try {
            await editor.harness.flush();
            await editor.harness.press(KEYS.backspace);
            expect(editor.harness.plainOutput()).toContain('Conflicts: (none)');

            await editor.harness.press(KEYS.enter);

            expect(editor.commit).toHaveBeenCalledWith(editor.widget, ['', '+', '*', '?']);
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('moves between rows with the arrow keys and wraps around', async () => {
        const editor = renderSymbolSlotsEditor();

        try {
            await editor.harness.flush();
            await editor.harness.press(KEYS.down, 'Z', KEYS.up, KEYS.up, 'Q', KEYS.enter);

            expect(editor.commit).toHaveBeenCalledWith(editor.widget, ['!', 'Z', '*', 'Q']);
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('renders the title, the defaults and the multi-slot help text', async () => {
        const editor = renderSymbolSlotsEditor();

        try {
            await editor.harness.flush();

            const output = editor.harness.plainOutput();
            expect(output).toContain('Glyphs');
            expect(output).toContain('(default: !)');
            expect(output).toContain(MULTI_SLOT_HELP);
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('uses the single-slot help text and ignores row navigation for one slot', async () => {
        const editor = renderSymbolSlotsEditor({
            title: 'Custom symbol',
            slots: [{ id: 'customSymbol', label: 'Symbol', defaultSymbol: '', initialValue: '' }]
        });

        try {
            await editor.harness.flush();

            const output = editor.harness.plainOutput();
            expect(output).toContain('Custom symbol');
            expect(output).toContain(SINGLE_SLOT_HELP);
            expect(output).not.toContain(MULTI_SLOT_HELP);

            await editor.harness.press(KEYS.down, 'Z', KEYS.enter);

            expect(editor.commit).toHaveBeenCalledWith(editor.widget, ['Z']);
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('cancels without saving', async () => {
        const editor = renderSymbolSlotsEditor();

        try {
            await editor.harness.flush();
            await editor.harness.press('Z', KEYS.escape);

            expect(editor.onCancel).toHaveBeenCalledOnce();
            expect(editor.commit).not.toHaveBeenCalled();
            expect(editor.onComplete).not.toHaveBeenCalled();
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });
});
