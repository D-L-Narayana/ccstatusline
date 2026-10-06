import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { Settings } from '../types/Settings';
import {
    getConfigPath,
    validateImportFile
} from '../utils/config';
import {
    collectConfigRisks,
    type ConfigRisk
} from '../utils/config-review';

import type { CliIo } from './io';
import { summarizeSettings } from './summary';

export const VALIDATE_EXIT_VALID = 0;
export const VALIDATE_EXIT_INVALID = 1;
export const VALIDATE_EXIT_UNREADABLE = 2;

/** `line N · <widget type> · <value>`, with N one-based like the TUI line numbers. */
export function formatConfigRiskLine(risk: ConfigRisk): string {
    return `line ${risk.lineIndex + 1} · ${risk.widgetType} · ${risk.value}`;
}

function expandHomePath(filePath: string): string {
    if (filePath === '~' || filePath.startsWith('~/')) {
        return path.join(os.homedir(), filePath.slice(2));
    }

    return filePath;
}

/** Why `filePath` cannot be read, or null when it is a readable file. */
async function describeUnreadable(filePath: string): Promise<string | null> {
    try {
        const stats = await fs.promises.stat(filePath);
        if (stats.isDirectory()) {
            return 'is a directory';
        }

        await fs.promises.access(filePath, fs.constants.R_OK);
        return null;
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
            return 'no such file';
        }
        if (code === 'EACCES' || code === 'EPERM') {
            return 'permission denied';
        }

        return code ?? 'unreadable';
    }
}

function formatRiskGroup(label: string, risks: ConfigRisk[]): string[] {
    if (risks.length === 0) {
        return [];
    }

    return [`  ${label}: ${risks.length}`, ...risks.map(risk => `    ${formatConfigRiskLine(risk)}`)];
}

function formatValidReport(target: string, settings: Settings): string {
    const summary = summarizeSettings(settings);
    const risks = collectConfigRisks(settings);
    const lines = [
        `${target}: valid`,
        `  lines: ${summary.lineCount}, widgets: ${summary.widgetCount}`
    ];

    if (risks.length === 0) {
        lines.push('  no shell commands or hyperlinks');
    } else {
        lines.push(
            ...formatRiskGroup('shell commands', risks.filter(risk => risk.kind === 'shell-command')),
            ...formatRiskGroup('hyperlinks', risks.filter(risk => risk.kind === 'hyperlink'))
        );
    }

    return `${lines.join('\n')}\n`;
}

/**
 * Validates `filePath` (or the active settings file) the way the TUI import
 * does — migration-aware, every schema issue reported — and lists the shell
 * commands and hyperlinks a valid configuration contains.
 *
 * Exit codes: 0 valid, 1 invalid, 2 when the file cannot be read.
 */
export async function runValidate(filePath: string | undefined, io: CliIo): Promise<number> {
    const target = filePath === undefined ? getConfigPath() : expandHomePath(filePath);

    const problem = await describeUnreadable(target);
    if (problem !== null) {
        io.stderr(`ccstatusline: cannot read ${target}: ${problem}\n`);
        return VALIDATE_EXIT_UNREADABLE;
    }

    const result = await validateImportFile(target);
    if (result.status === 'invalid') {
        const issues = result.issues.map(issue => `  ${issue}`);
        io.stdout(`${[`${target}: invalid`, ...issues].join('\n')}\n`);
        return VALIDATE_EXIT_INVALID;
    }

    io.stdout(formatValidReport(target, result.data));
    return VALIDATE_EXIT_VALID;
}
