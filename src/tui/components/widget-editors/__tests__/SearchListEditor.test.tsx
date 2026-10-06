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
    SearchListEditorSpec,
    SearchListOption
} from '../../../../types/WidgetEditorSpec';
import {
    KEYS,
    createInkHarness
} from '../../../__tests__/ink-harness';
import { SearchListEditor } from '../SearchListEditor';

const HELP_LINE = 'Type to search, Up/Down select, Enter save, ESC cancel';

const LOCALE_OPTIONS: SearchListOption[] = [
    { value: 'en-US', displayName: 'en-US', description: 'English (United States)' },
    { value: 'en-CA', displayName: 'en-CA', description: 'English (Canada)' },
    { value: 'en-GB', displayName: 'en-GB', description: 'English (United Kingdom)' },
    { value: 'fr-FR', displayName: 'fr-FR', description: 'French (France)' },
    { value: 'de-DE', displayName: 'de-DE', description: 'German (Germany)' },
    { value: 'es-ES', displayName: 'es-ES', description: 'Spanish (Spain)' },
    { value: 'ja-JP', displayName: 'ja-JP', description: 'Japanese (Japan)' },
    { value: 'ko-KR', displayName: 'ko-KR', description: 'Korean (South Korea)' },
    { value: 'zh-CN', displayName: 'zh-CN', description: 'Chinese (China)' },
    { value: 'pt-BR', displayName: 'pt-BR', description: 'Portuguese (Brazil)' },
    { value: 'it-IT', displayName: 'it-IT', description: 'Italian (Italy)' },
    { value: 'nl-NL', displayName: 'nl-NL', description: 'Dutch (Netherlands)' }
];

function filterOptions(options: SearchListOption[], query: string): SearchListOption[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
        return options;
    }

    return options.filter(option => `${option.displayName} ${option.description}`.toLowerCase().includes(normalized));
}

function renderSearchListEditor(
    specOverrides: Partial<SearchListEditorSpec> = {},
    widget: WidgetItem = { id: 'reset', type: 'reset-timer' }
) {
    const harness = createInkHarness();
    const commit = vi.fn((item: WidgetItem, value: string): WidgetItem => {
        if (value === 'en-US') {
            const { metadata, ...rest } = item;
            return rest;
        }

        return { ...item, metadata: { ...item.metadata, locale: value } };
    });
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const spec: SearchListEditorSpec = {
        kind: 'search-list',
        title: 'Locale',
        currentLabel: 'en-US',
        initialValue: 'en-US',
        emptyMessage: 'No locales match the search.',
        getOptions: query => filterOptions(LOCALE_OPTIONS, query),
        commit,
        ...specOverrides
    };
    const instance = render(
        <SearchListEditor widget={widget} spec={spec} onComplete={onComplete} onCancel={onCancel} />,
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

describe('SearchListEditor', () => {
    it('renders the title, the current label, the search placeholder and the help line', async () => {
        const editor = renderSearchListEditor();

        try {
            await editor.harness.flush();

            const output = editor.harness.plainOutput();
            expect(output).toContain('Locale');
            expect(output).toContain('Current: en-US');
            expect(output).toContain('Search: (none)');
            expect(output).toContain(HELP_LINE);
            expect(output).toContain('en-US - English (United States)');
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('adds spacing between the list and result count', async () => {
        const editor = renderSearchListEditor();

        try {
            await editor.harness.flush();

            expect(editor.harness.plainOutput()).toMatch(/\n\nShowing \d+-\d+ of \d+/);
            expect(editor.harness.plainOutput()).toContain('Showing 1-10 of 12');
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('searches the options and saves the selected value', async () => {
        const editor = renderSearchListEditor();

        try {
            await editor.harness.flush();
            await editor.harness.press('japan');

            expect(editor.harness.plainOutput()).toContain('Search: japan');
            expect(editor.harness.stdout.getOutput()).toContain('ja-JP');

            await editor.harness.press(KEYS.enter);

            expect(editor.commit).toHaveBeenCalledWith(editor.widget, 'ja-JP');
            expect(editor.onComplete).toHaveBeenCalledWith({ ...editor.widget, metadata: { locale: 'ja-JP' } });
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('selecting the default option clears the value via commit', async () => {
        const editor = renderSearchListEditor(
            { currentLabel: 'ja-JP', initialValue: 'ja-JP' },
            { id: 'reset', type: 'reset-timer', metadata: { locale: 'ja-JP' } }
        );

        try {
            await editor.harness.flush();
            await editor.harness.press('en-us', KEYS.enter);

            expect(editor.commit).toHaveBeenCalledWith(editor.widget, 'en-US');
            expect(editor.onComplete).toHaveBeenCalledWith({ id: 'reset', type: 'reset-timer' });
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('preselects the initial value and scrolls the window to keep it visible', async () => {
        const editor = renderSearchListEditor({ currentLabel: 'ko-KR', initialValue: 'ko-KR' });

        try {
            await editor.harness.flush();

            const output = editor.harness.plainOutput();
            expect(output).toMatch(/>\s+ko-KR/);
            expect(output).toContain('Showing 3-12 of 12');

            await editor.harness.press(KEYS.enter);

            expect(editor.commit).toHaveBeenCalledWith(editor.widget, 'ko-KR');
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('wraps to the last option when pressing up on the first one', async () => {
        const editor = renderSearchListEditor({ getOptions: query => filterOptions(LOCALE_OPTIONS.slice(0, 3), query) });

        try {
            await editor.harness.flush();
            await editor.harness.press(KEYS.up, KEYS.enter);

            expect(editor.commit).toHaveBeenCalledWith(editor.widget, 'en-GB');
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('wraps to the first option when pressing down on the last one', async () => {
        const editor = renderSearchListEditor({ getOptions: query => filterOptions(LOCALE_OPTIONS.slice(0, 3), query) });

        try {
            await editor.harness.flush();
            await editor.harness.press(KEYS.down, KEYS.down, KEYS.down, KEYS.enter);

            expect(editor.commit).toHaveBeenCalledWith(editor.widget, 'en-US');
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('shows the empty message and ignores Enter when nothing matches', async () => {
        const editor = renderSearchListEditor();

        try {
            await editor.harness.flush();
            await editor.harness.press('zzz', KEYS.enter);

            expect(editor.harness.plainOutput()).toContain('No locales match the search.');
            expect(editor.commit).not.toHaveBeenCalled();
            expect(editor.onComplete).not.toHaveBeenCalled();
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('shortens the query with Backspace and resets the selection', async () => {
        const editor = renderSearchListEditor();

        try {
            await editor.harness.flush();
            await editor.harness.press('e', KEYS.down, KEYS.backspace);

            expect(editor.harness.plainOutput()).toContain('Search: (none)');

            await editor.harness.press(KEYS.enter);

            expect(editor.commit).toHaveBeenCalledWith(editor.widget, 'en-US');
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('honours maxVisible from the spec', async () => {
        const editor = renderSearchListEditor({ maxVisible: 3 });

        try {
            await editor.harness.flush();

            const output = editor.harness.plainOutput();
            expect(output).toContain('Showing 1-3 of 12');
            expect(output).not.toContain('fr-FR');
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });

    it('cancels without saving', async () => {
        const editor = renderSearchListEditor();

        try {
            await editor.harness.flush();
            await editor.harness.press('ja', KEYS.escape);

            expect(editor.onCancel).toHaveBeenCalledOnce();
            expect(editor.commit).not.toHaveBeenCalled();
            expect(editor.onComplete).not.toHaveBeenCalled();
        } finally {
            editor.harness.cleanup(editor.instance);
        }
    });
});
