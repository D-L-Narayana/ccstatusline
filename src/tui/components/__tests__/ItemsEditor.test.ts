import { render } from 'ink';
import React, { useState } from 'react';
import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../../types/Settings';
import type { WidgetItem } from '../../../types/Widget';
import {
    KEYS,
    createInkHarness
} from '../../__tests__/ink-harness';
import { ItemsEditor } from '../ItemsEditor';

function StatefulItemsEditor({ initialWidgets }: { initialWidgets: WidgetItem[] }) {
    const [widgets, setWidgets] = useState(initialWidgets);

    return React.createElement(ItemsEditor, {
        widgets,
        onUpdate: setWidgets,
        onBack: vi.fn(),
        lineNumber: 1,
        settings: DEFAULT_SETTINGS
    });
}

describe('ItemsEditor', () => {
    it('shows only non-default number styles beside the widget name', async () => {
        const harness = createInkHarness();
        const instance = render(
            React.createElement(StatefulItemsEditor, { initialWidgets: [{ id: '1', type: 'tokens-input' }] }),
            harness.renderOptions
        );

        try {
            await harness.flush();
            expect(harness.plainOutput()).toContain('1. Tokens Input');
            expect(harness.plainOutput()).not.toContain('(compact)');

            harness.stdout.clearOutput();
            await harness.press('.');
            expect(harness.plainOutput()).toContain('1. Tokens Input (compact)');

            harness.stdout.clearOutput();
            await harness.press('.');
            expect(harness.plainOutput()).toContain('1. Tokens Input (whole)');

            harness.stdout.clearOutput();
            await harness.press('.');
            expect(harness.plainOutput()).toContain('1. Tokens Input');
            expect(harness.plainOutput()).not.toContain('(compact)');
            expect(harness.plainOutput()).not.toContain('(whole)');
        } finally {
            harness.cleanup(instance);
        }
    });

    it('preserves existing widget modifiers before the number style', async () => {
        const harness = createInkHarness();
        const instance = render(
            React.createElement(ItemsEditor, {
                widgets: [{
                    id: '1',
                    type: 'cache-read',
                    metadata: { cacheScopeSession: 'true' },
                    numberFormat: { style: 'compact' }
                }],
                onUpdate: vi.fn(),
                onBack: vi.fn(),
                lineNumber: 1,
                settings: DEFAULT_SETTINGS
            }),
            harness.renderOptions
        );

        try {
            await harness.flush();
            expect(harness.plainOutput()).toContain('1. Cache Read (session) (compact)');
        } finally {
            harness.cleanup(instance);
        }
    });

    // Custom Text describes its editor through getEditorSpec, so these cover
    // the whole spec path: keybind → spec → generic editor → committed item.
    const customTextWidgets: WidgetItem[] = [{ id: '1', type: 'custom-text', customText: 'hello' }];

    it('opens the generic editor from a widget editor spec and applies the committed value', async () => {
        const harness = createInkHarness();
        const instance = render(
            React.createElement(StatefulItemsEditor, { initialWidgets: customTextWidgets }),
            harness.renderOptions
        );

        try {
            await harness.flush();
            expect(harness.plainOutput()).toContain('1. Custom Text (hello)');

            harness.stdout.clearOutput();
            await harness.press('e');
            expect(harness.plainOutput()).toContain('Enter custom text: hello');
            expect(harness.plainOutput()).not.toContain('Edit Line 1');

            await harness.press('!');
            harness.stdout.clearOutput();
            await harness.press(KEYS.enter);
            expect(harness.plainOutput()).toContain('1. Custom Text (hello!)');
            expect(harness.plainOutput()).not.toContain('Enter custom text:');
        } finally {
            harness.cleanup(instance);
        }
    });

    it('returns to the item list without changes when the spec editor is cancelled', async () => {
        const harness = createInkHarness();
        const instance = render(
            React.createElement(StatefulItemsEditor, { initialWidgets: customTextWidgets }),
            harness.renderOptions
        );

        try {
            await harness.flush();
            await harness.press('e');
            expect(harness.plainOutput()).toContain('Enter custom text: hello');

            await harness.press('X');
            expect(harness.plainOutput()).toContain('Enter custom text: helloX');

            harness.stdout.clearOutput();
            await harness.press(KEYS.escape);
            expect(harness.plainOutput()).toContain('1. Custom Text (hello)');
            expect(harness.plainOutput()).not.toContain('helloX');
            expect(harness.plainOutput()).not.toContain('Enter custom text:');
        } finally {
            harness.cleanup(instance);
        }
    });
});
