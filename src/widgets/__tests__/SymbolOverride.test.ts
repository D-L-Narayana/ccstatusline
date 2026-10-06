import {
    describe,
    expect,
    it
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../types/Settings';
import type {
    Widget,
    WidgetItem
} from '../../types/Widget';
import type {
    SymbolSlotsEditorSpec,
    WidgetEditorSpec
} from '../../types/WidgetEditorSpec';
import { GitAheadBehindWidget } from '../GitAheadBehind';
import { GitBranchWidget } from '../GitBranch';
import { GitChangesWidget } from '../GitChanges';
import { GitCleanStatusWidget } from '../GitCleanStatus';
import { GitConflictsWidget } from '../GitConflicts';
import { GitDeletionsWidget } from '../GitDeletions';
import { GitInsertionsWidget } from '../GitInsertions';
import { GitStagedWidget } from '../GitStaged';
import { GitStatusWidget } from '../GitStatus';
import { GitUnstagedWidget } from '../GitUnstaged';
import { GitUntrackedWidget } from '../GitUntracked';
import { GitWorktreeWidget } from '../GitWorktree';
import { GitWorktreeModeWidget } from '../GitWorktreeMode';
import { JjBookmarksWidget } from '../JjBookmarks';
import { JjChangesWidget } from '../JjChanges';
import { JjDeletionsWidget } from '../JjDeletions';
import { JjInsertionsWidget } from '../JjInsertions';
import { JjRevisionWidget } from '../JjRevision';
import { JjWorkspaceWidget } from '../JjWorkspace';
import {
    formatSymbolPrefix,
    getSymbol,
    setSlotSymbol,
    type SymbolSlot
} from '../shared/symbol-override';

// Every widget covered here exposes the shared glyph editor through the
// declarative editor-spec hook.
interface EditorSpecWidget extends Widget { getEditorSpec(item: WidgetItem, action: string): WidgetEditorSpec | null }

interface SymbolCase {
    name: string;
    itemType: string;
    widget: EditorSpecWidget;
    defaultSymbol: string;
    defaultPreview: string;
    overriddenPreview: string;
    suppressedPreview: string | null;
}

const cases: SymbolCase[] = [
    { name: 'GitBranchWidget', itemType: 'git-branch', widget: new GitBranchWidget(), defaultSymbol: '⎇', defaultPreview: '⎇ main', overriddenPreview: '★ main', suppressedPreview: 'main' },
    { name: 'GitWorktreeWidget', itemType: 'git-worktree', widget: new GitWorktreeWidget(), defaultSymbol: '𖠰', defaultPreview: '𖠰 main', overriddenPreview: '★ main', suppressedPreview: 'main' },
    { name: 'JjBookmarksWidget', itemType: 'jj-bookmarks', widget: new JjBookmarksWidget(), defaultSymbol: '🔖', defaultPreview: '🔖 main', overriddenPreview: '★ main', suppressedPreview: 'main' },
    { name: 'JjWorkspaceWidget', itemType: 'jj-workspace', widget: new JjWorkspaceWidget(), defaultSymbol: '◆', defaultPreview: '◆ default', overriddenPreview: '★ default', suppressedPreview: 'default' },
    { name: 'GitConflictsWidget', itemType: 'git-conflicts', widget: new GitConflictsWidget(), defaultSymbol: '⚠', defaultPreview: '⚠2', overriddenPreview: '★2', suppressedPreview: '2' },
    { name: 'GitStagedWidget', itemType: 'git-staged', widget: new GitStagedWidget(), defaultSymbol: '+', defaultPreview: '+', overriddenPreview: '★', suppressedPreview: '' },
    { name: 'GitUnstagedWidget', itemType: 'git-unstaged', widget: new GitUnstagedWidget(), defaultSymbol: '*', defaultPreview: '*', overriddenPreview: '★', suppressedPreview: '' },
    { name: 'GitUntrackedWidget', itemType: 'git-untracked', widget: new GitUntrackedWidget(), defaultSymbol: '?', defaultPreview: '?', overriddenPreview: '★', suppressedPreview: '' },
    // JJ Revision defaults to a Nerd Font glyph from the private use area; the
    // escape keeps the code point visible in diffs.
    { name: 'JjRevisionWidget', itemType: 'jj-revision', widget: new JjRevisionWidget(), defaultSymbol: '\uF1FA', defaultPreview: '\uF1FA kkmpptxz', overriddenPreview: '★ kkmpptxz', suppressedPreview: 'kkmpptxz' },
    { name: 'GitWorktreeModeWidget', itemType: 'worktree-mode', widget: new GitWorktreeModeWidget(), defaultSymbol: '⎇', defaultPreview: '⎇', overriddenPreview: '★', suppressedPreview: null }
];

function makeItem(itemType: string, character?: string): WidgetItem {
    return {
        id: itemType,
        type: itemType,
        ...(character === undefined ? {} : { character })
    };
}

function getSlotsSpec(widget: EditorSpecWidget, item: WidgetItem): SymbolSlotsEditorSpec {
    const spec = widget.getEditorSpec(item, 'edit-symbol-override');
    if (spec?.kind !== 'symbol-slots') {
        throw new Error(`expected a symbol-slots editor spec for ${item.type}`);
    }

    return spec;
}

describe('symbol override rendering', () => {
    it.each(cases)('$name renders its default symbol', ({ widget, itemType, defaultPreview }) => {
        expect(widget.render(makeItem(itemType), { isPreview: true }, DEFAULT_SETTINGS)).toBe(defaultPreview);
    });

    it.each(cases)('$name renders a character override', ({ widget, itemType, overriddenPreview }) => {
        expect(widget.render(makeItem(itemType, '★'), { isPreview: true }, DEFAULT_SETTINGS)).toBe(overriddenPreview);
    });

    it.each(cases)('$name renders without a symbol on an empty override', ({ widget, itemType, suppressedPreview }) => {
        expect(widget.render(makeItem(itemType, ''), { isPreview: true }, DEFAULT_SETTINGS)).toBe(suppressedPreview);
    });

    it.each(cases)('$name exposes the shared glyph keybind and editor', ({ widget, itemType, defaultSymbol }) => {
        const keys = (widget.getCustomKeybinds?.() ?? []).map(keybind => keybind.key);
        expect(keys).toContain('g');
        expect(typeof widget.getEditorSpec).toBe('function');

        const spec = getSlotsSpec(widget, makeItem(itemType));
        expect(spec.title).toBe('Glyphs');
        expect(spec.slots[0]?.id).toBe('character');
        expect(spec.slots[0]?.defaultSymbol).toBe(defaultSymbol);
        expect(spec.slots[0]?.initialValue).toBe(defaultSymbol);
    });

    it.each(cases)('$name seeds and commits the glyph editor through the character field', ({ widget, itemType, defaultSymbol }) => {
        expect(getSlotsSpec(widget, makeItem(itemType, '★')).slots[0]?.initialValue).toBe('★');

        const spec = getSlotsSpec(widget, makeItem(itemType));
        const otherValues = spec.slots.slice(1).map(slot => slot.initialValue);
        const overridden = spec.commit(makeItem(itemType), ['★', ...otherValues]);
        const restored = spec.commit(overridden, [defaultSymbol, ...otherValues]);

        expect(overridden.character).toBe('★');
        expect('character' in restored).toBe(false);
    });
});

interface MultiSlotCase {
    name: string;
    itemType: string;
    widget: EditorSpecWidget;
    slotIds: string[];
}

const multiSlotCases: MultiSlotCase[] = [
    { name: 'GitAheadBehindWidget', itemType: 'git-ahead-behind', widget: new GitAheadBehindWidget(), slotIds: ['symbolAhead', 'symbolBehind'] },
    { name: 'GitStatusWidget', itemType: 'git-status', widget: new GitStatusWidget(), slotIds: ['symbolConflicts', 'symbolStaged', 'symbolUnstaged', 'symbolUntracked'] }
];

describe('multi-slot symbol overrides', () => {
    it('GitAheadBehindWidget renders ahead/behind symbol overrides', () => {
        const widget = new GitAheadBehindWidget();

        expect(widget.render(makeItem('git-ahead-behind'), { isPreview: true }, DEFAULT_SETTINGS)).toBe('↑2↓3');
        expect(widget.render({
            id: 'git-ahead-behind',
            type: 'git-ahead-behind',
            metadata: { symbolAhead: '▲', symbolBehind: '▼' }
        }, { isPreview: true }, DEFAULT_SETTINGS)).toBe('▲2▼3');
        expect(widget.render({
            id: 'git-ahead-behind',
            type: 'git-ahead-behind',
            metadata: { symbolAhead: '', symbolBehind: '' }
        }, { isPreview: true }, DEFAULT_SETTINGS)).toBe('23');
    });

    it('GitStatusWidget renders per-part symbol overrides', () => {
        const widget = new GitStatusWidget();

        expect(widget.render(makeItem('git-status'), { isPreview: true }, DEFAULT_SETTINGS)).toBe('+*');
        expect(widget.render({
            id: 'git-status',
            type: 'git-status',
            metadata: { symbolStaged: '●' }
        }, { isPreview: true }, DEFAULT_SETTINGS)).toBe('●*');
    });

    it.each(multiSlotCases)('$name exposes the shared glyph keybind and one editor row per symbol', ({ widget, itemType, slotIds }) => {
        const keys = (widget.getCustomKeybinds?.() ?? []).map(keybind => keybind.key);
        expect(keys).toContain('g');
        expect(typeof widget.getEditorSpec).toBe('function');

        const spec = getSlotsSpec(widget, makeItem(itemType));
        expect(spec.title).toBe('Glyphs');
        expect(spec.slots.map(slot => slot.id)).toEqual(slotIds);
        expect(spec.slots.every(slot => slot.initialValue === slot.defaultSymbol)).toBe(true);
    });

    it('stores slot overrides in metadata and clears them on default', () => {
        const slot: SymbolSlot = { id: 'symbolAhead', label: 'Ahead', defaultSymbol: '↑' };
        const overridden = setSlotSymbol(makeItem('git-ahead-behind'), slot, '▲');
        expect(overridden.metadata).toEqual({ symbolAhead: '▲' });

        const cleared = setSlotSymbol(overridden, slot, '↑');
        expect(cleared.metadata).toBeUndefined();
    });
});

describe('symbol override helpers', () => {
    it('prefers the item character over the default', () => {
        expect(getSymbol(makeItem('git-branch'), '⎇')).toBe('⎇');
        expect(getSymbol(makeItem('git-branch', '★'), '⎇')).toBe('★');
        expect(getSymbol(makeItem('git-branch', ''), '⎇')).toBe('');
    });

    it('collapses the joining space for empty symbols', () => {
        expect(formatSymbolPrefix(makeItem('git-branch'), '⎇')).toBe('⎇ ');
        expect(formatSymbolPrefix(makeItem('git-branch', ''), '⎇')).toBe('');
    });

    it('stores character overrides and removes them when matching the default', () => {
        const characterSlot: SymbolSlot = { id: 'character', label: 'Glyph', defaultSymbol: '⎇' };
        const overridden = setSlotSymbol(makeItem('git-branch'), characterSlot, '★');
        expect(overridden.character).toBe('★');

        const cleared = setSlotSymbol(overridden, characterSlot, '⎇');
        expect('character' in cleared).toBe(false);

        const suppressed = setSlotSymbol(makeItem('git-branch'), characterSlot, '');
        expect(suppressed.character).toBe('');
    });
});

interface SlotCase {
    name: string;
    itemType: string;
    widget: EditorSpecWidget;
    slotIds: string[];
    defaultPreview: string;
    overrides: Record<string, string>;
    overriddenPreview: string;
    clearedPreview: string;
}

const slotCases: SlotCase[] = [
    { name: 'GitInsertionsWidget', itemType: 'git-insertions', widget: new GitInsertionsWidget(), slotIds: ['symbolInsertions'], defaultPreview: '+42', overrides: { symbolInsertions: '▲' }, overriddenPreview: '▲42', clearedPreview: '42' },
    { name: 'GitDeletionsWidget', itemType: 'git-deletions', widget: new GitDeletionsWidget(), slotIds: ['symbolDeletions'], defaultPreview: '-10', overrides: { symbolDeletions: '▼' }, overriddenPreview: '▼10', clearedPreview: '10' },
    { name: 'JjInsertionsWidget', itemType: 'jj-insertions', widget: new JjInsertionsWidget(), slotIds: ['symbolInsertions'], defaultPreview: '+42', overrides: { symbolInsertions: '▲' }, overriddenPreview: '▲42', clearedPreview: '42' },
    { name: 'JjDeletionsWidget', itemType: 'jj-deletions', widget: new JjDeletionsWidget(), slotIds: ['symbolDeletions'], defaultPreview: '-10', overrides: { symbolDeletions: '▼' }, overriddenPreview: '▼10', clearedPreview: '10' },
    { name: 'GitChangesWidget', itemType: 'git-changes', widget: new GitChangesWidget(), slotIds: ['symbolInsertions', 'symbolDeletions'], defaultPreview: '(+42,-10)', overrides: { symbolInsertions: '▲', symbolDeletions: '▼' }, overriddenPreview: '(▲42,▼10)', clearedPreview: '(42,10)' },
    { name: 'JjChangesWidget', itemType: 'jj-changes', widget: new JjChangesWidget(), slotIds: ['symbolInsertions', 'symbolDeletions'], defaultPreview: '(+42,-10)', overrides: { symbolInsertions: '▲', symbolDeletions: '▼' }, overriddenPreview: '(▲42,▼10)', clearedPreview: '(42,10)' },
    { name: 'GitCleanStatusWidget', itemType: 'git-clean-status', widget: new GitCleanStatusWidget(), slotIds: ['symbolClean', 'symbolDirty'], defaultPreview: '✓', overrides: { symbolClean: '★' }, overriddenPreview: '★', clearedPreview: '' }
];

describe('named-slot symbol overrides', () => {
    it.each(slotCases)('$name renders its default symbols', ({ widget, itemType, defaultPreview }) => {
        expect(widget.render(makeItem(itemType), { isPreview: true }, DEFAULT_SETTINGS)).toBe(defaultPreview);
    });

    it.each(slotCases)('$name renders slot overrides', ({ widget, itemType, overrides, overriddenPreview }) => {
        expect(widget.render({ id: itemType, type: itemType, metadata: overrides }, { isPreview: true }, DEFAULT_SETTINGS)).toBe(overriddenPreview);
    });

    it.each(slotCases)('$name drops the symbol on an empty override', ({ widget, itemType, overrides, clearedPreview }) => {
        const cleared = Object.fromEntries(Object.keys(overrides).map(key => [key, '']));
        expect(widget.render({ id: itemType, type: itemType, metadata: cleared }, { isPreview: true }, DEFAULT_SETTINGS)).toBe(clearedPreview);
    });

    it.each(slotCases)('$name exposes the shared glyph keybind and editor', ({ widget, itemType, overrides, slotIds }) => {
        const keys = (widget.getCustomKeybinds?.() ?? []).map(keybind => keybind.key);
        expect(keys).toContain('g');
        expect(typeof widget.getEditorSpec).toBe('function');

        const spec = getSlotsSpec(widget, { id: itemType, type: itemType, metadata: overrides });
        expect(spec.slots.map(slot => slot.id)).toEqual(slotIds);
        for (const slot of spec.slots) {
            expect(slot.initialValue).toBe(overrides[slot.id] ?? slot.defaultSymbol);
        }
    });

    it.each(slotCases)('$name clears slot overrides when the editor commits the defaults', ({ widget, itemType, overrides }) => {
        const item: WidgetItem = { id: itemType, type: itemType, metadata: overrides };
        const spec = getSlotsSpec(widget, item);
        const restored = spec.commit(item, spec.slots.map(slot => slot.defaultSymbol));

        expect(restored.metadata).toBeUndefined();
    });
});
