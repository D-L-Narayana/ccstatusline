import { render } from 'ink';
import React from 'react';
import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { WidgetItem } from '../../../../types/Widget';
import type { WidgetEditorSpec } from '../../../../types/WidgetEditorSpec';
import {
    KEYS,
    createInkHarness
} from '../../../__tests__/ink-harness';
import { WidgetEditorHost } from '../WidgetEditorHost';

const widget: WidgetItem = { id: 'host', type: 'custom-text' };

function renderHost(spec: WidgetEditorSpec) {
    const harness = createInkHarness();
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const instance = render(
        <WidgetEditorHost widget={widget} spec={spec} onComplete={onComplete} onCancel={onCancel} />,
        harness.renderOptions
    );

    return {
        harness,
        instance,
        onComplete,
        onCancel
    };
}

describe('WidgetEditorHost', () => {
    it('renders the text editor for a text spec', async () => {
        const host = renderHost({
            kind: 'text',
            prompt: 'Enter custom text: ',
            initialValue: 'hello',
            commit: (item, value) => ({ ...item, customText: value })
        });

        try {
            await host.harness.flush();

            const output = host.harness.plainOutput();
            expect(output).toContain('Enter custom text: hello');
            expect(output).toContain('←→ move cursor, Ctrl+←→ jump to start/end, Enter save, ESC cancel');
        } finally {
            host.harness.cleanup(host.instance);
        }
    });

    it('renders the number editor for a number spec', async () => {
        const host = renderHost({
            kind: 'number',
            prompt: 'Enter max width (blank for no limit): ',
            initialValue: '12',
            commit: (item, value) => (value === null ? item : { ...item, maxWidth: value })
        });

        try {
            await host.harness.flush();

            const output = host.harness.plainOutput();
            expect(output).toContain('Enter max width (blank for no limit): 12');
            expect(output).toContain('Press Enter to save, ESC to cancel');
        } finally {
            host.harness.cleanup(host.instance);
        }
    });

    it('renders the symbol slots editor for a symbol-slots spec', async () => {
        const host = renderHost({
            kind: 'symbol-slots',
            title: 'Glyphs',
            slots: [{ id: 'character', label: 'Glyph', defaultSymbol: '⎇', initialValue: '★' }],
            commit: (item, values) => ({ ...item, character: values[0] ?? '' })
        });

        try {
            await host.harness.flush();

            const output = host.harness.plainOutput();
            expect(output).toContain('Glyphs');
            expect(output).toContain('Glyph: ★');
            expect(output).toContain('Tab default, Backspace none');
        } finally {
            host.harness.cleanup(host.instance);
        }
    });

    it('renders the search list editor for a search-list spec', async () => {
        const host = renderHost({
            kind: 'search-list',
            title: 'Timezone',
            currentLabel: 'UTC',
            initialValue: 'UTC',
            emptyMessage: 'No timezones match the search.',
            getOptions: () => [{ value: 'UTC', displayName: 'UTC', description: 'Default UTC reset timestamp' }],
            commit: (item, value) => ({ ...item, metadata: { timezone: value } })
        });

        try {
            await host.harness.flush();

            const output = host.harness.plainOutput();
            expect(output).toContain('Timezone');
            expect(output).toContain('Current: UTC');
            expect(output).toContain('Type to search, Up/Down select, Enter save, ESC cancel');
        } finally {
            host.harness.cleanup(host.instance);
        }
    });

    it('passes the committed widget from the hosted editor to onComplete', async () => {
        const host = renderHost({
            kind: 'number',
            prompt: 'Enter max width (blank for no limit): ',
            initialValue: '5',
            commit: (item, value) => (value === null ? item : { ...item, maxWidth: value })
        });

        try {
            await host.harness.flush();
            await host.harness.press(KEYS.enter);

            expect(host.onComplete).toHaveBeenCalledWith({ ...widget, maxWidth: 5 });
            expect(host.onCancel).not.toHaveBeenCalled();
        } finally {
            host.harness.cleanup(host.instance);
        }
    });

    it('forwards cancellation from the hosted editor', async () => {
        const host = renderHost({
            kind: 'text',
            prompt: 'Enter custom text: ',
            initialValue: '',
            commit: (item, value) => ({ ...item, customText: value })
        });

        try {
            await host.harness.flush();
            await host.harness.press(KEYS.escape);

            expect(host.onCancel).toHaveBeenCalledOnce();
            expect(host.onComplete).not.toHaveBeenCalled();
        } finally {
            host.harness.cleanup(host.instance);
        }
    });
});
