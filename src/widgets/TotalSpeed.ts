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

import {
    SPEED_WINDOW_EDITOR_ACTION,
    getSpeedWidgetCustomKeybinds,
    getSpeedWidgetDescription,
    getSpeedWidgetDisplayName,
    getSpeedWidgetEditorDisplay,
    getSpeedWidgetHideableStates,
    getSpeedWindowEditorSpec,
    renderSpeedWidgetValue
} from './shared/speed-widget';

export class TotalSpeedWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return getSpeedWidgetDescription('total'); }
    getDisplayName(): string { return getSpeedWidgetDisplayName('total'); }
    getCategory(): string { return 'Token Speed'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return getSpeedWidgetEditorDisplay('total', item);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        return renderSpeedWidgetValue('total', item, context, settings);
    }

    getCustomKeybinds(): CustomKeybind[] {
        return getSpeedWidgetCustomKeybinds();
    }

    getHideableStates(): HideableState[] {
        return getSpeedWidgetHideableStates();
    }

    getEditorSpec(item: WidgetItem, action: string): WidgetEditorSpec | null {
        if (action !== SPEED_WINDOW_EDITOR_ACTION) {
            return null;
        }

        return getSpeedWindowEditorSpec(item);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
