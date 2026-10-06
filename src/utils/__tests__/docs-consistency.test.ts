import * as fs from 'fs';
import * as path from 'path';
import {
    describe,
    expect,
    it
} from 'vitest';

import { CLI_OPTIONS } from '../../cli/args';
// The registry module must finish initializing before the manifest is read on
// its own: widget-manifest.ts imports every widget class, several widgets pull
// in utils (config, renderer) that import the registry, and the registry reads
// WIDGET_MANIFEST while it loads.
import '../widgets';
import { WIDGET_MANIFEST } from '../widget-manifest';

// Guards docs/USAGE.md against drifting away from the code: every widget the
// TUI offers must be documented under its exact display name, and every
// command-line option must appear in the flag reference.
const USAGE_DOC_PATH = path.join(import.meta.dirname, '..', '..', '..', 'docs', 'USAGE.md');

function readUsageDoc(): string {
    return fs.readFileSync(USAGE_DOC_PATH, 'utf-8');
}

// Contents of every single-line Markdown code span, in document order.
// Scanning left to right pairs each opening backtick with the next one, so text
// between two spans is never mistaken for code.
function getCodeSpans(doc: string): string[] {
    return (doc.match(/`[^`\n]+`/g) ?? []).map(span => span.slice(1, -1));
}

// Splits a flag entry such as '--help, -h' or '--width <n>' into its option
// tokens, ignoring argument placeholders and optional-group brackets.
function getFlagTokens(flag: string): string[] {
    return flag
        .split(/[\s,|/]+/)
        .map(token => token.replace(/^\[+|\]+$/g, ''))
        .filter(token => token.startsWith('-'));
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// True when some code span contains the token as a whole option: at the start
// or after a separator, and not followed by more option characters (so `-h`
// does not match `--hook`, and `--help` does not match `--helpful`).
function isDocumentedFlag(codeSpans: string[], token: string): boolean {
    const pattern = new RegExp(`(?:^|[^\\w-])${escapeRegExp(token)}(?![\\w-])`);
    return codeSpans.some(span => pattern.test(span));
}

describe('docs/USAGE.md widget coverage', () => {
    it('documents every manifest widget display name in bold', () => {
        const usageDoc = readUsageDoc();
        const displayNames = WIDGET_MANIFEST.map(entry => entry.create().getDisplayName());
        // An empty name cannot be documented, so it is reported as missing
        // rather than matching a stray `****`.
        const missing = displayNames.filter(name => name.length === 0 || !usageDoc.includes(`**${name}**`));

        expect(displayNames.length).toBeGreaterThan(0);
        expect(missing).toEqual([]);
    });
});

describe('docs/USAGE.md command-line flag coverage', () => {
    it('documents every CLI option flag in a code span', () => {
        const codeSpans = getCodeSpans(readUsageDoc());
        const tokens = CLI_OPTIONS.flatMap(option => getFlagTokens(option.flag));
        const missing = tokens.filter(token => !isDocumentedFlag(codeSpans, token));

        expect(tokens.length).toBeGreaterThan(0);
        expect(missing).toEqual([]);
    });
});
