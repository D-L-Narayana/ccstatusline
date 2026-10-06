import { execFileSync } from 'child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
    InstallationMetadata,
    Settings
} from '../types/Settings';
import { getCacheDir } from '../utils/cache-dir';
import {
    classifyInstallation,
    getClaudeCodeVersion,
    getClaudeConfigDir,
    getClaudeSettingsPath,
    getExistingStatusLine,
    getRefreshInterval
} from '../utils/claude-settings';
import {
    getConfigLoadError,
    getConfigPath,
    isCustomConfigPath,
    loadSettings
} from '../utils/config';
import {
    getPackageVersion,
    getTerminalWidth
} from '../utils/terminal';

import type { CliIo } from './io';
import { summarizeSettings } from './summary';

// The doctor describes the installation for bug reports. It reads settings
// files and probes tools, and nothing else: credential files and the OS
// secret store are never opened, and values that could carry a token (proxy
// URLs) are reported as set/unset only.

/** Executables the widgets shell out to, in report order. */
export const DOCTOR_TOOLS = ['git', 'gh', 'glab', 'jj', 'npm', 'bun'] as const;
export type DoctorTool = typeof DOCTOR_TOOLS[number];

const TOOL_PROBE_TIMEOUT_MS = 2000;
const LABEL_WIDTH = 17;
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

interface EnvironmentVariableSpec {
    name: string;
    /** Only paths and plain numbers are shown; everything else is set/unset. */
    showValue: boolean;
}

const ENVIRONMENT_VARIABLES: readonly EnvironmentVariableSpec[] = [
    { name: 'CLAUDE_CONFIG_DIR', showValue: true },
    { name: 'CLAUDE_SECURESTORAGE_CONFIG_DIR', showValue: false },
    { name: 'CCSTATUSLINE_WIDTH', showValue: true },
    { name: 'CCSTATUSLINE_CACHE_DIR', showValue: true },
    { name: 'CCSTATUSLINE_CONTEXT_SIZE_FALLBACK', showValue: true },
    { name: 'HTTPS_PROXY', showValue: false },
    { name: 'https_proxy', showValue: false },
    { name: 'DEBUG_FONT_INSTALL', showValue: false }
];

export interface DoctorVersionSection {
    ccstatusline: string;
    runtime: 'bun' | 'node';
    runtimeVersion: string;
    platform: string;
    arch: string;
}

export interface DoctorSettingsSection {
    path: string;
    /** True when the path came from `--config`. */
    custom: boolean;
    exists: boolean;
    /** null when the file does not exist. */
    valid: boolean | null;
    loadError: string | null;
    schemaVersion: number | null;
    lineCount: number | null;
    widgetCount: number | null;
}

export interface DoctorClaudeSection {
    configDir: string;
    configDirFromEnvironment: boolean;
    settingsPath: string;
    settingsExists: boolean;
    statusLineCommand: string | null;
    installation: InstallationMetadata;
    refreshInterval: number | null;
    claudeVersion: string | null;
}

export interface DoctorCacheSection {
    dir: string;
    envOverride: boolean;
    exists: boolean;
    fileCount: number;
    totalBytes: number;
}

export interface DoctorTerminalSection {
    width: number | null;
    /** Raw CCSTATUSLINE_WIDTH value when set. */
    widthOverride: string | null;
}

export interface DoctorEnvironmentVariable {
    name: string;
    set: boolean;
    /** Present only for variables whose value is safe to show. */
    value: string | null;
}

export interface DoctorEnvironmentSection { variables: DoctorEnvironmentVariable[] }

export type DoctorToolsSection = Record<string, boolean>;

export interface DoctorReport {
    version: DoctorVersionSection;
    settings: DoctorSettingsSection;
    claude: DoctorClaudeSection;
    cache: DoctorCacheSection;
    terminal: DoctorTerminalSection;
    environment: DoctorEnvironmentSection;
    tools: DoctorToolsSection;
}

export interface DoctorOptions {
    /** Executables to probe; defaults to DOCTOR_TOOLS. */
    tools?: readonly string[];
}

export interface DoctorRunOptions { json: boolean }

function collectVersion(): DoctorVersionSection {
    const isBun = typeof Bun !== 'undefined';
    return {
        ccstatusline: getPackageVersion(),
        runtime: isBun ? 'bun' : 'node',
        runtimeVersion: isBun ? Bun.version : process.versions.node,
        platform: process.platform,
        arch: process.arch
    };
}

interface SettingsProbe {
    section: DoctorSettingsSection;
    settings: Settings | null;
}

