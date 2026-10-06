import * as os from 'node:os';
import * as path from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    CACHE_DIR_ENV_VAR,
    getCacheDir,
    getCachePath
} from '../cache-dir';

const SPIED_HOME = path.join(path.sep, 'spied-home');
const DEFAULT_UNDER_SPIED_HOME = path.join(SPIED_HOME, '.cache', 'ccstatusline');

describe('cache directory', () => {
    let originalOverride: string | undefined;

    beforeEach(() => {
        originalOverride = process.env.CCSTATUSLINE_CACHE_DIR;
        delete process.env.CCSTATUSLINE_CACHE_DIR;
        vi.spyOn(os, 'homedir').mockReturnValue(SPIED_HOME);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        if (originalOverride === undefined) {
            delete process.env.CCSTATUSLINE_CACHE_DIR;
        } else {
            process.env.CCSTATUSLINE_CACHE_DIR = originalOverride;
        }
    });

    it('names the environment variable that relocates the cache', () => {
        expect(CACHE_DIR_ENV_VAR).toBe('CCSTATUSLINE_CACHE_DIR');
    });

    it('defaults to .cache/ccstatusline under the home directory', () => {
        expect(getCacheDir()).toBe(DEFAULT_UNDER_SPIED_HOME);
    });

    it('returns an absolute CCSTATUSLINE_CACHE_DIR unchanged', () => {
        const override = path.join(os.tmpdir(), 'ccstatusline-cache-override');
        process.env.CCSTATUSLINE_CACHE_DIR = override;

        expect(getCacheDir()).toBe(override);
    });

    it('resolves a relative CCSTATUSLINE_CACHE_DIR against the working directory', () => {
        process.env.CCSTATUSLINE_CACHE_DIR = path.join('relative', 'cache-dir');

        expect(getCacheDir()).toBe(path.join(process.cwd(), 'relative', 'cache-dir'));
    });

    it('trims surrounding whitespace from the override before resolving it', () => {
        const override = path.join(os.tmpdir(), 'ccstatusline-cache-trimmed');
        process.env.CCSTATUSLINE_CACHE_DIR = `  ${override}  `;

        expect(getCacheDir()).toBe(override);
    });

    it('ignores an empty or whitespace-only override', () => {
        process.env.CCSTATUSLINE_CACHE_DIR = '';
        expect(getCacheDir()).toBe(DEFAULT_UNDER_SPIED_HOME);

        process.env.CCSTATUSLINE_CACHE_DIR = '   ';
        expect(getCacheDir()).toBe(DEFAULT_UNDER_SPIED_HOME);
    });

    it('honors an injected home directory lookup', () => {
        const injectedHome = path.join(path.sep, 'injected-home');

        expect(getCacheDir(() => injectedHome)).toBe(path.join(injectedHome, '.cache', 'ccstatusline'));
    });

    it('lets the override win over an injected home directory lookup', () => {
        const override = path.join(os.tmpdir(), 'ccstatusline-cache-wins');
        process.env.CCSTATUSLINE_CACHE_DIR = override;

        expect(getCacheDir(() => path.join(path.sep, 'injected-home'))).toBe(override);
    });

    it('joins path segments onto the cache directory', () => {
        expect(getCachePath('git-cache', 'git-abc123.json')).toBe(
            path.join(DEFAULT_UNDER_SPIED_HOME, 'git-cache', 'git-abc123.json')
        );

        const override = path.join(os.tmpdir(), 'ccstatusline-cache-segments');
        process.env.CCSTATUSLINE_CACHE_DIR = override;

        expect(getCachePath('skills', 'skills-session.jsonl')).toBe(path.join(override, 'skills', 'skills-session.jsonl'));
    });

    it('observes environment and home changes between calls instead of caching them', () => {
        expect(getCacheDir()).toBe(DEFAULT_UNDER_SPIED_HOME);

        const override = path.join(os.tmpdir(), 'ccstatusline-cache-live');
        process.env.CCSTATUSLINE_CACHE_DIR = override;
        expect(getCacheDir()).toBe(override);

        delete process.env.CCSTATUSLINE_CACHE_DIR;
        expect(getCacheDir()).toBe(DEFAULT_UNDER_SPIED_HOME);

        const otherHome = path.join(path.sep, 'other-home');
        vi.spyOn(os, 'homedir').mockReturnValue(otherHome);
        expect(getCacheDir()).toBe(path.join(otherHome, '.cache', 'ccstatusline'));
    });
});
