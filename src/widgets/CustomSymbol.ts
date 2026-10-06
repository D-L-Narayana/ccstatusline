import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import type { WidgetEditorSpec } from '../types/WidgetEditorSpec';

import { MERGE_TARGET_HIDDEN_HIDEABLE_STATE } from './shared/hideable';

const EDIT_SYMBOL_ACTION = 'edit-symbol';

export class CustomSymbolWidget implements Widget {
    getDefaultColor(): string { return 'white'; }
    getDescription(): string { return 'Displays a custom symbol or emoji (single character)'; }
    getDisplayName(): string { return 'Custom Symbol'; }
    getCategory(): string { return 'Custom'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const symbol = item.customSymbol ?? '?';
        return { displayText: `${this.getDisplayName()} (${symbol})` };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        return item.customSymbol ?? '';
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [{
            key: 'e',
            label: '(e)dit symbol',
            action: EDIT_SYMBOL_ACTION
        }];
    }

    // The actual hiding happens in the renderer, which resolves the merge
    // target's rendered output (see applyMergeTargetHiding)
    getHideableStates(): HideableState[] {
        return [MERGE_TARGET_HIDDEN_HIDEABLE_STATE];
    }

    getEditorSpec(item: WidgetItem, action: string): WidgetEditorSpec | null {
        if (action !== EDIT_SYMBOL_ACTION) {
            return null;
        }

        // A single slot with no default: Tab/Backspace both clear the symbol
        return {
            kind: 'symbol-slots',
            title: 'Custom symbol',
            slots: [{
                id: 'customSymbol',
                label: 'Symbol',
                defaultSymbol: '',
                initialValue: item.customSymbol ?? ''
            }],
            commit: (current, values) => ({ ...current, customSymbol: values[0] ?? '' })
        };
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
