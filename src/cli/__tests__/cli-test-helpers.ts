import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { initConfigPath } from '../../utils/config';
import { resetTerminalWidthCache } from '../../utils/terminal';
import type { CliIo } from '../io';

/** A CliIo that records everything written to it. */
export interface CapturingIo extends CliIo {
    stdoutText(): string;
    stderrText(): string;
}

export function createCapturingIo(): CapturingIo {
    const out: string[] = [];
    const err: string[] = [];

    return {
        stdout: (text) => { out.push(text); },
        stderr: (text) => { err.push(text); },
        stdoutText: () => out.join(''),
        stderrText: () => err.join('')
    };
}

/** Environment variables the CLI reads; every one is pinned or cleared per test. */
const ISOLATED_VARIABLES = [
    'HOME',
    'USERPROFILE',
    'CLAUDE_CONFIG_DIR',
    'CLAUDE_SECURESTORAGE_CONFIG_DIR',
    'CCSTATUSLINE_CACHE_DIR',
    'CCSTATUSLINE_WIDTH',
    'CCSTATUSLINE_CONTEXT_SIZE_FALLBACK',
    'HTTPS_PROXY',
    'https_proxy',
    'DEBUG_FONT_INSTALL'
] as const;

type IsolatedVariable = typeof ISOLATED_VARIABLES[number];

export interface IsolatedEnvironment {
    /** Throwaway root holding every directory below. */
    root: string;
    home: string;
    claudeConfigDir: string;
    cacheDir: string;
    /** Active ccstatusline settings path (registered through initConfigPath). */
    settingsPath: string;
    /** Restores the environment, the config path and the width memo, then deletes `root`. */
    restore(): void;
}

function setVariable(name: IsolatedVariable, value: string | undefined): void {
    if (value === undefined) {
        Reflect.deleteProperty(process.env, name);
    } else {
        process.env[name] = value;
    }
}

/**
 * Points HOME, CLAUDE_CONFIG_DIR, CCSTATUSLINE_CACHE_DIR and the ccstatusline
 * settings path at fresh temp directories so a test can never touch the real
 * user profile, and clears the remaining overrides the CLI reads.
 */
export function isolateEnvironment(prefix = 'ccstatusline-cli-'): IsolatedEnvironment {
    const original = new Map<IsolatedVariable, string | undefined>(
        ISOLATED_VARIABLES.map((name): [IsolatedVariable, string | undefined] => [name, process.env[name]])
    );
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    const home = path.join(root, 'home');
    const claudeConfigDir = path.join(root, 'claude');
    const cacheDir = path.join(root, 'cache');
    const settingsPath = path.join(root, 'config', 'settings.json');

    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(claudeConfigDir, { recursive: true });

    for (const name of ISOLATED_VARIABLES) {
        setVariable(name, undefined);
    }
    setVariable('HOME', home);
    setVariable('USERPROFILE', home);
    setVariable('CLAUDE_CONFIG_DIR', claudeConfigDir);
    setVariable('CCSTATUSLINE_CACHE_DIR', cacheDir);
    initConfigPath(settingsPath);
    resetTerminalWidthCache();

    return {
        root,
        home,
        claudeConfigDir,
        cacheDir,
        settingsPath,
        restore: () => {
            for (const [name, value] of original) {
                setVariable(name, value);
            }
            initConfigPath();
            resetTerminalWidthCache();
            fs.rmSync(root, { recursive: true, force: true });
        }
    };
}

export function writeJsonFile(filePath: string, value: unknown): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8');
}
