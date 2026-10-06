#!/usr/bin/env bun
/**
 * Bundle smoke test for the published package.
 *
 * Executes dist/ccstatusline.js under Node — the runtime Claude Code and npm users
 * actually run — inside a throwaway home directory, and checks the behaviours a
 * release must not regress: the version flag, a piped status line render, the
 * error paths, the headless CLI flags, and the static-import closure of the entry
 * point (the status line hot path must not load the TUI framework).
 *
 *   bun run scripts/smoke-dist.ts [--no-build] [--phase=baseline|all]
 *
 *   --no-build        smoke the existing dist/ instead of running `bun run build` first
 *   --phase=baseline  only the cases every build must pass (version, piped render,
 *                     error paths); `all` (default) adds the CLI flags and the chunk
 *                     isolation check
 *
 * Exit status: 0 when every case passes, 1 when any case fails, 2 on usage errors.
 * Fixtures live in scripts/smoke/.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

type Phase = 'baseline' | 'all';

interface CliOptions {
    build: boolean;
    phase: Phase;
}

interface IsolatedHome {
    home: string;
    claudeConfigDir: string;
    cacheDir: string;
    settingsPath: string;
}

interface RunResult {
    status: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    error: string | null;
}

interface CaseOutcome {
    failures: string[];
    notes: string[];
}

interface SmokeCase {
    id: string;
    name: string;
    phase: Phase;
    run: () => CaseOutcome;
}

interface SmokeContext {
    isolated: IsolatedHome;
    packageVersion: string;
    runDist: (args: string[], input?: string) => RunResult;
}

interface StaticClosure {
    files: string[];
    missing: string[];
}

const USAGE = 'usage: bun run scripts/smoke-dist.ts [--no-build] [--phase=baseline|all]';
const CHILD_TIMEOUT_MS = 30_000;
const BUILD_TIMEOUT_MS = 10 * 60_000;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

const repoRoot = path.resolve(import.meta.dirname, '..');
const distDir = path.join(repoRoot, 'dist');
const distEntry = path.join(distDir, 'ccstatusline.js');
const payloadPath = path.join(repoRoot, 'scripts', 'payload.example.json');
const brokenSettingsPath = path.join(repoRoot, 'scripts', 'smoke', 'broken-settings.json');

// Strings that only the bundled TUI framework contains: ink's host config node
// names and the React runtime's element symbols. The status line hot path must
// never statically import a chunk that carries them.
const TUI_MARKERS = ['ink-root', 'ink-box', 'Symbol.for("react.'];

// Top-level `import … from "./x.js"`, `export … from "./x.js"` and bare
// `import "./x.js"` statements. `[^;(]` keeps dynamic `import("./x.js")`
// expressions (the TUI's lazy load) out of the closure and stops a match at the
// end of the statement.
const STATIC_IMPORT_PATTERN = /^(?:import\s+["'](\.\/[^"']+)["']|(?:import|export)\s+[^;(]*?\bfrom\s+["'](\.\/[^"']+)["'])/gm;

// SGR sequences (colors, bold, reset) emitted by chalk and the renderer.
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;
// The status line swaps spaces for no-break spaces (U+00A0) so editors cannot trim them.
const NO_BREAK_SPACE = String.fromCharCode(0xa0);
const STACK_FRAME_PATTERN = /^\s*at\s+\S/m;
const HELP_FLAGS = ['--preview', '--validate', '--schema', '--doctor'];

// Node needs a few more variables than PATH to start on Windows (process.env is
// case-insensitive there, so one spelling each suffices). Nothing else from the
// parent environment reaches the children, so the real user profile, Claude
// config directory and cache stay untouched.
const WINDOWS_PASSTHROUGH = ['SystemRoot', 'windir', 'PATHEXT', 'ComSpec', 'TEMP', 'TMP'];

function exitWithUsage(message: string): never {
    console.error(`smoke-dist: ${message}`);
    console.error(USAGE);
    process.exit(2);
}

function parsePhase(value: string): Phase {
    if (value === 'baseline' || value === 'all') {
        return value;
    }

    return exitWithUsage(`unknown phase "${value}"`);
}

function parseArgs(argv: string[]): CliOptions {
    const options: CliOptions = { build: true, phase: 'all' };
    for (const arg of argv) {
        if (arg === '--no-build') {
            options.build = false;
        } else if (arg.startsWith('--phase=')) {
            options.phase = parsePhase(arg.slice('--phase='.length));
        } else {
            exitWithUsage(`unknown argument "${arg}"`);
        }
    }

    return options;
}

function textOf(value: string | null | undefined): string {
    // spawnSync reports null streams when the child could not be started at all.
    return value ?? '';
}

function excerpt(text: string, limit = 200): string {
    const compact = text.replace(/\s+/g, ' ').trim();
    const clipped = compact.length > limit ? `${compact.slice(0, limit)}…` : compact;
    return JSON.stringify(clipped);
}

function plainText(text: string): string {
    // Drop colors and undo the no-break-space substitution before looking for readable content.
    return text.replace(ANSI_PATTERN, '').replaceAll(NO_BREAK_SPACE, ' ');
}

function nonEmptyLines(text: string): string[] {
    return plainText(text).split('\n').filter(line => line.trim().length > 0);
}

function describeRun(result: RunResult): string {
    const parts = [`exit=${result.status ?? 'null'}`];
    if (result.signal !== null) {
        parts.push(`signal=${result.signal}`);
    }
    if (result.error !== null) {
        parts.push(`error=${result.error}`);
    }
    parts.push(`stdout=${excerpt(result.stdout)}`, `stderr=${excerpt(result.stderr)}`);
    return parts.join(' ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonObject(text: string): Record<string, unknown> | null {
    try {
        const parsed: unknown = JSON.parse(text);
        return isRecord(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function readPackageVersion(): string {
    const packageJson = parseJsonObject(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const version = packageJson?.version;
    return typeof version === 'string' ? version : '';
}

function buildDist(): void {
    console.log('smoke-dist: building dist/ (bun run build)');
    const result = spawnSync('bun', ['run', 'build'], { cwd: repoRoot, stdio: 'inherit', timeout: BUILD_TIMEOUT_MS });
    if (result.status !== 0) {
        const reason = result.error ? result.error.message : `exit ${result.status ?? 'null'}`;
        console.error(`smoke-dist: build failed (${reason})`);
        process.exit(1);
    }
}

function detectNodeVersion(): string {
    const result = spawnSync('node', ['--version'], { encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, windowsHide: true });
    if (result.error !== undefined || result.status !== 0) {
        console.error('smoke-dist: `node` must be on PATH to execute dist/ccstatusline.js');
        process.exit(1);
    }

    return textOf(result.stdout).trim();
}

function createIsolatedHome(): IsolatedHome {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-smoke-'));
    const claudeConfigDir = path.join(home, '.claude');
    fs.mkdirSync(claudeConfigDir, { recursive: true });

    return {
        home,
        claudeConfigDir,
        cacheDir: path.join(home, 'cache'),
        settingsPath: path.join(home, 'settings.json')
    };
}

function buildChildEnv(isolated: IsolatedHome): Record<string, string> {
    const env: Record<string, string> = {
        PATH: process.env.PATH ?? '',
        HOME: isolated.home,
        USERPROFILE: isolated.home,
        CLAUDE_CONFIG_DIR: isolated.claudeConfigDir,
        CCSTATUSLINE_CACHE_DIR: isolated.cacheDir,
        CCSTATUSLINE_WIDTH: '120'
    };
    for (const name of WINDOWS_PASSTHROUGH) {
        const value = process.env[name];
        if (value !== undefined) {
            env[name] = value;
        }
    }

    return env;
}

function staticImportTargets(source: string): string[] {
    const targets: string[] = [];
    for (const match of source.matchAll(STATIC_IMPORT_PATTERN)) {
        const target = match[1] ?? match[2];
        if (target !== undefined) {
            targets.push(path.normalize(target));
        }
    }

    return targets;
}

function collectStaticClosure(entryFile: string): StaticClosure {
    const visited = new Set<string>();
    const missing: string[] = [];
    const queue = [entryFile];
    while (queue.length > 0) {
        const file = queue.shift();
        if (file === undefined || visited.has(file)) {
            continue;
        }

        const fullPath = path.join(distDir, file);
        if (!fs.existsSync(fullPath)) {
            missing.push(file);
            continue;
        }

        visited.add(file);
        queue.push(...staticImportTargets(fs.readFileSync(fullPath, 'utf8')));
    }

    return { files: [...visited], missing };
}

function newOutcome(): CaseOutcome {
    return { failures: [], notes: [] };
}

function expectExit(result: RunResult, expected: number, out: CaseOutcome): void {
    if (result.status !== expected) {
        out.failures.push(`expected exit ${expected}, got ${describeRun(result)}`);
    }
}

function expectStderrIncludes(result: RunResult, needle: string, out: CaseOutcome): void {
    if (!result.stderr.includes(needle)) {
        out.failures.push(`stderr does not contain "${needle}": ${excerpt(result.stderr)}`);
    }
}

function expectHandledByCli(result: RunResult, out: CaseOutcome): void {
    // The headless flags are handled before stdin is read. This message belongs to
    // the piped render path, so seeing it means the flag fell through unhandled —
    // and a bare "exit 1" would otherwise look like a legitimate validation failure.
    if (result.stderr.includes('No input received')) {
        out.failures.push('flag fell through to the piped render path ("No input received")');
    }
}

function expectJsonObject(result: RunResult, out: CaseOutcome): Record<string, unknown> | null {
    const parsed = parseJsonObject(result.stdout);
    if (parsed === null) {
        out.failures.push(`stdout is not a JSON object: ${excerpt(result.stdout)}`);
    }

    return parsed;
}

function buildCases(context: SmokeContext): SmokeCase[] {
    const { isolated, runDist } = context;

    return [
        {
            id: 'a',
            name: '--version prints the package.json version',
            phase: 'baseline',
            run: () => {
                const out = newOutcome();
                const result = runDist(['--version']);
                expectExit(result, 0, out);
                if (result.stdout.trim() !== context.packageVersion) {
                    out.failures.push(`expected "${context.packageVersion}", got ${excerpt(result.stdout)}`);
                }
                out.notes.push(result.stdout.trim());
                return out;
            }
        },
        {
            id: 'b',
            name: 'piped payload renders the status line without errors',
            phase: 'baseline',
            run: () => {
                const out = newOutcome();
                const result = runDist([], fs.readFileSync(payloadPath, 'utf8'));
                expectExit(result, 0, out);
                const plain = plainText(result.stdout);
                if (!plain.includes('Opus 4.6')) {
                    out.failures.push(`stdout lacks the model display name "Opus 4.6": ${excerpt(plain)}`);
                }
                if (!result.stdout.startsWith('\x1b[0m')) {
                    out.failures.push(`stdout does not start with the reset sequence: ${excerpt(result.stdout)}`);
                }
                if (STACK_FRAME_PATTERN.test(result.stderr)) {
                    out.failures.push(`stderr contains a stack trace: ${excerpt(result.stderr)}`);
                }
                const lines = nonEmptyLines(result.stdout);
                out.notes.push(`${lines.length} line(s), first=${excerpt(lines[0] ?? '', 80)}`, `stderr=${excerpt(result.stderr, 80)}`);
                return out;
            }
        },
        {
            id: 'c',
            name: 'malformed stdin JSON exits 1 with a parse error',
            phase: 'baseline',
            run: () => {
                const out = newOutcome();
                const result = runDist([], '{not json');
                expectExit(result, 1, out);
                expectStderrIncludes(result, 'Error parsing JSON', out);
                return out;
            }
        },
        {
            id: 'd',
            name: 'empty stdin exits 1 with "No input received"',
            phase: 'baseline',
            run: () => {
                const out = newOutcome();
                const result = runDist([], '');
                expectExit(result, 1, out);
                expectStderrIncludes(result, 'No input received', out);
                return out;
            }
        },
        {
            id: 'e',
            name: 'schema-invalid stdin JSON exits 1 with a format error',
            phase: 'baseline',
            run: () => {
                const out = newOutcome();
                const result = runDist([], '{"context_window":{"context_window_size":"abc"}}');
                expectExit(result, 1, out);
                expectStderrIncludes(result, 'Invalid status JSON format', out);
                return out;
            }
        },
        {
            id: 'f',
            name: '--help lists the headless CLI flags',
            phase: 'all',
            run: () => {
                const out = newOutcome();
                const result = runDist(['--help']);
                expectExit(result, 0, out);
                expectHandledByCli(result, out);
                const missing = HELP_FLAGS.filter(flag => !result.stdout.includes(flag));
                if (missing.length > 0) {
                    out.failures.push(`help text lacks ${missing.join(', ')}: ${excerpt(result.stdout)}`);
                }
                out.notes.push(`${nonEmptyLines(result.stdout).length} line(s)`);
                return out;
            }
        },
        {
            id: 'g',
            name: '--preview --width 80 renders at least one line',
            phase: 'all',
            run: () => {
                const out = newOutcome();
                const result = runDist(['--preview', '--width', '80']);
                expectExit(result, 0, out);
                expectHandledByCli(result, out);
                const lines = nonEmptyLines(result.stdout);
                if (lines.length === 0) {
                    out.failures.push(`no non-empty line in ${describeRun(result)}`);
                }
                out.notes.push(`${lines.length} line(s), first=${excerpt(lines[0] ?? '', 80)}`);
                return out;
            }
        },
        {
            id: 'h',
            name: '--preview --width 80 --json emits a lines array',
            phase: 'all',
            run: () => {
                const out = newOutcome();
                const result = runDist(['--preview', '--width', '80', '--json']);
                expectExit(result, 0, out);
                expectHandledByCli(result, out);
                const parsed = expectJsonObject(result, out);
                if (parsed !== null && !Array.isArray(parsed.lines)) {
                    out.failures.push(`JSON has no "lines" array: ${excerpt(result.stdout)}`);
                }
                if (parsed !== null && Array.isArray(parsed.lines)) {
                    out.notes.push(`${parsed.lines.length} line(s)`);
                }
                return out;
            }
        },
        {
            id: 'i',
            name: '--schema emits a JSON Schema with properties.lines',
            phase: 'all',
            run: () => {
                const out = newOutcome();
                const result = runDist(['--schema']);
                expectExit(result, 0, out);
                expectHandledByCli(result, out);
                const parsed = expectJsonObject(result, out);
                if (parsed !== null && !(isRecord(parsed.properties) && 'lines' in parsed.properties)) {
                    out.failures.push(`JSON has no properties.lines: ${excerpt(result.stdout)}`);
                }
                if (parsed !== null && isRecord(parsed.properties)) {
                    out.notes.push(`${Object.keys(parsed.properties).length} top-level propert(y/ies)`);
                }
                return out;
            }
        },
        {
            id: 'j',
            name: '--doctor --json reports settings and cache sections',
            phase: 'all',
            run: () => {
                const out = newOutcome();
                const result = runDist(['--doctor', '--json']);
                expectExit(result, 0, out);
                expectHandledByCli(result, out);
                const parsed = expectJsonObject(result, out);
                if (parsed !== null) {
                    const missing = ['settings', 'cache'].filter(key => !(key in parsed));
                    if (missing.length > 0) {
                        out.failures.push(`JSON lacks ${missing.join(', ')}: ${excerpt(result.stdout)}`);
                    }
                    out.notes.push(`keys=${Object.keys(parsed).join(',')}`);
                }
                return out;
            }
        },
        {
            id: 'k1',
            name: '--validate accepts the default settings written by the render',
            phase: 'all',
            run: () => {
                const out = newOutcome();
                if (!fs.existsSync(isolated.settingsPath)) {
                    out.failures.push('the piped render case did not write default settings');
                    return out;
                }
                const result = runDist(['--validate']);
                expectExit(result, 0, out);
                expectHandledByCli(result, out);
                out.notes.push(`stdout=${excerpt(result.stdout, 80)}`);
                return out;
            }
        },
        {
            id: 'k2',
            name: '--validate rejects scripts/smoke/broken-settings.json',
            phase: 'all',
            run: () => {
                const out = newOutcome();
                const result = runDist(['--validate', brokenSettingsPath]);
                expectExit(result, 1, out);
                expectHandledByCli(result, out);
                // The fixture's only defect is `lines`; a real validation report names it.
                if (!`${result.stdout}\n${result.stderr}`.includes('lines')) {
                    out.failures.push(`output does not name the offending "lines" key: ${describeRun(result)}`);
                }
                out.notes.push(`stdout=${excerpt(result.stdout, 80)}`, `stderr=${excerpt(result.stderr, 80)}`);
                return out;
            }
        },
        {
            id: 'l',
            name: 'entry static-import closure excludes the TUI framework chunk',
            phase: 'all',
            run: () => {
                const out = newOutcome();
                const sources = new Map<string, string>();
                for (const file of fs.readdirSync(distDir)) {
                    if (file.endsWith('.js')) {
                        sources.set(file, fs.readFileSync(path.join(distDir, file), 'utf8'));
                    }
                }

                const allSources = [...sources.values()];
                const absentMarkers = TUI_MARKERS.filter(marker => !allSources.some(source => source.includes(marker)));
                if (absentMarkers.length > 0) {
                    out.failures.push(`markers not found — update the smoke markers (absent: ${absentMarkers.join(', ')})`);
                    return out;
                }

                const closure = collectStaticClosure(path.basename(distEntry));
                for (const file of closure.missing) {
                    out.failures.push(`${file} is statically imported but missing from dist/`);
                }

                let closureBytes = 0;
                for (const file of closure.files) {
                    const source = sources.get(file) ?? '';
                    closureBytes += Buffer.byteLength(source);
                    const hits = TUI_MARKERS.filter(marker => source.includes(marker));
                    if (hits.length > 0) {
                        out.failures.push(`${file} contains ${hits.join(', ')}`);
                    }
                }

                const totalBytes = allSources.reduce((sum, source) => sum + Buffer.byteLength(source), 0);
                out.notes.push(
                    `closure=${closure.files.length} of ${sources.size} file(s), `
                    + `${closureBytes.toLocaleString('en-US')} of ${totalBytes.toLocaleString('en-US')} bytes `
                    + `(${closure.files.join(', ')})`
                );
                return out;
            }
        }
    ];
}

function runCase(smokeCase: SmokeCase): CaseOutcome {
    try {
        return smokeCase.run();
    } catch (error) {
        return { failures: [`threw: ${error instanceof Error ? error.message : String(error)}`], notes: [] };
    }
}

function main(): number {
    const options = parseArgs(process.argv.slice(2));
    if (options.build) {
        buildDist();
    }

    if (!fs.existsSync(distEntry)) {
        console.error(`smoke-dist: ${path.relative(repoRoot, distEntry)} not found; run without --no-build to build it`);
        return 1;
    }

    const nodeVersion = detectNodeVersion();
    const isolated = createIsolatedHome();
    const childEnv = buildChildEnv(isolated);
    const context: SmokeContext = {
        isolated,
        packageVersion: readPackageVersion(),
        runDist: (args, input = '') => {
            const result = spawnSync('node', [distEntry, '--config', isolated.settingsPath, ...args], {
                cwd: isolated.home,
                env: childEnv,
                input,
                encoding: 'utf8',
                timeout: CHILD_TIMEOUT_MS,
                maxBuffer: MAX_OUTPUT_BYTES,
                windowsHide: true
            });

            return {
                status: result.status,
                signal: result.signal,
                stdout: textOf(result.stdout),
                stderr: textOf(result.stderr),
                error: result.error ? result.error.message : null
            };
        }
    };

    console.log(`smoke-dist: phase=${options.phase} node=${nodeVersion} bun=${Bun.version} package=${context.packageVersion}`);
    console.log(`smoke-dist: dist=${path.relative(repoRoot, distEntry)} home=${isolated.home}`);

    let passed = 0;
    let failed = 0;
    try {
        const cases = buildCases(context).filter(smokeCase => options.phase === 'all' || smokeCase.phase === 'baseline');
        for (const smokeCase of cases) {
            const result = runCase(smokeCase);
            const ok = result.failures.length === 0;
            const detail = ok ? result.notes.join('; ') : [...result.failures, ...result.notes].join('; ');
            console.log(`${ok ? 'PASS' : 'FAIL'}  [${smokeCase.id}] ${smokeCase.name}${detail ? ` — ${detail}` : ''}`);
            if (ok) {
                passed += 1;
            } else {
                failed += 1;
            }
        }
    } finally {
        fs.rmSync(isolated.home, { recursive: true, force: true });
    }

    console.log(`smoke-dist: ${passed} passed, ${failed} failed (phase=${options.phase})`);
    if (options.phase === 'baseline') {
        console.log('smoke-dist: baseline phase only; the release gate is --phase=all');
    }

    return failed > 0 ? 1 : 0;
}

process.exit(main());
