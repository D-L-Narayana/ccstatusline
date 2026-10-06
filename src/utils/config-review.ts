import type { z } from 'zod';

import type { Settings } from '../types/Settings';
import type { WidgetItem } from '../types/Widget';

export type ConfigRiskKind = 'shell-command' | 'hyperlink';

export interface ConfigRisk {
    kind: ConfigRiskKind;
    /** Zero-based index into settings.lines. */
    lineIndex: number;
    /** Zero-based position of the widget within its line. */
    itemIndex: number;
    widgetType: string;
    /** The shell command or URL, trimmed. */
    value: string;
}

type RiskDetail = Pick<ConfigRisk, 'kind' | 'value'>;

function getItemRisk(item: WidgetItem): RiskDetail | null {
    if (item.type === 'custom-command') {
        const command = item.commandPath?.trim() ?? '';
        return command.length > 0 ? { kind: 'shell-command', value: command } : null;
    }

    if (item.type === 'link') {
        const url = item.metadata?.url?.trim() ?? '';
        return url.length > 0 ? { kind: 'hyperlink', value: url } : null;
    }

    return null;
}

/**
 * Lists the parts of a configuration that do more than draw text: custom
 * commands run a shell command on every status line refresh and link widgets
 * emit terminal hyperlinks. Ordered by line, then by item position.
 */
export function collectConfigRisks(settings: Settings): ConfigRisk[] {
    const risks: ConfigRisk[] = [];

    for (const [lineIndex, line] of settings.lines.entries()) {
        for (const [itemIndex, item] of line.entries()) {
            const risk = getItemRisk(item);
            if (risk) {
                risks.push({
                    ...risk,
                    lineIndex,
                    itemIndex,
                    widgetType: item.type
                });
            }
        }
    }

    return risks;
}

/**
 * Renders a zod issue path like `lines[0][2].type`: the top-level key has no
 * prefix, object keys are joined with dots and array indexes use brackets.
 */
export function formatIssuePath(path: readonly PropertyKey[]): string {
    let rendered = '';

    for (const segment of path) {
        if (typeof segment === 'number') {
            rendered += `[${segment}]`;
            continue;
        }

        const key = String(segment);
        rendered += rendered.length > 0 ? `.${key}` : key;
    }

    return rendered;
}

/**
 * One line per zod issue, `<path>: <message>` (just the message for a
 * root-level issue), in the order zod reports them, with duplicates removed.
 */
export function formatSettingsIssues(error: z.ZodError): string[] {
    const lines: string[] = [];
    const seen = new Set<string>();

    for (const issue of error.issues) {
        const issuePath = formatIssuePath(issue.path);
        const line = issuePath.length > 0 ? `${issuePath}: ${issue.message}` : issue.message;
        if (seen.has(line)) {
            continue;
        }

        seen.add(line);
        lines.push(line);
    }

    return lines;
}
