import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../../types/Widget';
import { DEFAULT_RESET_LOCALE } from '../../../utils/locales';
import {
    DEFAULT_SPEED_WINDOW_SECONDS,
    getWidgetSpeedWindowSeconds,
    isWidgetSpeedWindowEnabled
} from '../../../utils/speed-window';
import {
    LOCALE_EDITOR_ACTION,
    getUsageLocaleEditorSpec
} from '../locale-editor';
import {
    MAX_WIDTH_ACTION,
    getMaxWidthEditorSpec
} from '../max-width';
import {
    SPEED_WINDOW_EDITOR_ACTION,
    getSpeedWidgetCustomKeybinds,
    getSpeedWindowEditorSpec
} from '../speed-widget';
import {
    SYMBOL_OVERRIDE_ACTION,
    getSymbolOverrideEditorSpec,
    getSymbolSlotsEditorSpec,
    type SymbolSlot
} from '../symbol-override';
import {
    TIMEZONE_EDITOR_ACTION,
    getUsageTimezoneEditorSpec
} from '../timezone-editor';

const AHEAD_SLOT: SymbolSlot = { id: 'symbolAhead', label: 'Ahead', defaultSymbol: '↑' };
const BEHIND_SLOT: SymbolSlot = { id: 'symbolBehind', label: 'Behind', defaultSymbol: '↓' };
const CHARACTER_SLOT: SymbolSlot = { id: 'character', label: 'Conflicts', defaultSymbol: '⚠' };

function makeItem(extra: Partial<WidgetItem> = {}): WidgetItem {
    return { id: 'item', type: 'reset-timer', ...extra };
}

describe('editor actions', () => {
    it('keeps the action ids the items editor keybinds dispatch on', () => {
        expect(SYMBOL_OVERRIDE_ACTION).toBe('edit-symbol-override');
        expect(MAX_WIDTH_ACTION).toBe('edit-max-width');
        expect(LOCALE_EDITOR_ACTION).toBe('edit-locale');
        expect(TIMEZONE_EDITOR_ACTION).toBe('edit-timezone');
        expect(SPEED_WINDOW_EDITOR_ACTION).toBe('edit-window');
        expect(getSpeedWidgetCustomKeybinds().map(keybind => keybind.action)).toEqual([SPEED_WINDOW_EDITOR_ACTION]);
    });
});

describe('getUsageLocaleEditorSpec', () => {
    it('describes a locale search list defaulting to the reset locale', () => {
        const spec = getUsageLocaleEditorSpec(makeItem());

        expect(spec.kind).toBe('search-list');
        expect(spec.title).toBe('Locale');
        expect(spec.currentLabel).toBe(DEFAULT_RESET_LOCALE);
        expect(spec.initialValue).toBe(DEFAULT_RESET_LOCALE);
        expect(spec.emptyMessage).toBe('No locales match the search.');
        expect(spec.getOptions('')[0]?.value).toBe(DEFAULT_RESET_LOCALE);
    });

    it('reports the configured locale as current and preselects it', () => {
        const spec = getUsageLocaleEditorSpec(makeItem({ metadata: { locale: 'ja-JP' } }));

        expect(spec.currentLabel).toBe('ja-JP');
        expect(spec.initialValue).toBe('ja-JP');
        expect(spec.getOptions('').some(option => option.value === 'ja-JP')).toBe(true);
    });

    it('lists ja-JP for a japan search as a plain search-list option', () => {
        const japanese = getUsageLocaleEditorSpec(makeItem()).getOptions('japan').find(option => option.value === 'ja-JP');

        // The row is the common-locale entry, or the system-locale entry on a
        // Japanese machine; either way it must be reduced to the option shape.
        expect(japanese?.displayName).toContain('ja-JP');
        expect(japanese?.description.length).toBeGreaterThan(0);
        expect(Object.keys(japanese ?? {}).sort()).toEqual(['description', 'displayName', 'value']);
    });

    it('returns no options when nothing matches the query', () => {
        expect(getUsageLocaleEditorSpec(makeItem()).getOptions('###')).toEqual([]);
    });

    it('commits the selected locale and clears the default', () => {
        const spec = getUsageLocaleEditorSpec(makeItem());
        const japanese = spec.commit(makeItem(), 'ja-JP');
        const cleared = spec.commit(japanese, 'en-US');

        expect(japanese.metadata?.locale).toBe('ja-JP');
        expect(cleared.metadata?.locale).toBeUndefined();
    });
});

