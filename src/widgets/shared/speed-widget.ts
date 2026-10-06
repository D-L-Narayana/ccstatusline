import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type { SpeedMetrics } from '../../types/SpeedMetrics';
import type {
    CustomKeybind,
    HideableState,
    WidgetEditorDisplay,
    WidgetItem
} from '../../types/Widget';
import type { NumberEditorSpec } from '../../types/WidgetEditorSpec';
import { resolveNumberFormat } from '../../utils/number-format';
import {
    calculateInputSpeed,
    calculateOutputSpeed,
    calculateTotalSpeed,
    formatSpeed
} from '../../utils/speed-metrics';
import {
    DEFAULT_SPEED_WINDOW_SECONDS,
    MAX_SPEED_WINDOW_SECONDS,
    MIN_SPEED_WINDOW_SECONDS,
    SPEED_WINDOW_METADATA_KEY,
    clampSpeedWindowSeconds,
    getWidgetSpeedWindowSeconds,
    isWidgetSpeedWindowEnabled,
    withWidgetSpeedWindowSeconds
} from '../../utils/speed-window';

import { makeModifierText } from './editor-display';
import { isHidden } from './hideable';
import { removeMetadataKeys } from './metadata';
import { formatRawOrLabeledValue } from './raw-or-labeled';

export type SpeedWidgetKind = 'input' | 'output' | 'total';

export const SPEED_WINDOW_EDITOR_ACTION = 'edit-window';

const NO_DATA_HIDEABLE_STATE: HideableState = { key: 'no-data', label: 'when there is no speed data (—)' };

interface SpeedWidgetKindConfig {
    label: string;
    displayName: string;
    description: string;
    sessionPreview: number;
    windowedPreview: number;
}

const SPEED_WIDGET_CONFIG: Record<SpeedWidgetKind, SpeedWidgetKindConfig> = {
    input: {
        label: 'In: ',
        displayName: 'Input Speed',
        description: 'Shows session-average input token speed (tokens/sec). Optional window: 0-120 seconds (0 = full-session average).',
        sessionPreview: 85.2,
        windowedPreview: 31.5
    },
    output: {
        label: 'Out: ',
        displayName: 'Output Speed',
        description: 'Shows session-average output token speed (tokens/sec). Optional window: 0-120 seconds (0 = full-session average).',
        sessionPreview: 42.5,
        windowedPreview: 26.8
    },
    total: {
        label: 'Total: ',
        displayName: 'Total Speed',
        description: 'Shows session-average total token speed (tokens/sec). Optional window: 0-120 seconds (0 = full-session average).',
        sessionPreview: 127.7,
        windowedPreview: 58.3
    }
};

function getSpeedMetricsForWidget(item: WidgetItem, context: RenderContext): SpeedMetrics | null {
    if (!isWidgetSpeedWindowEnabled(item)) {
        return context.speedMetrics ?? null;
    }

    const windowSeconds = getWidgetSpeedWindowSeconds(item);
    return context.windowedSpeedMetrics?.[windowSeconds.toString()] ?? null;
}

function calculateSpeed(kind: SpeedWidgetKind, metrics: SpeedMetrics): number | null {
    if (kind === 'input') {
        return calculateInputSpeed(metrics);
    }
    if (kind === 'output') {
        return calculateOutputSpeed(metrics);
    }
    return calculateTotalSpeed(metrics);
}

export function getSpeedWidgetDisplayName(kind: SpeedWidgetKind): string {
    return SPEED_WIDGET_CONFIG[kind].displayName;
}

export function getSpeedWidgetDescription(kind: SpeedWidgetKind): string {
    return SPEED_WIDGET_CONFIG[kind].description;
}

export function getSpeedWidgetEditorDisplay(kind: SpeedWidgetKind, item: WidgetItem): WidgetEditorDisplay {
    const windowSeconds = getWidgetSpeedWindowSeconds(item);
    const modifiers = windowSeconds > 0
        ? [`${windowSeconds}s window`]
        : ['session avg'];

    return {
        displayText: getSpeedWidgetDisplayName(kind),
        modifierText: makeModifierText(modifiers)
    };
}

export function renderSpeedWidgetValue(
    kind: SpeedWidgetKind,
    item: WidgetItem,
    context: RenderContext,
    settings: Settings
): string | null {
    const config = SPEED_WIDGET_CONFIG[kind];
    const format = resolveNumberFormat('speed', item, settings);

    if (context.isPreview) {
        const previewValue = isWidgetSpeedWindowEnabled(item) ? config.windowedPreview : config.sessionPreview;
        return formatRawOrLabeledValue(item, config.label, formatSpeed(previewValue, format));
    }

    const metrics = getSpeedMetricsForWidget(item, context);
    if (!metrics) {
        return null;
    }

    const speed = calculateSpeed(kind, metrics);
    if (speed === null && isHidden(item, NO_DATA_HIDEABLE_STATE.key)) {
        return null;
    }

    return formatRawOrLabeledValue(item, config.label, formatSpeed(speed, format));
}

export function getSpeedWidgetHideableStates(): HideableState[] {
    return [NO_DATA_HIDEABLE_STATE];
}

export function getSpeedWidgetCustomKeybinds(): CustomKeybind[] {
    return [{
        key: 'w',
        label: '(w)indow',
        action: SPEED_WINDOW_EDITOR_ACTION
    }];
}

// Out-of-range input is clamped rather than rejected. The default window (0 =
// full-session average) is stored as the absence of the key, like the other
// widget defaults, so clearing the window leaves no metadata behind.
export function getSpeedWindowEditorSpec(item: WidgetItem): NumberEditorSpec {
    return {
        kind: 'number',
        prompt: `Enter window in seconds (${MIN_SPEED_WINDOW_SECONDS}-${MAX_SPEED_WINDOW_SECONDS}): `,
        initialValue: getWidgetSpeedWindowSeconds(item).toString(),
        help: '0 disables window mode and averages the full session. Press Enter to save, ESC to cancel.',
        min: MIN_SPEED_WINDOW_SECONDS,
        max: MAX_SPEED_WINDOW_SECONDS,
        commit: (current, value) => {
            const seconds = clampSpeedWindowSeconds(value ?? DEFAULT_SPEED_WINDOW_SECONDS);
            if (seconds === DEFAULT_SPEED_WINDOW_SECONDS) {
                return removeMetadataKeys(current, [SPEED_WINDOW_METADATA_KEY]);
            }

            return withWidgetSpeedWindowSeconds(current, seconds);
        }
    };
}