async function collectSettings(): Promise<SettingsProbe> {
    const settingsPath = getConfigPath();
    const base = {
        path: settingsPath,
        custom: isCustomConfigPath(),
        exists: false,
        valid: null,
        loadError: null,
        schemaVersion: null,
        lineCount: null,
        widgetCount: null
    };

    // Checked first: loadSettings writes defaults when the file is missing,
    // and a diagnostic run must not create files.
    if (!fs.existsSync(settingsPath)) {
        return { section: base, settings: null };
    }

    const settings = await loadSettings();
    const loadError = getConfigLoadError();
    if (loadError !== null) {
        return { section: { ...base, exists: true, valid: false, loadError }, settings: null };
    }

    const summary = summarizeSettings(settings);
    return {
        section: {
            ...base,
            exists: true,
            valid: true,
            schemaVersion: settings.version,
            lineCount: summary.lineCount,
            widgetCount: summary.widgetCount
        },
        settings
    };
}

async function collectClaude(installationMetadata: InstallationMetadata | undefined): Promise<DoctorClaudeSection> {
    const configDir = getClaudeConfigDir();
    const envConfigDir = process.env.CLAUDE_CONFIG_DIR;
    const settingsPath = getClaudeSettingsPath();
    const statusLineCommand = await getExistingStatusLine();

    return {
        configDir,
        configDirFromEnvironment: envConfigDir !== undefined && envConfigDir.length > 0 && configDir === path.resolve(envConfigDir),
        settingsPath,
        settingsExists: fs.existsSync(settingsPath),
        statusLineCommand,
        installation: classifyInstallation(statusLineCommand, installationMetadata),
        refreshInterval: await getRefreshInterval(),
        claudeVersion: getClaudeCodeVersion()
    };
}

function readEntries(dir: string): fs.Dirent[] {
    try {
        return fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return [];
    }
}

/** Counts regular files below `dir` (symlinks are not followed); best effort. */
function measureDirectory(dir: string): { fileCount: number; totalBytes: number } {
    let fileCount = 0;
    let totalBytes = 0;
    const pending = [dir];

    for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
        for (const entry of readEntries(current)) {
            const entryPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                pending.push(entryPath);
                continue;
            }

            if (!entry.isFile()) {
                continue;
            }

            try {
                totalBytes += fs.statSync(entryPath).size;
                fileCount++;
            } catch {
                // Removed between readdir and stat; skip it.
            }
        }
    }

    return { fileCount, totalBytes };
}

function collectCache(): DoctorCacheSection {
    const dir = getCacheDir();
    const override = process.env.CCSTATUSLINE_CACHE_DIR?.trim();
    let exists = false;
    try {
        exists = fs.statSync(dir).isDirectory();
    } catch {
        // Missing cache directory: nothing has been cached yet.
    }

    return {
        dir,
        envOverride: override !== undefined && override.length > 0,
        exists,
        ...(exists ? measureDirectory(dir) : { fileCount: 0, totalBytes: 0 })
    };
}

function collectTerminal(): DoctorTerminalSection {
    const override = process.env.CCSTATUSLINE_WIDTH;
    return {
        width: getTerminalWidth(),
        widthOverride: override !== undefined && override.length > 0 ? override : null
    };
}

function collectEnvironment(): DoctorEnvironmentSection {
    return {
        variables: ENVIRONMENT_VARIABLES.map((spec) => {
            const value = process.env[spec.name];
            return {
                name: spec.name,
                set: value !== undefined,
                value: value !== undefined && spec.showValue ? value : null
            };
        })
    };
}

function isToolAvailable(tool: string): boolean {
    try {
        execFileSync(process.platform === 'win32' ? 'where' : 'which', [tool], {
            stdio: 'ignore',
            timeout: TOOL_PROBE_TIMEOUT_MS,
            windowsHide: true
        });
        return true;
    } catch {
        return false;
    }
}

function collectTools(tools: readonly string[]): DoctorToolsSection {
    return Object.fromEntries(tools.map((tool): [string, boolean] => [tool, isToolAvailable(tool)]));
}

/** Gathers every diagnostic section. Never throws for a missing or broken installation. */
export async function collectDoctorReport(options: DoctorOptions = {}): Promise<DoctorReport> {
    const version = collectVersion();
    const { section: settings, settings: loaded } = await collectSettings();
    const claude = await collectClaude(loaded?.installation);

    return {
        version,
        settings,
        claude,
        cache: collectCache(),
        terminal: collectTerminal(),
        environment: collectEnvironment(),
        tools: collectTools(options.tools ?? DOCTOR_TOOLS)
    };
}

export function formatByteCount(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
        value /= 1024;
        unitIndex++;
    }

    return `${value.toFixed(1)} ${BYTE_UNITS[unitIndex] ?? 'B'}`;
}

