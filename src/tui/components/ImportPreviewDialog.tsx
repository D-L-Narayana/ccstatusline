import {
    Box,
    Text
} from 'ink';
import React, { useState } from 'react';

import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import {
    applyImport,
    type ImportValidationResult
} from '../../utils/config';
import {
    collectConfigRisks,
    type ConfigRisk
} from '../../utils/config-review';
import { getWidget } from '../../utils/widgets';

import { ConfirmDialog } from './ConfirmDialog';
import {
    List,
    type ListEntry
} from './List';

type ValidImportResult = Extract<ImportValidationResult, { status: 'valid' }>;

interface ImportPreviewDialogProps {
    validation: ValidImportResult;
    currentSettings: Settings;
    onApply: (mode: 'replace' | 'merge') => void;
    onCancel: () => void;
}

type ImportMode = 'replace' | 'merge' | 'cancel';
type ApplyMode = Exclude<ImportMode, 'cancel'>;

const EXCLUDED_KEYS = new Set(['version', 'installation', 'updatemessage']);

interface DiffEntry {
    path: string;
    current: unknown;
    imported: unknown;
}

export function getImportPreviewKeys(current: Settings, imported: Settings): (keyof Settings)[] {
    const keys = new Set([
        ...Object.keys(current),
        ...Object.keys(imported)
    ] as (keyof Settings)[]);
    return [...keys].filter(key => !EXCLUDED_KEYS.has(key));
}

export function getImportPreviewSettings(
    current: Settings,
    validation: ValidImportResult,
    mode: ApplyMode
): Settings {
    return applyImport(current, validation.data, mode, validation.presentKeys);
}

/** The confirmation shown before applying a config that runs shell commands. */
export function getShellCommandWarning(count: number): string {
    return `This configuration runs ${count} shell command(s) on every status line refresh. Apply anyway?`;
}

/** One review row per risk, e.g. `line 1 · Custom Command · git status`. */
export function formatConfigRiskRow(risk: ConfigRisk): string {
    const displayName = getWidget(risk.widgetType)?.getDisplayName() ?? risk.widgetType;
    return `line ${risk.lineIndex + 1} · ${displayName} · ${risk.value}`;
}

function formatScalar(value: unknown): string {
    if (value === null || value === undefined) {
        return 'none';
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
        return String(value);
    }
    if (typeof value === 'string') {
        return value || '(empty)';
    }
    return JSON.stringify(value);
}

function diffObject(current: Record<string, unknown>, imported: Record<string, unknown>, prefix: string): DiffEntry[] {
    const keys = new Set([...Object.keys(current), ...Object.keys(imported)]);
    const entries: DiffEntry[] = [];

    for (const key of keys) {
        const path = prefix ? `${prefix}.${key}` : key;
        const a = current[key];
        const b = imported[key];
        if (JSON.stringify(a) === JSON.stringify(b)) {
            continue;
        }

        if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
            entries.push(...diffObject(a as Record<string, unknown>, b as Record<string, unknown>, path));
        } else {
            entries.push({ path, current: a, imported: b });
        }
    }

    return entries;
}

function diffLines(currentLines: WidgetItem[][], importedLines: WidgetItem[][]): DiffEntry[] {
    const entries: DiffEntry[] = [];
    const lineCount = Math.max(currentLines.length, importedLines.length);

    for (let li = 0; li < lineCount; li++) {
        const curLine = currentLines[li] ?? [];
        const impLine = importedLines[li] ?? [];

        const widgetCount = Math.max(curLine.length, impLine.length);
        for (let wi = 0; wi < widgetCount; wi++) {
            const curWidget = curLine[wi];
            const impWidget = impLine[wi];

            if (JSON.stringify(curWidget) === JSON.stringify(impWidget)) {
                continue;
            }

            if (!curWidget) {
                const addedType = impWidget?.type ?? 'unknown';
                entries.push({ path: `line ${li + 1} +${addedType}`, current: undefined, imported: '[added]' });
                continue;
            }

            if (!impWidget) {
                entries.push({ path: `line ${li + 1} -${curWidget.type}`, current: '[removed]', imported: undefined });
                continue;
            }

            const label = `${curWidget.type} (line ${li + 1})`;
            const widgetKeys = new Set([...Object.keys(curWidget), ...Object.keys(impWidget)]) as Set<keyof WidgetItem>;
            for (const key of widgetKeys) {
                if (key === 'id') {
                    continue;
                }
                const a = curWidget[key];
                const b = impWidget[key];
                if (JSON.stringify(a) !== JSON.stringify(b)) {
                    entries.push({ path: `${label} ${key}`, current: a, imported: b });
                }
            }
        }
    }

    return entries;
}

