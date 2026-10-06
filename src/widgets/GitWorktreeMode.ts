import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import type { WidgetEditorSpec } from '../types/WidgetEditorSpec';

import {
    SYMBOL_OVERRIDE_ACTION,
    getSymbol,
    getSymbolKeybind,
    getSymbolOverrideEditorSpec
} from './shared/symbol-override';

const DEFAULT_SYMBOL = '⎇';

export class GitWorktreeModeWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows indicator when Claude Code is in worktree mode'; }
    getDisplayName(): string { return 'Git Worktree Mode'; }
    getCategory(): string { return 'Git'; }

    getEditorDisplay(_item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const worktree = context.isPreview ? true : context.data?.worktree;
        const isInWorktree = worktree !== undefined && worktree !== null;

        if (item.rawValue) {
            return isInWorktree ? 'true' : 'false';
        }

        if (!isInWorktree) {
            return null;
        }

        const symbol = getSymbol(item, DEFAULT_SYMBOL);
        return symbol.length > 0 ? symbol : null;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [getSymbolKeybind()];
    }

    getEditorSpec(item: WidgetItem, action: string): WidgetEditorSpec | null {
        if (action !== SYMBOL_OVERRIDE_ACTION) {
            return null;
        }

        return getSymbolOverrideEditorSpec(item, DEFAULT_SYMBOL);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}
