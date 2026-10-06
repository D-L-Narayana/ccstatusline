import type { Settings } from '../types/Settings';

export interface SettingsSummary {
    /** Lines that have at least one item configured. */
    lineCount: number;
    /** Items that render content; separators and flex separators are layout, not widgets. */
    widgetCount: number;
}

const LAYOUT_ITEM_TYPES = new Set(['separator', 'flex-separator']);

/** Counts shown by `--validate` and `--doctor` to describe a configuration at a glance. */
export function summarizeSettings(settings: Settings): SettingsSummary {
    let lineCount = 0;
    let widgetCount = 0;

    for (const line of settings.lines) {
        if (line.length === 0) {
            continue;
        }

        lineCount++;
        widgetCount += line.filter(item => !LAYOUT_ITEM_TYPES.has(item.type)).length;
    }

    return { lineCount, widgetCount };
}
