import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    formatPercent,
    resolveNumberFormat
} from '../utils/number-format';

import { makeModifierText } from './shared/editor-display';
import { isHidden } from './shared/hideable';
import { removeMetadataKeys } from './shared/metadata';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

// 'duration' shows the API wait time, 'percent' its share of the session
// wall-clock time, and 'both' renders "2.3s (5.1%)".
const FORMATS = ['duration', 'percent', 'both'] as const;
type ApiDurationFormat = typeof FORMATS[number];
const DEFAULT_FORMAT: ApiDurationFormat = 'duration';
const FORMAT_METADATA_KEY = 'format';
const CYCLE_FORMAT_ACTION = 'cycle-format';

const ZERO_HIDEABLE_STATE: HideableState = { key: 'zero', label: 'when API time is zero' };

// Preview sample: 2m 18s of API time in a 25m 15s session (9.1%)
const PREVIEW_API_DURATION_MS = 138000;
const PREVIEW_TOTAL_DURATION_MS = 1515000;

function getFormat(item: WidgetItem): ApiDurationFormat {
    const format = item.metadata?.[FORMAT_METADATA_KEY];
    return (FORMATS as readonly string[]).includes(format ?? '') ? (format as ApiDurationFormat) : DEFAULT_FORMAT;
}

// The default format is the absence of the key, so an untouched item keeps
// minimal metadata.
function setFormat(item: WidgetItem, format: ApiDurationFormat): WidgetItem {
    if (format === DEFAULT_FORMAT) {
        return removeMetadataKeys(item, [FORMAT_METADATA_KEY]);
    }

    return {
        ...item,
        metadata: {
            ...item.metadata,
            [FORMAT_METADATA_KEY]: format
        }
    };
}

function readDurationMs(value: number | undefined): number | null {
    return value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

// Tenths of a second are the finest unit shown, so anything that would read
// "0.0s" counts as zero for the hide state.
function toTenthsOfSeconds(durationMs: number): number {
    return Math.round(durationMs / 100);
}

// < 1 minute: "2.3s" · < 1 hour: "2m 18s" · otherwise "1hr 2m". The rounding
// unit matches the displayed precision so "59.95s" rolls over to "1m 0s".
function formatApiDuration(durationMs: number): string {
    const tenthsOfSeconds = toTenthsOfSeconds(durationMs);
    if (tenthsOfSeconds < 600) {
        return `${(tenthsOfSeconds / 10).toFixed(1)}s`;
    }

    const totalSeconds = Math.round(durationMs / 1000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    if (totalMinutes < 60) {
        return `${totalMinutes}m ${totalSeconds % 60}s`;
    }

    const hours = Math.floor(totalMinutes / 60);
    return `${hours}hr ${totalMinutes % 60}m`;
}

// The percent needs a positive session duration; without one the widget falls
// back to the plain duration rather than showing a meaningless ratio.
function formatApiShare(apiDurationMs: number, totalDurationMs: number | undefined, item: WidgetItem, settings: Settings): string | null {
    const sessionMs = readDurationMs(totalDurationMs);
    if (sessionMs === null || sessionMs === 0) {
        return null;
    }

    return formatPercent((apiDurationMs / sessionMs) * 100, resolveNumberFormat('percent', item, settings));
}

function formatOutput(item: WidgetItem, apiDurationMs: number, totalDurationMs: number | undefined, settings: Settings): string {
    const format = getFormat(item);
    const duration = formatApiDuration(apiDurationMs);
    const share = format === DEFAULT_FORMAT ? null : formatApiShare(apiDurationMs, totalDurationMs, item, settings);

    let value = duration;
    if (share !== null) {
        value = format === 'percent' ? share : `${duration} (${share})`;
    }

    return formatRawOrLabeledValue(item, 'API: ', value);
}

export class ApiDurationWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows time spent waiting on the API this session'; }
    getDisplayName(): string { return 'API Time'; }
    getCategory(): string { return 'Session'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const format = getFormat(item);

        return {
            displayText: this.getDisplayName(),
            modifierText: makeModifierText(format === DEFAULT_FORMAT ? [] : [format])
        };
    }

    getHideableStates(): HideableState[] {
        return [ZERO_HIDEABLE_STATE];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === CYCLE_FORMAT_ACTION) {
            const current = getFormat(item);
            const next = FORMATS[(FORMATS.indexOf(current) + 1) % FORMATS.length] ?? DEFAULT_FORMAT;

            return setFormat(item, next);
        }

        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return formatOutput(item, PREVIEW_API_DURATION_MS, PREVIEW_TOTAL_DURATION_MS, settings);
        }

        const cost = context.data?.cost;
        if (cost === undefined) {
            return null;
        }

        const apiDurationMs = readDurationMs(cost.total_api_duration_ms);
        if (apiDurationMs === null) {
            return null;
        }

        if (toTenthsOfSeconds(apiDurationMs) === 0 && isHidden(item, ZERO_HIDEABLE_STATE.key)) {
            return null;
        }

        return formatOutput(item, apiDurationMs, cost.total_duration_ms, settings);
    }

    getCustomKeybinds(_item?: WidgetItem): CustomKeybind[] {
        return [
            { key: 'f', label: '(f)ormat: duration/percent/both', action: CYCLE_FORMAT_ACTION }
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