function formatInstallation(installation: InstallationMetadata): string {
    switch (installation.method) {
        case 'auto-update':
            return `auto-update (${installation.packageManager})`;
        case 'pinned':
            return installation.installedVersion ? `pinned ${installation.installedVersion}` : 'pinned';
        case 'self-managed':
            return installation.packageManager === 'unknown' ? 'self-managed' : `self-managed (${installation.packageManager})`;
        case 'unknown':
            return 'unknown';
    }
}

function yesNo(value: boolean): string {
    return value ? 'yes' : 'no';
}

function row(label: string, value: string): string {
    return `  ${label.padEnd(LABEL_WIDTH)}${value}`;
}

function formatSettingsRows(settings: DoctorSettingsSection): string[] {
    const rows = [
        row('path', settings.custom ? `${settings.path} (--config)` : settings.path),
        row('exists', yesNo(settings.exists))
    ];
    if (!settings.exists) {
        return rows;
    }

    rows.push(
        row('valid', yesNo(settings.valid === true)),
        row('load error', settings.loadError ?? 'none')
    );
    if (settings.valid === true) {
        rows.push(
            row('schema version', String(settings.schemaVersion ?? 'unknown')),
            row('lines', String(settings.lineCount ?? 0)),
            row('widgets', String(settings.widgetCount ?? 0))
        );
    }

    return rows;
}

function formatClaudeRows(claude: DoctorClaudeSection): string[] {
    return [
        row('config dir', claude.configDirFromEnvironment ? `${claude.configDir} (CLAUDE_CONFIG_DIR)` : claude.configDir),
        row('settings', `${claude.settingsPath} (${claude.settingsExists ? 'exists' : 'missing'})`),
        row('statusLine', claude.statusLineCommand ?? 'not configured'),
        row('installation', formatInstallation(claude.installation)),
        row('refreshInterval', claude.refreshInterval === null ? 'not set' : String(claude.refreshInterval)),
        row('claude version', claude.claudeVersion ?? 'not installed')
    ];
}

function formatTerminalRows(terminal: DoctorTerminalSection): string[] {
    const detected = terminal.width === null ? 'not detected' : String(terminal.width);
    if (terminal.widthOverride === null) {
        return [row('width', detected)];
    }

    const overrideApplied = terminal.width !== null && String(terminal.width) === terminal.widthOverride.trim();
    const note = overrideApplied ? ' (CCSTATUSLINE_WIDTH)' : ` (CCSTATUSLINE_WIDTH="${terminal.widthOverride}" ignored)`;
    return [row('width', `${detected}${note}`)];
}

function formatEnvironmentRows(environment: DoctorEnvironmentSection): string[] {
    if (environment.variables.length === 0) {
        return ['  none'];
    }

    const nameWidth = Math.max(...environment.variables.map(variable => variable.name.length)) + 2;
    return environment.variables.map((variable) => {
        const state = variable.set ? (variable.value ?? 'set') : 'unset';
        return `  ${variable.name.padEnd(nameWidth)}${state}`;
    });
}

/** Human-readable report; `--json` prints the structure instead. */
export function formatDoctorReport(report: DoctorReport): string {
    const sections: [string, string[]][] = [
        ['Version', [
            row('ccstatusline', report.version.ccstatusline || 'unknown'),
            row('runtime', `${report.version.runtime} ${report.version.runtimeVersion}`),
            row('platform', `${report.version.platform} ${report.version.arch}`)
        ]],
        ['Settings', formatSettingsRows(report.settings)],
        ['Claude Code', formatClaudeRows(report.claude)],
        ['Cache', [
            row('dir', report.cache.envOverride ? `${report.cache.dir} (CCSTATUSLINE_CACHE_DIR)` : report.cache.dir),
            row('exists', yesNo(report.cache.exists)),
            row('files', `${report.cache.fileCount} (${formatByteCount(report.cache.totalBytes)})`)
        ]],
        ['Terminal', formatTerminalRows(report.terminal)],
        ['Environment', formatEnvironmentRows(report.environment)],
        ['Tools', Object.entries(report.tools).map(([tool, available]) => row(tool, available ? 'available' : 'not found'))]
    ];

    const body = sections.map(([heading, rows]) => [heading, ...rows].join('\n')).join('\n\n');
    return `ccstatusline doctor\n\n${body}\n`;
}

export async function runDoctor(options: DoctorRunOptions, io: CliIo): Promise<number> {
    const report = await collectDoctorReport();
    io.stdout(options.json ? `${JSON.stringify(report, null, 2)}\n` : formatDoctorReport(report));
    return 0;
}
