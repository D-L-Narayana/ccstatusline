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

import { makeModifierText } from './shared/editor-display';
import { isHidden } from './shared/hideable';
import { removeMetadataKeys } from './shared/metadata';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import {
    SYMBOL_OVERRIDE_ACTION,
    getSlotSymbol,
    getSymbolKeybind,
    getSymbolSlotsEditorSpec,
    type SymbolSlot
} from './shared/symbol-override';

const ADDED_SLOT: SymbolSlot = { id: 'symbolAdded', label: 'Added', defaultSymbol: '+' };
const REMOVED_SLOT: SymbolSlot = { id: 'symbolRemoved', label: 'Removed', defaultSymbol: '-' };
const SLOTS: SymbolSlot[] = [ADDED_SLOT, REMOVED_SLOT];

// Which counter(s) the widget shows. The default 'both' renders "+156 -23";
// 'added' / 'removed' render a single counter so two instances can be colored
// or separated independently.
const VALUES = ['both', 'added', 'removed'] as const;
type LinesChangedValue = typeof VALUES[number];
const DEFAULT_VALUE: LinesChangedValue = 'both';
const VALUE_METADATA_KEY = 'value';
const CYCLE_VALUE_ACTION = 'cycle-value';

const ZERO_HIDEABLE_STATE: HideableState = { key: 'zero', label: 'when no lines changed' };

interface LineCounts {
    added: number;
    removed: number;
}

// Sample values matching scripts/payload.example.json
const PREVIEW_COUNTS: LineCounts = { added: 156, removed: 23 };

function getValueMode(item: WidgetItem): LinesChangedValue {
    const value = item.metadata?.[VALUE_METADATA_KEY];
    return (VALUES as readonly string[]).includes(value ?? '') ? (value as LinesChangedValue) : DEFAULT_VALUE;
}

// The default mode is the absence of the key, so an untouched item keeps
// minimal metadata.
function setValueMode(item: WidgetItem, value: LinesChangedValue): WidgetItem {
    if (value === DEFAULT_VALUE) {
        return removeMetadataKeys(item, [VALUE_METADATA_KEY]);
    }

    return {
        ...item,
        metadata: {
            ...item.metadata,
            [VALUE_METADATA_KEY]: value
        }
    };
}

function showsAdded(mode: LinesChangedValue): boolean {
    return mode !== 'removed';
}

function showsRemoved(mode: LinesChangedValue): boolean {
    return mode !== 'added';
}

function readCount(value: number | undefined): number | null {
    return value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

// Only the counters the selected mode displays have to be present, so a
// single-counter instance keeps rendering when the other field is missing.
function readCounts(context: RenderContext, mode: LinesChangedValue): LineCounts | null {
    const cost = context.data?.cost;
    if (cost === undefined) {
        return null;
    }

    const added = readCount(cost.total_lines_added);
    const removed = readCount(cost.total_lines_removed);
    if ((showsAdded(mode) && added === null) || (showsRemoved(mode) && removed === null)) {
        return null;
    }

    return { added: added ?? 0, removed: removed ?? 0 };
}

function isZero(counts: LineCounts, mode: LinesChangedValue): boolean {
    return (!showsAdded(mode) || counts.added === 0) && (!showsRemoved(mode) || counts.removed === 0);
}

function formatCounts(item: WidgetItem, counts: LineCounts, mode: LinesChangedValue): string {
    const parts: string[] = [];
    if (showsAdded(mode)) {
        parts.push(`${getSlotSymbol(item, ADDED_SLOT)}${counts.added}`);
    }
    if (showsRemoved(mode)) {
        parts.push(`${getSlotSymbol(item, REMOVED_SLOT)}${counts.removed}`);
    }

    return formatRawOrLabeledValue(item, 'Lines: ', parts.join(' '));
}

export class LinesChangedWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows lines added and removed in the current session'; }
    getDisplayName(): string { return 'Lines Changed'; }
    getCategory(): string { return 'Session'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const mode = getValueMode(item);

        return {
            displayText: this.getDisplayName(),
            modifierText: makeModifierText(mode === DEFAULT_VALUE ? [] : [mode])
        };
    }

    getHideableStates(): HideableState[] {
        return [ZERO_HIDEABLE_STATE];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === CYCLE_VALUE_ACTION) {
            const current = getValueMode(item);
            const next = VALUES[(VALUES.indexOf(current) + 1) % VALUES.length] ?? DEFAULT_VALUE;

            return setValueMode(item, next);
        }

        return null;
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const mode = getValueMode(item);

        if (context.isPreview) {
            return formatCounts(item, PREVIEW_COUNTS, mode);
        }

        const counts = readCounts(context, mode);
        if (counts === null) {
            return null;
        }

        if (isZero(counts, mode) && isHidden(item, ZERO_HIDEABLE_STATE.key)) {
            return null;
        }

        return formatCounts(item, counts, mode);
    }

    getCustomKeybinds(_item?: WidgetItem): CustomKeybind[] {
        return [
            { key: 'v', label: '(v)alue: both/added/removed', action: CYCLE_VALUE_ACTION },
            getSymbolKeybind()
        ];
    }

    getEditorSpec(item: WidgetItem, action: string): WidgetEditorSpec | null {
        return action === SYMBOL_OVERRIDE_ACTION ? getSymbolSlotsEditorSpec(item, SLOTS) : null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}
