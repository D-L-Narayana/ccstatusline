import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import type {
    TextEditorSpec,
    WidgetEditorSpec
} from '../../types/WidgetEditorSpec';
import { LinkWidget } from '../Link';

function renderLink(
    metadata: Record<string, string> | undefined,
    isPreview = false,
    rawValue = false
): string | null {
    const widget = new LinkWidget();
    const item: WidgetItem = {
        id: 'link',
        type: 'link',
        metadata,
        rawValue
    };
    const context: RenderContext = { isPreview };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

function expectTextSpec(spec: WidgetEditorSpec | null): TextEditorSpec {
    expect(spec?.kind).toBe('text');
    if (spec?.kind !== 'text') {
        throw new Error('expected a text editor spec');
    }
    return spec;
}

describe('LinkWidget', () => {
    it('renders OSC 8 hyperlink for valid http URL', () => {
        const result = renderLink({
            url: 'https://example.com/docs',
            text: 'Docs'
        });

        expect(result).toBe('\x1b]8;;https://example.com/docs\x1b\\🔗 Docs\x1b]8;;\x1b\\');
    });

    it('uses URL as display text when metadata.text is missing', () => {
        const result = renderLink({ url: 'https://example.com/docs' });

        expect(result).toBe('\x1b]8;;https://example.com/docs\x1b\\🔗 https://example.com/docs\x1b]8;;\x1b\\');
    });

    it('falls back to plain text for non-http URL schemes', () => {
        const result = renderLink({
            url: 'file:///tmp/report.txt',
            text: 'Report'
        });

        expect(result).toBe('🔗 Report');
    });

    it('shows default placeholder when URL and text are missing', () => {
        const result = renderLink(undefined);

        expect(result).toBe('🔗 no url');
    });

    it('renders preview text exactly like final visible output when unconfigured', () => {
        const result = renderLink(undefined, true);
        expect(result).toBe('🔗 no url');
    });

    it('renders preview text exactly like final visible output when configured', () => {
        const result = renderLink({
            url: 'https://example.com/docs',
            text: 'Docs'
        }, true);
        expect(result).toBe('\x1b]8;;https://example.com/docs\x1b\\🔗 Docs\x1b]8;;\x1b\\');
    });

    it('renders preview hyperlink in raw mode with emoji hidden', () => {
        const result = renderLink({
            url: 'https://example.com/docs',
            text: 'Docs'
        }, true, true);
        expect(result).toBe('\x1b]8;;https://example.com/docs\x1b\\Docs\x1b]8;;\x1b\\');
    });

    it('hides emoji in raw mode while preserving hyperlink behavior', () => {
        const result = renderLink({
            url: 'https://example.com/docs',
            text: 'Docs'
        }, false, true);

        expect(result).toBe('\x1b]8;;https://example.com/docs\x1b\\Docs\x1b]8;;\x1b\\');
    });

    it('shows raw placeholder without emoji when unconfigured', () => {
        const result = renderLink(undefined, false, true);
        expect(result).toBe('no url');
    });

    it('exposes edit URL and edit text keybinds', () => {
        const widget = new LinkWidget();
        const keybinds = widget.getCustomKeybinds();

        expect(keybinds).toEqual([
            { key: 'u', label: '(u)rl', action: 'edit-url' },
            { key: 'e', label: '(e)dit text', action: 'edit-text' }
        ]);
    });

    it('returns editor display with text and short url', () => {
        const widget = new LinkWidget();
        const display = widget.getEditorDisplay({
            id: 'link',
            type: 'link',
            metadata: {
                url: 'https://example.com/docs',
                text: 'Docs'
            }
        });

        expect(display.displayText).toBe('Link (🔗 Docs)');
        expect(display.modifierText).toBe('(https://example.com/docs)');
    });

    it('omits duplicate no-url modifier when unconfigured in raw mode', () => {
        const widget = new LinkWidget();
        const display = widget.getEditorDisplay({
            id: 'link',
            type: 'link',
            rawValue: true
        });

        expect(display.displayText).toBe('Link (no url)');
        expect(display.modifierText).toBeUndefined();
    });

    it('omits duplicate url modifier when raw mode label is the URL', () => {
        const widget = new LinkWidget();
        const display = widget.getEditorDisplay({
            id: 'link',
            type: 'link',
            rawValue: true,
            metadata: { url: 'https://google.com' }
        });

        expect(display.displayText).toBe('Link (https://google.com)');
        expect(display.modifierText).toBeUndefined();
    });

    it('supports colors and raw value mode', () => {
        const widget = new LinkWidget();
        const item: WidgetItem = { id: 'link', type: 'link' };

        expect(widget.supportsColors(item)).toBe(true);
        expect(widget.supportsRawValue()).toBe(true);
    });
});

describe('LinkWidget editor specs', () => {
    const widget = new LinkWidget();
    const configured: WidgetItem = {
        id: 'link',
        type: 'link',
        color: 'cyan',
        metadata: {
            url: 'https://example.com/docs',
            text: 'Docs'
        }
    };
    const empty: WidgetItem = { id: 'link', type: 'link' };

    it('returns null for unknown actions', () => {
        expect(widget.getEditorSpec(configured, 'unknown-action')).toBeNull();
    });

    it('describes the URL editor as a text spec showing the current text', () => {
        const spec = expectTextSpec(widget.getEditorSpec(configured, 'edit-url'));

        expect(spec.prompt).toBe('Enter URL (http/https): ');
        expect(spec.initialValue).toBe('https://example.com/docs');
        expect(spec.hint).toBe('Current text: Docs');

        const emptySpec = expectTextSpec(widget.getEditorSpec(empty, 'edit-url'));
        expect(emptySpec.initialValue).toBe('');
        expect(emptySpec.hint).toBe('Current text: (uses URL)');
    });

    it('warns about URLs that are not http or https while editing', () => {
        const spec = expectTextSpec(widget.getEditorSpec(configured, 'edit-url'));

        expect(spec.validate?.('ftp://x')).toBe('URL must begin with http:// or https://');
        expect(spec.validate?.('not a url')).toBe('URL must begin with http:// or https://');
        expect(spec.validate?.('https://example.com')).toBeNull();
        expect(spec.validate?.(' http://example.com ')).toBeNull();
        expect(spec.validate?.('')).toBeNull();
        expect(spec.validate?.('   ')).toBeNull();
    });

    it('commits the URL while preserving the existing text', () => {
        const spec = expectTextSpec(widget.getEditorSpec(configured, 'edit-url'));

        expect(spec.commit(configured, 'https://example.org/guide')).toEqual({
            ...configured,
            metadata: { url: 'https://example.org/guide', text: 'Docs' }
        });
        expect(spec.commit(configured, '  https://example.org/guide  ').metadata?.url).toBe('https://example.org/guide');
    });

    it('clears the URL when committed blank', () => {
        const spec = expectTextSpec(widget.getEditorSpec(configured, 'edit-url'));

        expect(spec.commit(configured, '')).toEqual({ ...configured, metadata: { text: 'Docs' } });

        // With no text left either, the metadata object disappears entirely
        const urlOnly: WidgetItem = { ...empty, metadata: { url: 'https://example.com' } };
        expect(expectTextSpec(widget.getEditorSpec(urlOnly, 'edit-url')).commit(urlOnly, '   ')).not.toHaveProperty('metadata');
    });

    it('describes the text editor as a text spec showing the current URL', () => {
        const spec = expectTextSpec(widget.getEditorSpec(configured, 'edit-text'));

        expect(spec.prompt).toBe('Enter link text (blank uses URL): ');
        expect(spec.initialValue).toBe('Docs');
        expect(spec.hint).toBe('Current URL: https://example.com/docs');
        expect(spec.validate).toBeUndefined();

        const emptySpec = expectTextSpec(widget.getEditorSpec(empty, 'edit-text'));
        expect(emptySpec.initialValue).toBe('');
        expect(emptySpec.hint).toBe('Current URL: (none)');
    });

    it('commits the text while preserving the existing URL', () => {
        const spec = expectTextSpec(widget.getEditorSpec(configured, 'edit-text'));

        expect(spec.commit(configured, 'Guide')).toEqual({
            ...configured,
            metadata: { url: 'https://example.com/docs', text: 'Guide' }
        });
        expect(spec.commit(configured, '')).toEqual({ ...configured, metadata: { url: 'https://example.com/docs' } });

        const emptySpec = expectTextSpec(widget.getEditorSpec(empty, 'edit-text'));
        expect(emptySpec.commit(empty, 'Guide')).toEqual({ ...empty, metadata: { text: 'Guide' } });
        expect(emptySpec.commit(empty, '')).not.toHaveProperty('metadata');
    });
});