describe('getUsageTimezoneEditorSpec', () => {
    it('describes a timezone search list defaulting to UTC', () => {
        const spec = getUsageTimezoneEditorSpec(makeItem());

        expect(spec.kind).toBe('search-list');
        expect(spec.title).toBe('Timezone');
        expect(spec.currentLabel).toBe('UTC');
        expect(spec.initialValue).toBe('UTC');
        expect(spec.emptyMessage).toBe('No timezones match the search.');
        expect(spec.getOptions('')[0]?.value).toBe('UTC');
    });

    it('reports the configured timezone as current and preselects it', () => {
        const spec = getUsageTimezoneEditorSpec(makeItem({ metadata: { timezone: 'Asia/Tokyo' } }));

        expect(spec.currentLabel).toBe('Asia/Tokyo');
        expect(spec.initialValue).toBe('Asia/Tokyo');
        expect(spec.getOptions('').some(option => option.value === 'Asia/Tokyo')).toBe(true);
    });

    it('lists UTC for a utc search as a plain search-list option', () => {
        const utc = getUsageTimezoneEditorSpec(makeItem()).getOptions('utc').find(option => option.value === 'UTC');

        expect(utc).toEqual({ value: 'UTC', displayName: 'UTC', description: 'Default UTC reset timestamp' });
    });

    it('commits the selected timezone and clears UTC', () => {
        const spec = getUsageTimezoneEditorSpec(makeItem());
        const tokyo = spec.commit(makeItem(), 'Asia/Tokyo');
        const cleared = spec.commit(tokyo, 'UTC');

        expect(tokyo.metadata?.timezone).toBe('Asia/Tokyo');
        expect(cleared.metadata?.timezone).toBeUndefined();
    });
});

describe('getMaxWidthEditorSpec', () => {
    it('describes a number editor prefilled with the current width', () => {
        expect(getMaxWidthEditorSpec(makeItem({ type: 'git-branch' }))).toMatchObject({
            kind: 'number',
            prompt: 'Enter max width (blank for no limit): ',
            initialValue: ''
        });
        expect(getMaxWidthEditorSpec(makeItem({ type: 'git-branch', maxWidth: 12 })).initialValue).toBe('12');
    });

    it('stores a positive width and drops the field for blank or zero input', () => {
        const spec = getMaxWidthEditorSpec(makeItem({ type: 'git-branch' }));
        const item = makeItem({ type: 'git-branch', maxWidth: 12, metadata: { hide: 'no-git' } });

        expect(spec.commit(item, 20)).toEqual({ ...item, maxWidth: 20 });
        expect('maxWidth' in spec.commit(item, null)).toBe(false);
        expect('maxWidth' in spec.commit(item, 0)).toBe(false);
        expect(spec.commit(item, null).metadata).toEqual({ hide: 'no-git' });
    });
});

describe('getSpeedWindowEditorSpec', () => {
    it('describes a bounded number editor prefilled with the window', () => {
        expect(getSpeedWindowEditorSpec(makeItem({ type: 'output-speed' }))).toMatchObject({
            kind: 'number',
            prompt: 'Enter window in seconds (0-120): ',
            initialValue: '0',
            help: '0 disables window mode and averages the full session. Press Enter to save, ESC to cancel.',
            min: 0,
            max: 120
        });
        expect(getSpeedWindowEditorSpec(makeItem({ type: 'output-speed', metadata: { windowSeconds: '45' } })).initialValue).toBe('45');
    });

    it('clamps an oversized window to the maximum', () => {
        const spec = getSpeedWindowEditorSpec(makeItem({ type: 'output-speed' }));
        const updated = spec.commit(makeItem({ type: 'output-speed' }), 500);

        expect(updated.metadata?.windowSeconds).toBe('120');
        expect(getWidgetSpeedWindowSeconds(updated)).toBe(120);
    });

    it('returns to the session average without storing a window key', () => {
        const spec = getSpeedWindowEditorSpec(makeItem({ type: 'output-speed' }));
        const windowed = makeItem({ type: 'output-speed', metadata: { windowSeconds: '45', hide: 'no-data' } });
        const cleared = spec.commit(windowed, null);
        const zeroed = spec.commit(windowed, 0);

        expect(cleared.metadata).toEqual({ hide: 'no-data' });
        expect(zeroed.metadata).toEqual({ hide: 'no-data' });
        expect(getWidgetSpeedWindowSeconds(cleared)).toBe(DEFAULT_SPEED_WINDOW_SECONDS);
        expect(isWidgetSpeedWindowEnabled(cleared)).toBe(false);
    });
});

