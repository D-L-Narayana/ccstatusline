import type {
    CustomKeybind,
    WidgetItem
} from '../../types/Widget';
import type { NumberEditorSpec } from '../../types/WidgetEditorSpec';
import { truncateStyledText } from '../../utils/ansi';

export const MAX_WIDTH_ACTION = 'edit-max-width';

const MAX_WIDTH_KEYBIND: CustomKeybind = {
    key: 'w',
    label: '(w)idth',
    action: MAX_WIDTH_ACTION
};

export function getMaxWidthKeybind(): CustomKeybind {
    return MAX_WIDTH_KEYBIND;
}

export function getMaxWidthModifier(item: WidgetItem): string | null {
    return item.maxWidth ? `max:${item.maxWidth}` : null;
}

// Caps a widget's rendered text to maxWidth visible columns, appending an
// ellipsis. ANSI- and OSC8-aware via truncateStyledText, so callers may pass
// already-styled text; for hyperlinked widgets prefer truncating the visible
// label before wrapping so the link target stays intact.
export function applyMaxWidth(text: string, maxWidth: number | undefined): string {
    return maxWidth && maxWidth > 0 ? truncateStyledText(text, maxWidth, { ellipsis: true }) : text;
}

// Blank, zero or unparseable input clears the limit so the field disappears
// from settings instead of being stored as 0.
export function getMaxWidthEditorSpec(item: WidgetItem): NumberEditorSpec {
    return {
        kind: 'number',
        prompt: 'Enter max width (blank for no limit): ',
        initialValue: item.maxWidth?.toString() ?? '',
        commit: (current, value) => {
            if (value !== null && value > 0) {
                return { ...current, maxWidth: value };
            }

            const { maxWidth, ...rest } = current;
            return rest;
        }
    };
}
