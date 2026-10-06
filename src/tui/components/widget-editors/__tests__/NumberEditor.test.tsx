import { render } from 'ink';
import React from 'react';
import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { WidgetItem } from '../../../../types/Widget';
import type { NumberEditorSpec } from '../../../../types/WidgetEditorSpec';
import {
    KEYS,
    createInkHarness
} from '../../../__tests__/ink-harness';
import { NumberEditor } from '../NumberEditor';

function renderNumberEditor(specOverrides: Partial<NumberEditorSpec> = {}) {
    const harness = createInkHarness();
    const widget: WidgetItem = { id: 'branch', type: 'git-branch', maxWidth: 12 };
    const commit = vi.fn((item: WidgetItem, value: number | null): WidgetItem => {
        if (value === null) {
            const { maxWidth, ...rest } = item;
            return rest;
        }

        return { ...item, maxWidth: value };
    });
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const spec: NumberEditorSpec = {
        kind: 'number',
        prompt: 'Enter max width (blank for no limit): ',
        initialValue: '',
        commit,
        ...specOverrides
    };
    const instance = render(
        <NumberEditor widget={widget} spec={spec} onComplete={onComplete} onCancel={onCancel} />,
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

describe('NumberEditor', () => {
    it('renders the prompt verbatim, the pre-filled value and the default help line', async () => {
        const editor = renderNumberEditor({ initialValue: '12' });

        try {
            await editor.harness.flush();

            const output = editor.harness.plainOutput();
            expect(output).toContain('Enter max width (blank for no limit): 12');
            expect(output).toContain('Press Enter to save, ESC to cancel');
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('commits null when Enter is pressed on blank input', async () => {
        const editor = renderNumberEditor();

        try {
            await editor.harness.flush();
            await editor.harness.press(KEYS.enter);

            expect(editor.commit).toHaveBeenCalledWith(editor.widget, null);
            expect(editor.onComplete).toHaveBeenCalledWith({ id: 'branch', type: 'git-branch' });
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('commits the typed digits as a number', async () => {
        const editor = renderNumberEditor();

        try {
            await editor.harness.flush();
            await editor.harness.press('1', '2', KEYS.enter);

            expect(editor.commit).toHaveBeenCalledWith(editor.widget, 12);
            expect(editor.onComplete).toHaveBeenCalledWith({ ...editor.widget, maxWidth: 12 });
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('accepts digits only and removes the last digit on Backspace', async () => {
        const editor = renderNumberEditor({ initialValue: '7' });

        try {
            await editor.harness.flush();
            await editor.harness.press('a', KEYS.backspace, '9', '.', KEYS.enter);

            expect(editor.commit).toHaveBeenCalledWith(editor.widget, 9);
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('shows the spec help text together with the min/max range', async () => {
        const editor = renderNumberEditor({
            prompt: 'Enter window in seconds: ',
            initialValue: '0',
            help: '0 disables window mode and averages the full session.',
            min: 0,
            max: 120
        });

        try {
            await editor.harness.flush();

            const output = editor.harness.plainOutput();
            expect(output).toContain('Enter window in seconds: 0');
            expect(output).toContain('0 disables window mode and averages the full session.');
            expect(output).toContain('Range: 0-120.');
            expect(output).not.toContain('Press Enter to save');
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('cancels without committing on ESC', async () => {
        const editor = renderNumberEditor({ initialValue: '3' });

        try {
            await editor.harness.flush();
            await editor.harness.press('4', KEYS.escape);

            expect(editor.onCancel).toHaveBeenCalledOnce();
            expect(editor.commit).not.toHaveBeenCalled();
            expect(editor.onComplete).not.toHaveBeenCalled();
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });
});