describe('getSymbolSlotsEditorSpec', () => {
    it('lists one row per slot with the effective symbol as the initial value', () => {
        const item = makeItem({ type: 'git-ahead-behind', metadata: { symbolBehind: '▼' } });
        const spec = getSymbolSlotsEditorSpec(item, [AHEAD_SLOT, BEHIND_SLOT]);

        expect(spec.kind).toBe('symbol-slots');
        expect(spec.title).toBe('Glyphs');
        expect(spec.slots).toEqual([
            { id: 'symbolAhead', label: 'Ahead', defaultSymbol: '↑', initialValue: '↑' },
            { id: 'symbolBehind', label: 'Behind', defaultSymbol: '↓', initialValue: '▼' }
        ]);
    });

    it('honors the character field for the character slot', () => {
        const overridden = getSymbolSlotsEditorSpec(makeItem({ type: 'git-conflicts', character: '★' }), [CHARACTER_SLOT]);
        const untouched = getSymbolSlotsEditorSpec(makeItem({ type: 'git-conflicts' }), [CHARACTER_SLOT]);

        expect(overridden.slots[0]?.initialValue).toBe('★');
        expect(untouched.slots[0]?.initialValue).toBe('⚠');
    });

    it('commits values by slot position and removes overrides matching the default', () => {
        const spec = getSymbolSlotsEditorSpec(makeItem({ type: 'git-ahead-behind' }), [AHEAD_SLOT, BEHIND_SLOT]);
        const overridden = spec.commit(makeItem({ type: 'git-ahead-behind' }), ['▲', '▼']);
        const restored = spec.commit(overridden, ['↑', '↓']);

        expect(overridden.metadata).toEqual({ symbolAhead: '▲', symbolBehind: '▼' });
        expect(restored.metadata).toBeUndefined();
    });

    it('treats a missing value as a blanked glyph', () => {
        const spec = getSymbolSlotsEditorSpec(makeItem({ type: 'git-ahead-behind' }), [AHEAD_SLOT, BEHIND_SLOT]);

        expect(spec.commit(makeItem({ type: 'git-ahead-behind' }), ['▲']).metadata).toEqual({ symbolAhead: '▲', symbolBehind: '' });
    });

    it('commits the character slot onto the item character field', () => {
        const spec = getSymbolSlotsEditorSpec(makeItem({ type: 'git-conflicts' }), [CHARACTER_SLOT]);
        const overridden = spec.commit(makeItem({ type: 'git-conflicts' }), ['★']);

        expect(overridden.character).toBe('★');
        expect('character' in spec.commit(overridden, ['⚠'])).toBe(false);
    });
});

describe('getSymbolOverrideEditorSpec', () => {
    it('is a single Glyph slot bound to the character field', () => {
        expect(getSymbolOverrideEditorSpec(makeItem({ type: 'git-branch' }), '⎇')).toMatchObject({
            kind: 'symbol-slots',
            title: 'Glyphs',
            slots: [{ id: 'character', label: 'Glyph', defaultSymbol: '⎇', initialValue: '⎇' }]
        });
        expect(getSymbolOverrideEditorSpec(makeItem({ type: 'git-branch', character: '' }), '⎇').slots[0]?.initialValue).toBe('');
    });
});
