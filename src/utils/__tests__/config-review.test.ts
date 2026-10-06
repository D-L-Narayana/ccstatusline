import {
    describe,
    expect,
    it
} from 'vitest';
import { z } from 'zod';

import {
    CURRENT_VERSION,
    DEFAULT_SETTINGS,
    SettingsSchema,
    type Settings
} from '../../types/Settings';
import {
    collectConfigRisks,
    formatSettingsIssues
} from '../config-review';

function withLines(lines: Settings['lines']): Settings {
    return { ...DEFAULT_SETTINGS, lines };
}

function failingParse(input: unknown): z.ZodError {
    const result = SettingsSchema.safeParse(input);
    if (result.success) {
        throw new Error('expected the fixture to fail schema validation');
    }
    return result.error;
}

describe('collectConfigRisks', () => {
    it('returns no risks for the default configuration', () => {
        expect(collectConfigRisks(DEFAULT_SETTINGS)).toEqual([]);
    });

    it('flags custom commands as shell-command risks with the command text', () => {
        const settings = withLines([
            [{ id: '1', type: 'custom-command', commandPath: 'git status' }],
            [],
            []
        ]);

        expect(collectConfigRisks(settings)).toEqual([
            {
                kind: 'shell-command',
                lineIndex: 0,
                itemIndex: 0,
                widgetType: 'custom-command',
                value: 'git status'
            }
        ]);
    });

    it('flags link widgets with a URL as hyperlink risks', () => {
        const settings = withLines([
            [],
            [{ id: '1', type: 'link', metadata: { url: 'https://example.com/dash', text: 'Dashboard' } }],
            []
        ]);

        expect(collectConfigRisks(settings)).toEqual([
            {
                kind: 'hyperlink',
                lineIndex: 1,
                itemIndex: 0,
                widgetType: 'link',
                value: 'https://example.com/dash'
            }
        ]);
    });

    it('orders risks by line and then by item position', () => {
        const settings = withLines([
            [
                { id: '1', type: 'model' },
                { id: '2', type: 'link', metadata: { url: 'https://first.example' } },
                { id: '3', type: 'separator' },
                { id: '4', type: 'custom-command', commandPath: 'echo first' }
            ],
            [{ id: '5', type: 'custom-command', commandPath: 'echo second' }],
            [{ id: '6', type: 'link', metadata: { url: 'https://last.example' } }]
        ]);

        expect(collectConfigRisks(settings).map(risk => [risk.kind, risk.lineIndex, risk.itemIndex, risk.value])).toEqual([
            ['hyperlink', 0, 1, 'https://first.example'],
            ['shell-command', 0, 3, 'echo first'],
            ['shell-command', 1, 0, 'echo second'],
            ['hyperlink', 2, 0, 'https://last.example']
        ]);
    });

    it('ignores custom commands with a missing or blank command', () => {
        const settings = withLines([
            [
                { id: '1', type: 'custom-command' },
                { id: '2', type: 'custom-command', commandPath: '' },
                { id: '3', type: 'custom-command', commandPath: '   ' }
            ],
            [],
            []
        ]);

        expect(collectConfigRisks(settings)).toEqual([]);
    });

    it('ignores link widgets without a URL', () => {
        const settings = withLines([
            [
                { id: '1', type: 'link' },
                { id: '2', type: 'link', metadata: { text: 'no url yet' } },
                { id: '3', type: 'link', metadata: { url: '  ' } }
            ],
            [],
            []
        ]);

        expect(collectConfigRisks(settings)).toEqual([]);
    });

    it('trims surrounding whitespace from the reported value', () => {
        const settings = withLines([
            [
                { id: '1', type: 'custom-command', commandPath: '  echo padded  ' },
                { id: '2', type: 'link', metadata: { url: ' https://example.com ' } }
            ],
            [],
            []
        ]);

        expect(collectConfigRisks(settings).map(risk => risk.value)).toEqual([
            'echo padded',
            'https://example.com'
        ]);
    });

    it('only treats custom-command widgets as shell commands', () => {
        const settings = withLines([
            [{ id: '1', type: 'model', commandPath: 'echo not-executed' }],
            [],
            []
        ]);

        expect(collectConfigRisks(settings)).toEqual([]);
    });
});

describe('formatSettingsIssues', () => {
    it('renders every issue as "<path>: <message>" in the order zod reports them', () => {
        const error = failingParse({
            version: CURRENT_VERSION,
            flexMode: 'wide',
            lines: [[{ id: 'a', type: 42 }], [], []]
        });
        const messages = error.issues.map(issue => issue.message);

        expect(error.issues.length).toBe(2);
        expect(formatSettingsIssues(error)).toEqual([
            `lines[0][0].type: ${messages[0]}`,
            `flexMode: ${messages[1]}`
        ]);
    });

    it('renders nested object paths with dots and array indexes in brackets', () => {
        const error = failingParse({
            version: CURRENT_VERSION,
            lines: [[{ id: 'a', type: 'model', metadata: { url: 7 } }]],
            powerline: { enabled: 'yes' }
        });
        const messages = error.issues.map(issue => issue.message);

        expect(error.issues.length).toBe(2);
        expect(formatSettingsIssues(error)).toEqual([
            `lines[0][0].metadata.url: ${messages[0]}`,
            `powerline.enabled: ${messages[1]}`
        ]);
    });

    it('renders a root-level issue as the bare message', () => {
        const error = failingParse(42);
        const messages = error.issues.map(issue => issue.message);

        expect(error.issues.length).toBe(1);
        expect(formatSettingsIssues(error)).toEqual([messages[0]]);
    });

    it('removes duplicate issue lines while keeping the first occurrence in place', () => {
        const schema = z.object({ flexMode: z.string() }).superRefine((_value, ctx) => {
            ctx.addIssue({ code: 'custom', path: ['flexMode'], message: 'repeated problem' });
            ctx.addIssue({ code: 'custom', path: ['compactThreshold'], message: 'another problem' });
            ctx.addIssue({ code: 'custom', path: ['flexMode'], message: 'repeated problem' });
        });
        const result = schema.safeParse({ flexMode: 'full' });
        if (result.success) {
            throw new Error('expected the refinement to fail');
        }

        expect(result.error.issues.length).toBe(3);
        expect(formatSettingsIssues(result.error)).toEqual([
            'flexMode: repeated problem',
            'compactThreshold: another problem'
        ]);
    });
});
