import type * as childProcess from 'child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it
} from 'vitest';

// Other suites mock child_process globally under Bun; bundling needs the real one.
const require = createRequire(import.meta.url);
const { execFileSync } = require('node:child_process') as typeof childProcess;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-hot-path-'));
const splitOutDir = path.join(tempRoot, 'split');

// Strings that only the bundled TUI framework (ink host config, React runtime)
// contains. The status line render path must never pull them in.
const TUI_MARKERS = ['ink-root', 'ink-box', 'Symbol.for("react.'];

// Top-level static `import … from "./chunk.js"` / `export … from "./chunk.js"`.
// `[^;(]` keeps dynamic `import("./x.js")` expressions out of the closure.
const STATIC_IMPORT_PATTERN = /^(?:import|export)\s+[^;(]*?\bfrom\s+"(\.\/[^"]+)"/gm;

// Modules the piped render path is built from; each must bundle without the TUI.
const RENDER_PATH_MODULES = ['src/utils/renderer.ts', 'src/utils/render-lines.ts'];

function bundleSplit(entry: string, outDir: string): void {
    execFileSync('bun', [
        'build',
        path.join(repoRoot, entry),
        '--target=node',
        '--splitting',
        '--format=esm',
        `--outdir=${outDir}`,
        '--target-version=14'
    ], { cwd: repoRoot, stdio: 'pipe' });
}

function bundleSingle(entry: string, outFile: string): void {
    execFileSync('bun', [
        'build',
        path.join(repoRoot, entry),
        '--target=node',
        '--target-version=14',
        `--outfile=${outFile}`
    ], { cwd: repoRoot, stdio: 'pipe' });
}

function collectStaticClosure(outDir: string, entryFile: string): string[] {
    const visited = new Set<string>();
    const queue = [entryFile];

    while (queue.length > 0) {
        const file = queue.shift();
        if (!file || visited.has(file)) {
            continue;
        }

        visited.add(file);
        const source = fs.readFileSync(path.join(outDir, file), 'utf8');
        for (const match of source.matchAll(STATIC_IMPORT_PATTERN)) {
            const target = match[1];
            if (target) {
                queue.push(path.normalize(target));
            }
        }
    }

    return [...visited];
}

function markersIn(source: string): string[] {
    return TUI_MARKERS.filter(marker => source.includes(marker));
}

beforeAll(() => {
    bundleSplit('src/ccstatusline.ts', splitOutDir);
});

afterAll(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('hot-path isolation', () => {
    it('keeps the TUI markers somewhere in the split bundle so the check stays meaningful', () => {
        const allSources = fs.readdirSync(splitOutDir)
            .filter(file => file.endsWith('.js'))
            .map(file => fs.readFileSync(path.join(splitOutDir, file), 'utf8'))
            .join('\n');

        expect(markersIn(allSources)).toEqual(TUI_MARKERS);
    });

    it('does not statically import the TUI framework from the status line entry point', () => {
        const closure = collectStaticClosure(splitOutDir, 'ccstatusline.js');
        const offenders = closure
            .map(file => ({ file, markers: markersIn(fs.readFileSync(path.join(splitOutDir, file), 'utf8')) }))
            .filter(entry => entry.markers.length > 0);

        expect(closure).toContain('ccstatusline.js');
        expect(offenders).toEqual([]);
    });

    it.each(RENDER_PATH_MODULES)('bundles %s without the TUI framework', (entry) => {
        const outFile = path.join(tempRoot, `${path.basename(entry, '.ts')}.mjs`);
        bundleSingle(entry, outFile);

        expect(markersIn(fs.readFileSync(outFile, 'utf8'))).toEqual([]);
    });
});
