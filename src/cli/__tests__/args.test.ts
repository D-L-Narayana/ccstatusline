import {
    describe,
    expect,
    it
} from 'vitest';

import { GIT_REVIEW_REFRESH_FLAG } from '../../utils/git-review-cache';
import {
    CLI_OPTIONS,
    INTERNAL_FLAGS,
    findUnknownOptions
} from '../args';

const DOCUMENTED_FLAGS = [
    '--help',
    '--version',
    '--config',
    '--preview',
    '--width',
    '--json',
    '--validate',
    '--schema',
    '--doctor'
];

describe('CLI_OPTIONS', () => {
    it('covers every documented flag exactly once', () => {
        const flags = CLI_OPTIONS.map(option => option.flag);

        expect([...flags].sort()).toEqual([...DOCUMENTED_FLAGS].sort());
    });

    it('declares an argument placeholder only for options that take a value', () => {
        const byFlag = new Map(CLI_OPTIONS.map(option => [option.flag, option]));

        expect(byFlag.get('--config')?.argument).toBe('<path>');
        expect(byFlag.get('--width')?.argument).toBe('<columns>');
        expect(byFlag.get('--validate')?.argument).toBe('[file]');
        expect(byFlag.get('--schema')?.argument).toBe('[settings|status-json]');
        expect(byFlag.get('--preview')?.argument).toBeUndefined();
        expect(byFlag.get('--json')?.argument).toBeUndefined();
        expect(byFlag.get('--doctor')?.argument).toBeUndefined();
    });

    it('gives every option a non-empty description', () => {
        expect(CLI_OPTIONS.length).toBeGreaterThan(0);
        for (const option of CLI_OPTIONS) {
            expect(option.description.trim().length).toBeGreaterThan(0);
        }
    });
});

describe('findUnknownOptions', () => {
    it('returns nothing when every option is known', () => {
        expect(findUnknownOptions(['--preview', '--width', '80', '--json'])).toEqual([]);
    });

    it('reports tokens that look like options but are not known, in order', () => {
        expect(findUnknownOptions(['--bogus', '--preview', '--also-bogus'])).toEqual(['--bogus', '--also-bogus']);
    });

    it('never treats the value after --config as an option', () => {
        expect(findUnknownOptions(['--config', '/tmp/settings.json', '--preview'])).toEqual([]);
        expect(findUnknownOptions(['--config', 'relative/settings.json'])).toEqual([]);
    });

    it('still reports an unknown flag that follows --config without a value', () => {
        expect(findUnknownOptions(['--config', '--bogus'])).toEqual(['--bogus']);
    });

    it('excludes the internal flags and their positional arguments', () => {
        expect(findUnknownOptions(['--hook'])).toEqual([]);
        expect(findUnknownOptions(['--internal-refresh-git-review-cache', '/repo', 'checks', '/tmp/lock'])).toEqual([]);
    });

    it('keeps the internal flag list in step with the entry point constants', () => {
        expect(INTERNAL_FLAGS).toContain('--hook');
        expect(INTERNAL_FLAGS).toContain(GIT_REVIEW_REFRESH_FLAG);
    });

    it('stops at the end-of-options marker', () => {
        expect(findUnknownOptions(['--preview', '--', '--not-an-option'])).toEqual([]);
    });

    it('ignores single-dash tokens and positional values', () => {
        expect(findUnknownOptions(['-h', 'settings', '--validate', 'export.json', '--schema', 'status-json'])).toEqual([]);
    });

    it('reports each unknown flag once', () => {
        expect(findUnknownOptions(['--bogus', '--bogus'])).toEqual(['--bogus']);
    });

    it('reports --flag=value forms, which the entry point does not parse', () => {
        expect(findUnknownOptions(['--config=/tmp/settings.json'])).toEqual(['--config=/tmp/settings.json']);
    });
});