export function ImportPreviewDialog({
    validation,
    currentSettings,
    onApply,
    onCancel
}: ImportPreviewDialogProps): React.JSX.Element {
    const [previewMode, setPreviewMode] = useState<ApplyMode>('replace');
    // The list entry chosen when the confirmation opened, so the mode list
    // re-highlights it after a declined confirmation. Only updated at select
    // time: echoing every highlight change back into the list would make the
    // parent and the list fight over the selection.
    const [listSelection, setListSelection] = useState(0);
    const [pendingMode, setPendingMode] = useState<ApplyMode | null>(null);
    const previewSettings = getImportPreviewSettings(currentSettings, validation, previewMode);
    const topLevelKeys = getImportPreviewKeys(currentSettings, previewSettings);
    const risks = collectConfigRisks(previewSettings);
    const shellCommandCount = risks.filter(risk => risk.kind === 'shell-command').length;

    const items: ListEntry<ImportMode>[] = [
        { label: 'Replace All', value: 'replace', description: 'Overwrite all settings with the imported config' },
        { label: 'Merge', value: 'merge', description: 'Overlay imported settings on top of current settings' },
        '-' as unknown as ListEntry<ImportMode>,
        { label: 'Cancel', value: 'cancel' }
    ];

    function handleSelect(value: ImportMode | 'back', index: number): void {
        if (value === 'cancel' || value === 'back') {
            onCancel();
            return;
        }

        if (shellCommandCount > 0) {
            // Shell commands execute on every refresh: ask before applying.
            setListSelection(index);
            setPendingMode(value);
            return;
        }

        onApply(value);
    }

    function handleSelectionChange(value: ImportMode | 'back'): void {
        if (value === 'replace' || value === 'merge') {
            setPreviewMode(value);
        }
    }

    const diffRows: React.JSX.Element[] = [];

    for (const key of topLevelKeys) {
        const current = currentSettings[key];
        const imported = previewSettings[key];
        const changed = JSON.stringify(current) !== JSON.stringify(imported);

        if (!changed) {
            diffRows.push(
                <Box key={key}>
                    <Text dimColor>{`  ${key}: ${formatScalar(current)}`}</Text>
                </Box>
            );
            continue;
        }

        if (key === 'lines') {
            const entries = diffLines(current as WidgetItem[][], imported as WidgetItem[][]);
            diffRows.push(
                <Box key={key} flexDirection='column'>
                    <Text>{`  ${key}:`}</Text>
                    {entries.map((e, i) => (
                        <Box key={i} marginLeft={4}>
                            <Text>{`${e.path}: `}</Text>
                            <Text color='red'>{formatScalar(e.current)}</Text>
                            <Text>{' → '}</Text>
                            <Text color='green'>{formatScalar(e.imported)}</Text>
                        </Box>
                    ))}
                </Box>
            );
            continue;
        }

        if (current && imported && typeof current === 'object' && typeof imported === 'object' && !Array.isArray(current)) {
            const entries = diffObject(
                current,
                imported as Record<string, unknown>,
                key
            );
            diffRows.push(
                <Box key={key} flexDirection='column'>
                    <Text>{`  ${key}:`}</Text>
                    {entries.map((e, i) => (
                        <Box key={i} marginLeft={4}>
                            <Text>{`${e.path}: `}</Text>
                            <Text color='red'>{formatScalar(e.current)}</Text>
                            <Text>{' → '}</Text>
                            <Text color='green'>{formatScalar(e.imported)}</Text>
                        </Box>
                    ))}
                </Box>
            );
            continue;
        }

        diffRows.push(
            <Box key={key}>
                <Text>{`  ${key}: `}</Text>
                <Text color='red'>{formatScalar(current)}</Text>
                <Text>{' → '}</Text>
                <Text color='green'>{formatScalar(imported)}</Text>
            </Box>
        );
    }

    return (
        <Box flexDirection='column'>
            <Text bold>Import Preview</Text>
            <Text dimColor>Changes that will be applied:</Text>
            <Box flexDirection='column'>
                {diffRows}
            </Box>
            {risks.length > 0 && (
                <Box flexDirection='column' marginTop={1}>
                    <Text bold color='yellow'>Review before applying</Text>
                    <Text dimColor>Shell commands run on every status line refresh; links open when clicked in the terminal.</Text>
                    {risks.map((risk, i) => (
                        <Box key={i} marginLeft={2}>
                            <Text
                                color={risk.kind === 'shell-command' ? 'yellow' : undefined}
                                dimColor={risk.kind === 'hyperlink'}
                            >
                                {formatConfigRiskRow(risk)}
                            </Text>
                        </Box>
                    ))}
                </Box>
            )}
            {pendingMode !== null && (
                <Box flexDirection='column' marginTop={1}>
                    <Text color='yellow'>{getShellCommandWarning(shellCommandCount)}</Text>
                    <Box marginTop={1}>
                        <ConfirmDialog
                            inline={true}
                            onConfirm={() => {
                                setPendingMode(null);
                                onApply(pendingMode);
                            }}
                            onCancel={() => {
                                setPendingMode(null);
                            }}
                        />
                    </Box>
                </Box>
            )}
            {pendingMode === null && (
                <List
                    items={items}
                    initialSelection={listSelection}
                    onSelect={handleSelect}
                    onSelectionChange={handleSelectionChange}
                />
            )}
        </Box>
    );
}
