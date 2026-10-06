import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import type { WidgetEditorSpec } from '../types/WidgetEditorSpec';
import { renderOsc8Link } from '../utils/hyperlink';

const EDIT_URL_ACTION = 'edit-url';
const EDIT_TEXT_ACTION = 'edit-text';
const INVALID_URL_WARNING = 'URL must begin with http:// or https://';

function isValidHttpUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function toEditorMetadata(widget: WidgetItem): { url: string; text: string } {
    const url = widget.metadata?.url ?? '';
    const text = widget.metadata?.text ?? '';
    return { url, text };
}

function buildMetadata(widget: WidgetItem, urlValue: string, textValue: string): WidgetItem {
    const metadata = { ...(widget.metadata ?? {}) };
    const trimmedUrl = urlValue.trim();
    const trimmedText = textValue.trim();

    if (trimmedUrl.length > 0) {
        metadata.url = trimmedUrl;
    } else {
        delete metadata.url;
    }

    if (trimmedText.length > 0) {
        metadata.text = trimmedText;
    } else {
        delete metadata.text;
    }

    if (Object.keys(metadata).length === 0) {
        const { metadata, ...rest } = widget;
        return rest;
    }

    return {
        ...widget,
        metadata
    };
}

function getLinkLabel(item: WidgetItem): { url: string; label: string } {
    const url = item.metadata?.url?.trim() ?? '';
    const metadataText = item.metadata?.text?.trim();
    const label = metadataText && metadataText.length > 0
        ? metadataText
        : (url.length > 0 ? url : 'no url');

    return { url, label };
}

function withEmojiPrefix(label: string, rawValue?: boolean): string {
    return rawValue ? label : `🔗 ${label}`;
}

/** Live warning shown while typing a URL; blank input is acceptable (it clears the URL). */
function validateUrlInput(value: string): string | null {
    const trimmed = value.trim();
    return trimmed.length > 0 && !isValidHttpUrl(trimmed) ? INVALID_URL_WARNING : null;
}

export class LinkWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Displays a clickable terminal hyperlink using OSC 8'; }
    getDisplayName(): string { return 'Link'; }
    getCategory(): string { return 'Custom'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const { url, label } = getLinkLabel(item);
        const metadataText = item.metadata?.text?.trim();
        const hasCustomText = Boolean(metadataText && metadataText.length > 0);
        const text = withEmojiPrefix(label, item.rawValue);
        const shortUrl = hasCustomText && url.length > 0
            ? (url.length > 28 ? `${url.substring(0, 25)}...` : url)
            : null;

        return {
            displayText: `${this.getDisplayName()} (${text})`,
            modifierText: shortUrl ? `(${shortUrl})` : undefined
        };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const { url, label } = getLinkLabel(item);
        const displayText = withEmojiPrefix(label, item.rawValue);

        if (!url || !isValidHttpUrl(url)) {
            return displayText;
        }

        return renderOsc8Link(url, displayText);
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'u', label: '(u)rl', action: EDIT_URL_ACTION },
            { key: 'e', label: '(e)dit text', action: EDIT_TEXT_ACTION }
        ];
    }

    getEditorSpec(item: WidgetItem, action: string): WidgetEditorSpec | null {
        const { url, text } = toEditorMetadata(item);

        if (action === EDIT_URL_ACTION) {
            return {
                kind: 'text',
                prompt: 'Enter URL (http/https): ',
                initialValue: url,
                hint: `Current text: ${text.trim() || '(uses URL)'}`,
                validate: validateUrlInput,
                // The other field is carried over unchanged from the item being edited
                commit: (current, value) => buildMetadata(current, value, text)
            };
        }

        if (action === EDIT_TEXT_ACTION) {
            return {
                kind: 'text',
                prompt: 'Enter link text (blank uses URL): ',
                initialValue: text,
                hint: `Current URL: ${url.trim() || '(none)'}`,
                commit: (current, value) => buildMetadata(current, url, value)
            };
        }

        return null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean {
        return true;
    }
}
