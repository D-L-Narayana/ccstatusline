import * as os from 'node:os';
import * as path from 'node:path';

/** Environment variable that relocates every ccstatusline cache file. */
export const CACHE_DIR_ENV_VAR = 'CCSTATUSLINE_CACHE_DIR';

/**
 * Directory holding every ccstatusline cache file.
 *
 * @remarks
 * A non-blank `CCSTATUSLINE_CACHE_DIR` wins and is resolved against the working
 * directory, so sandboxed or CI renders can isolate their caches without faking
 * the home directory. Otherwise the cache lives at `<home>/.cache/ccstatusline`.
 * Both inputs are read on every call rather than captured at module load, so a
 * change to the environment or to the home directory lookup is observed by the
 * very next call.
 *
 * @param homedir - Home directory lookup; defaults to `os.homedir`
 */
export function getCacheDir(homedir: () => string = os.homedir): string {
    const override = process.env[CACHE_DIR_ENV_VAR]?.trim();
    if (override) {
        return path.resolve(override);
    }

    return path.join(homedir(), '.cache', 'ccstatusline');
}

/** Joins `segments` onto {@link getCacheDir}. */
export function getCachePath(...segments: string[]): string {
    return path.join(getCacheDir(), ...segments);
}
