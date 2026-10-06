import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    RenderContext,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type {
    NumberEditorSpec,
    WidgetEditorSpec
} from '../../types/WidgetEditorSpec';
import { SkillsWidget } from '../Skills';

function render(item: WidgetItem, context: RenderContext): string | null {
    return new SkillsWidget().render(item, context, DEFAULT_SETTINGS);
}

function expectNumberSpec(spec: WidgetEditorSpec | null): NumberEditorSpec {
    expect(spec?.kind).toBe('number');
    if (spec?.kind !== 'number') {
        throw new Error('expected a number editor spec');
    }
    return spec;
}

describe('SkillsWidget', () => {
    it('uses v as the mode toggle keybind', () => {
        const widget = new SkillsWidget();
        expect(widget.getCustomKeybinds({ id: 'skills', type: 'skills' })).toEqual([
            { key: 'v', label: '(v)iew: last/count/list', action: 'cycle-mode' }
        ]);
        expect(widget.getCustomKeybinds({
            id: 'skills',
            type: 'skills',
            metadata: { mode: 'list' }
        })).toEqual([
            { key: 'v', label: '(v)iew: last/count/list', action: 'cycle-mode' },
            { key: 'l', label: '(l)imit', action: 'edit-list-limit' }
        ]);
    });

    it('cycles mode current -> count -> list -> current', () => {
        const widget = new SkillsWidget();
        const base: WidgetItem = { id: 'skills', type: 'skills' };
        const count = widget.handleEditorAction('cycle-mode', base);
        const list = widget.handleEditorAction('cycle-mode', count ?? base);
        const current = widget.handleEditorAction('cycle-mode', list ?? base);

        expect(count?.metadata?.mode).toBe('count');
        expect(list?.metadata?.mode).toBe('list');
        expect(current?.metadata?.mode).toBe('current');
    });

    it('clears list limit metadata when leaving list mode', () => {
        const widget = new SkillsWidget();
        const updated = widget.handleEditorAction('cycle-mode', {
            id: 'skills',
            type: 'skills',
            metadata: {
                mode: 'list',
                listLimit: '2'
            }
        });

        expect(updated?.metadata?.mode).toBe('current');
        expect(updated?.metadata?.listLimit).toBeUndefined();
    });

    it('declares the empty hideable state', () => {
        const widget = new SkillsWidget();

        expect(widget.getHideableStates().map(state => state.key)).toEqual(['empty']);
    });

    it('shows list limit in editor modifier text when configured', () => {
        const widget = new SkillsWidget();
        const display = widget.getEditorDisplay({
            id: 'skills',
            type: 'skills',
            metadata: { mode: 'list', listLimit: '2' }
        });

        expect(display.modifierText).toBe('(unique list, limit: 2)');
    });

    it('renders current, count, and list modes from skills metrics', () => {
        const context: RenderContext = {
            skillsMetrics: {
                totalInvocations: 3,
                uniqueSkills: ['commit', 'review-pr'],
                lastSkill: 'review-pr'
            }
        };

        expect(render({ id: 'skills', type: 'skills' }, context)).toBe('Skill: review-pr');
        expect(render({ id: 'skills', type: 'skills', metadata: { mode: 'count' } }, context)).toBe('Skills: 3');
        expect(render({ id: 'skills', type: 'skills', metadata: { mode: 'list' } }, context)).toBe('Skills: commit, review-pr');
        expect(render({ id: 'skills', type: 'skills', metadata: { mode: 'list', listLimit: '1' } }, context)).toBe('Skills: commit');
        expect(render({ id: 'skills', type: 'skills', metadata: { mode: 'list', listLimit: '0' } }, context)).toBe('Skills: commit, review-pr');
    });

    it('shows non-hidden empty outputs by default', () => {
        const context: RenderContext = {
            skillsMetrics: {
                totalInvocations: 0,
                uniqueSkills: [],
                lastSkill: null
            }
        };

        expect(render({ id: 'skills', type: 'skills' }, context)).toBe('Skill: none');
        expect(render({ id: 'skills', type: 'skills', metadata: { mode: 'count' } }, context)).toBe('Skills: 0');
        expect(render({ id: 'skills', type: 'skills', metadata: { mode: 'list' } }, context)).toBe('Skills: none');
    });

    it('hides empty outputs when hide-when-empty is enabled', () => {
        const context: RenderContext = {
            skillsMetrics: {
                totalInvocations: 0,
                uniqueSkills: [],
                lastSkill: null
            }
        };

        expect(render({
            id: 'skills',
            type: 'skills',
            metadata: { hide: 'empty' }
        }, context)).toBeNull();
        expect(render({
            id: 'skills',
            type: 'skills',
            metadata: { mode: 'count', hide: 'empty' }
        }, context)).toBeNull();
        expect(render({
            id: 'skills',
            type: 'skills',
            metadata: { mode: 'list', hide: 'empty' }
        }, context)).toBeNull();
    });

    describe('list limit editor', () => {
        const widget = new SkillsWidget();
        const listItem: WidgetItem = {
            id: 'skills',
            type: 'skills',
            metadata: { mode: 'list', listLimit: '2' }
        };

        it('returns null for actions without an editor', () => {
            expect(widget.getEditorSpec(listItem, 'cycle-mode')).toBeNull();
            expect(widget.getEditorSpec(listItem, 'unknown-action')).toBeNull();
        });

        it('describes the list limit editor as a number spec', () => {
            const spec = expectNumberSpec(widget.getEditorSpec(listItem, 'edit-list-limit'));

            expect(spec.prompt).toBe('Enter max skills to show (0 for unlimited): ');
            expect(spec.initialValue).toBe('2');
            expect(expectNumberSpec(widget.getEditorSpec({
                id: 'skills',
                type: 'skills',
                metadata: { mode: 'list' }
            }, 'edit-list-limit')).initialValue).toBe('0');
            expect(expectNumberSpec(widget.getEditorSpec({
                id: 'skills',
                type: 'skills',
                metadata: { mode: 'list', listLimit: 'abc' }
            }, 'edit-list-limit')).initialValue).toBe('0');
        });

        it('stores a positive limit and removes the key otherwise', () => {
            const spec = expectNumberSpec(widget.getEditorSpec(listItem, 'edit-list-limit'));

            expect(spec.commit(listItem, 3).metadata).toEqual({ mode: 'list', listLimit: '3' });
            expect(spec.commit(listItem, -1).metadata).toEqual({ mode: 'list' });
            expect(spec.commit(listItem, 0).metadata).toEqual({ mode: 'list' });
            expect(spec.commit(listItem, null).metadata).toEqual({ mode: 'list' });
            expect(spec.commit({
                id: 'skills',
                type: 'skills',
                metadata: { listLimit: '2' }
            }, null).metadata).toBeUndefined();
        });
    });
});
