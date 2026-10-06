import { render } from 'ink';
import React from 'react';
import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { WidgetItem } from '../../../../types/Widget';
import type { TextEditorSpec } from '../../../../types/WidgetEditorSpec';
import {
    KEYS,
    createInkHarness
} from '../../../__tests__/ink-harness';
import { TextEditor } from '../TextEditor';

const HELP_LINE = '←→ move cursor, Ctrl+←→ jump to start/end, Enter save, ESC cancel';
// Thumbs up + medium skin tone: one grapheme, four UTF-16 code units.
const THUMBS_UP = '\u{1F44D}\u{1F3FD}';

function renderTextEditor(specOverrides: Partial<TextEditorSpec> = {}) {
    const harness = createInkHarness();
    const widget: WidgetItem = { id: 'text', type: 'custom-text', customText: 'before' };
    const commit = vi.fn((item: WidgetItem, value: string): WidgetItem => ({ ...item, customText: value }));
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const spec: TextEditorSpec = {
        kind: 'text',
        prompt: 'Enter custom text: ',
        initialValue: '',
        commit,
        ...specOverrides
    };
    const instance = render(
        <TextEditor widget={widget} spec={spec} onComplete={onComplete} onCancel={onCancel} />,
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

describe('TextEditor', () => {
    it('renders the prompt, the initial value, the cursor and the help line', async () => {
        const editor = renderTextEditor({ initialValue: 'hello' });

        try {
            await editor.harness.flush();

            expect(editor.harness.plainOutput()).toContain('Enter custom text: hello');
            // ink re-serializes inline SGR codes, so the reset may come back as
            // a full reset or as inverse-off.
            expect(editor.harness.stdout.getOutput()).toMatch(/\x1b\[7m \x1b\[(?:0|27)m/);
            expect(editor.harness.plainOutput()).toContain(HELP_LINE);
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('commits the edited text through the spec on Enter', async () => {
        const editor = renderTextEditor({ initialValue: 'abc' });

        try {
            await editor.harness.flush();
            await editor.harness.press('d', KEYS.enter);

            expect(editor.commit).toHaveBeenCalledWith(editor.widget, 'abcd');
            expect(editor.onComplete).toHaveBeenCalledWith({ ...editor.widget, customText: 'abcd' });
            expect(editor.onCancel).not.toHaveBeenCalled();
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('moves the cursor by grapheme and inserts at the cursor', async () => {
        const editor = renderTextEditor({ initialValue: `a${THUMBS_UP}b` });

        try {
            await editor.harness.flush();
            await editor.harness.press(KEYS.left, KEYS.left, 'X', KEYS.enter);

            expect(editor.commit).toHaveBeenCalledWith(editor.widget, `aX${THUMBS_UP}b`);
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('highlights the grapheme under the cursor with inverse video', async () => {
        const editor = renderTextEditor({ initialValue: 'ab' });

        try {
            await editor.harness.flush();
            await editor.harness.press(KEYS.left);

            expect(editor.harness.stdout.getOutput()).toMatch(/\x1b\[7mb\x1b\[(?:0|27)m/);
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('deletes whole graphemes with Backspace and Delete', async () => {
        const editor = renderTextEditor({ initialValue: `a${THUMBS_UP}b` });

        try {
            await editor.harness.flush();
            await editor.harness.press(KEYS.backspace, KEYS.left, KEYS.delete, KEYS.enter);

            expect(editor.commit).toHaveBeenCalledWith(editor.widget, 'a');
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('jumps to the start and end of the text with Ctrl+arrows', async () => {
        const editor = renderTextEditor({ initialValue: 'abc' });

        try {
            await editor.harness.flush();
            await editor.harness.press(KEYS.ctrlLeft, 'X', KEYS.ctrlRight, 'Y', KEYS.enter);

            expect(editor.commit).toHaveBeenCalledWith(editor.widget, 'XabcY');
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('shows the hint line when the spec provides one', async () => {
        const editor = renderTextEditor({ hint: 'Current URL: https://example.com' });

        try {
            await editor.harness.flush();

            expect(editor.harness.plainOutput()).toContain('Current URL: https://example.com');
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('shows the validate warning for an invalid value and still allows saving', async () => {
        const warning = 'URL must begin with http:// or https://';
        const editor = renderTextEditor({
            initialValue: 'ftp://x',
            validate: value => (value.startsWith('http') ? null : warning)
        });

        try {
            await editor.harness.flush();
            expect(editor.harness.plainOutput()).toContain(warning);

            await editor.harness.press(KEYS.enter);

            expect(editor.commit).toHaveBeenCalledWith(editor.widget, 'ftp://x');
            expect(editor.onComplete).toHaveBeenCalledTimes(1);
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('hides the warning while validate returns null', async () => {
        const warning = 'URL must begin with http:// or https://';
        const editor = renderTextEditor({
            initialValue: 'https://example.com',
            validate: value => (value.startsWith('http') ? null : warning)
        });

        try {
            await editor.harness.flush();

            expect(editor.harness.plainOutput()).toContain('Enter custom text: https://example.com');
            expect(editor.harness.plainOutput()).not.toContain(warning);
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('cancels without committing on ESC', async () => {
        const editor = renderTextEditor({ initialValue: 'abc' });

        try {
            await editor.harness.flush();
            await editor.harness.press('d', KEYS.escape);

            expect(editor.onCancel).toHaveBeenCalledOnce();
            expect(editor.commit).not.toHaveBeenCalled();
            expect(editor.onComplete).not.toHaveBeenCalled();
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });
});
