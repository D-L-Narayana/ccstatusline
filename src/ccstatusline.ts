#!/usr/bin/env node
import chalk from 'chalk';

import { runCli } from './cli';
import { findUnknownOptions } from './cli/args';
import { buildHelpText } from './cli/help';
import type { SkillsMetrics } from './types';
import type { RenderContext } from './types/RenderContext';
import type { StatusJSON } from './types/StatusJSON';
import { StatusJSONSchema } from './types/StatusJSON';
import { prefetchClaudeStatusIfNeeded } from './utils/claude-service-status';
import { updateColorMap } from './utils/colors';
import { ZERO_COMPACTION_STATS } from './utils/compaction';
import {
    getConfigLoadError,
    initConfigPath,
    loadSettings,
    saveSettings
} from './utils/config';
import {
    GIT_REVIEW_REFRESH_FLAG,
    refreshGitReviewCacheFromCli
} from './utils/git-review-cache';
import { handleHookInput } from './utils/hook-handler';
import { getTranscriptAnalysis } from './utils/jsonl';
import { renderLines } from './utils/render-lines';
import { buildConfigWarningBadge } from './utils/renderer';
import { getSkillsMetrics } from './utils/skills';
import {
    getWidgetSpeedWindowSeconds,
    isWidgetSpeedWindowEnabled
} from './utils/speed-window';
import {
    getPackageVersion,
    getTerminalWidth
} from './utils/terminal';
import { prefetchUsageDataIfNeeded } from './utils/usage-prefetch';

function hasSessionDurationInStatusJson(data: StatusJSON): boolean {
    const durationMs = data.cost?.total_duration_ms;
    return typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0;
}

async function readStdin(): Promise<string | null> {
    // Check if stdin is a TTY (terminal) - if it is, there's no piped data
    if (process.stdin.isTTY) {
        return null;
    }

    const chunks: string[] = [];

    try {
        // Use Node.js compatible approach
        if (typeof Bun !== 'undefined') {
            // Bun environment
            const decoder = new TextDecoder();
            for await (const chunk of Bun.stdin.stream()) {
                chunks.push(decoder.decode(chunk));
            }
        } else {
            // Node.js environment
            process.stdin.setEncoding('utf8');
            for await (const chunk of process.stdin) {
                chunks.push(chunk as string);
            }
        }
        return chunks.join('');
    } catch {
        return null;
    }
}

async function ensureWindowsUtf8CodePage() {
    if (process.platform !== 'win32') {
        return;
    }

    try {
        const { execFileSync } = await import('child_process');
        execFileSync('chcp.com', ['65001'], { stdio: 'ignore', windowsHide: true });
    } catch {
        // Ignore failures to preserve statusline output even in restricted shells.
    }
}

async function renderMultipleLines(data: StatusJSON) {
    const settings = await loadSettings();
    const configError = getConfigLoadError();

    // Set global chalk level based on settings
    chalk.level = settings.colorLevel;

    // Update color map after setting chalk level
    updateColorMap();

    // Get all lines to render
    const lines = settings.lines;

    // Check if session clock is needed
    const hasSessionClock = lines.some(line => line.some(item => item.type === 'session-clock'));

    const speedWidgetTypes = new Set(['output-speed', 'input-speed', 'total-speed']);
    const hasSpeedItems = lines.some(line => line.some(item => speedWidgetTypes.has(item.type)));
    const hasCompactionWidget = lines.some(line => line.some(item => item.type === 'compaction-counter'));
    const hasThinkingEffortWidget = lines.some(line => line.some(item => item.type === 'thinking-effort'));
    const hasSessionNameWidget = lines.some(line => line.some(item => item.type === 'session-name'));
    const needsTranscriptThinkingEffort = hasThinkingEffortWidget
        && (!data.effort || !('level' in data.effort));
    const requestedSpeedWindows = new Set<number>();
    for (const line of lines) {
        for (const item of line) {
            if (speedWidgetTypes.has(item.type) && isWidgetSpeedWindowEnabled(item)) {
                requestedSpeedWindows.add(getWidgetSpeedWindowSeconds(item));
            }
        }
    }

    const transcriptAnalysisPromise = data.transcript_path
        ? getTranscriptAnalysis(data.transcript_path, {
            includeSessionDuration: hasSessionClock && !hasSessionDurationInStatusJson(data),
            includeSpeedMetrics: hasSpeedItems,
            includeSubagents: true,
            speedWindowSeconds: Array.from(requestedSpeedWindows),
            includeCompactionStats: hasCompactionWidget,
            includeThinkingEffort: needsTranscriptThinkingEffort,
            includeSessionName: hasSessionNameWidget
        })
        : Promise.resolve(null);
    const [transcriptAnalysis, usageData, claudeStatusData] = await Promise.all([
        transcriptAnalysisPromise,
        prefetchUsageDataIfNeeded(lines, data),
        prefetchClaudeStatusIfNeeded(lines)
    ]);

    const tokenMetrics = transcriptAnalysis?.tokenMetrics ?? null;
    const sessionDuration = transcriptAnalysis?.sessionDuration ?? null;
    const speedMetrics = transcriptAnalysis?.speedMetricsCollection?.sessionAverage ?? null;
    const windowedSpeedMetrics = transcriptAnalysis?.speedMetricsCollection?.windowed ?? null;

    let skillsMetrics: SkillsMetrics | null = null;
    if (data.session_id) {
        skillsMetrics = getSkillsMetrics(data.session_id);
    }

    const compactionData = hasCompactionWidget
        ? (transcriptAnalysis?.compactionData ?? ZERO_COMPACTION_STATS)
        : null;

    // Create render context
    const context: RenderContext = {
        data,
        tokenMetrics,
        speedMetrics,
        windowedSpeedMetrics,
        usageData,
        claudeStatusData,
        sessionDuration,
        transcriptSessionName: hasSessionNameWidget
            ? (transcriptAnalysis?.sessionName ?? null)
            : undefined,
        transcriptThinkingEffort: needsTranscriptThinkingEffort
            ? (transcriptAnalysis?.thinkingEffort ?? null)
            : undefined,
        skillsMetrics,
        compactionData,
        terminalWidth: getTerminalWidth({
            sessionId: data.session_id,
            ttlSeconds: settings.terminalWidthCacheTtlSeconds
        }),
        isPreview: false,
        minimalist: settings.minimalistMode,
        gitCacheTtlSeconds: settings.gitCacheTtlSeconds,
        customCommandCacheTtlSeconds: settings.customCommandCacheTtlSeconds,
        gitReviewNeedsChecks: lines.some(line => line.some(item => item.type === 'git-ci-status'))
    };

    // The shared pipeline pre-renders every widget once, skips lines without
    // visible text, and carries separator / Powerline indices across lines.
    let configBadgePrepended = false;
    for (const rendered of renderLines(settings, context)) {
        let line = rendered.line;
        if (configError && !configBadgePrepended) {
            // On the error path settings are always inMemoryDefaults(), whose separators render as ' | '.
            line = `${buildConfigWarningBadge(settings.colorLevel)} | ${line}`;
            configBadgePrepended = true;
        }

        // Replace all spaces with non-breaking spaces to prevent VSCode trimming
        let outputLine = line.replace(/ /g, ' ');

        // Add reset code at the beginning to override Claude Code's dim setting
        outputLine = '\x1b[0m' + outputLine;
        console.log(outputLine);
    }

    // Defensive fallback: if no content line was emitted, ensure the warning is not lost
    if (configError && !configBadgePrepended) {
        console.log('\x1b[0m' + buildConfigWarningBadge(settings.colorLevel).replace(/ /g, ' '));
    }

    // Check if there's an update message to display
    if (settings.updatemessage?.message
        && settings.updatemessage.message.trim() !== ''
        && settings.updatemessage.remaining
        && settings.updatemessage.remaining > 0) {
        // Display the message
        console.log(settings.updatemessage.message);

        // Decrement the remaining count
        const newRemaining = settings.updatemessage.remaining - 1;

        // Update or remove the updatemessage
        if (newRemaining <= 0) {
            // Remove the entire updatemessage block
            const { updatemessage, ...newSettings } = settings;
            await saveSettings(newSettings);
        } else {
            // Update the remaining count
            await saveSettings({
                ...settings,
                updatemessage: {
                    ...settings.updatemessage,
                    remaining: newRemaining
                }
            });
        }
    }
}

function parseConfigArg(): string | undefined {
    const idx = process.argv.indexOf('--config');
    if (idx === -1)
        return undefined;
    const configPath = process.argv[idx + 1];
    if (!configPath || configPath.startsWith('--')) {
        console.error('--config requires a file path argument');
        process.exit(1);
    }
    process.argv.splice(idx, 2);
    return configPath;
}

async function handleHook(): Promise<void> {
    const input = await readStdin();
    handleHookInput(input);
}

function handleGitReviewRefresh(): boolean {
    const flagIndex = process.argv.indexOf(GIT_REVIEW_REFRESH_FLAG);
    if (flagIndex === -1) {
        return false;
    }

    const cwd = process.argv[flagIndex + 1];
    const mode = process.argv[flagIndex + 2];
    const lockPath = process.argv[flagIndex + 3];
    if (!cwd || (mode !== 'metadata' && mode !== 'checks') || !lockPath) {
        return true;
    }

    refreshGitReviewCacheFromCli(cwd, { includeChecks: mode === 'checks' }, lockPath);
    return true;
}

async function main() {
    // Detached cache refreshes re-enter this executable without reading stdin
    // or loading user settings. This mode intentionally emits no output.
    if (handleGitReviewRefresh()) {
        return;
    }

    // Print version and exit (#461). Standard CLI behavior, runs before any other mode.
    if (process.argv.includes('--version')) {
        console.log(getPackageVersion());
        process.exit(0);
    }

    // Parse --config before anything else
    initConfigPath(parseConfigArg());

    // Handle --hook mode (cross-platform hook handler for widgets)
    if (process.argv.includes('--hook')) {
        await handleHook();
        return;
    }

    // Headless CLI modes (--help, --preview, --validate, --schema, --doctor)
    // never read stdin. The exit code is left to the event loop so piped
    // stdout is flushed before the process ends.
    const cliArgs = process.argv.slice(2);
    const cliResult = await runCli(cliArgs);
    if (cliResult.handled) {
        process.exitCode = cliResult.exitCode;
        return;
    }

    const unknownOptions = findUnknownOptions(cliArgs);

    // Check if we're in a piped/non-TTY environment first
    if (!process.stdin.isTTY) {
        if (unknownOptions.length > 0) {
            // Never break a user's status line over a typo in the configured
            // statusLine command: warn on stderr and render as usual.
            console.error(`ccstatusline: ignoring unknown option(s): ${unknownOptions.join(', ')}`);
        }

        await ensureWindowsUtf8CodePage();

        // We're receiving piped input
        const input = await readStdin();
        if (input && input.trim() !== '') {
            try {
                // Parse and validate JSON in one step
                const result = StatusJSONSchema.safeParse(JSON.parse(input));
                if (!result.success) {
                    console.error('Invalid status JSON format:', result.error.message);
                    process.exit(1);
                }

                await renderMultipleLines(result.data);
            } catch (error) {
                console.error('Error parsing JSON:', error);
                process.exit(1);
            }
        } else {
            console.error('No input received');
            process.exit(1);
        }
    } else {
        if (unknownOptions.length > 0) {
            // Interactive use: a typo should not silently open the TUI.
            console.error(`ccstatusline: unknown option(s): ${unknownOptions.join(', ')}\n`);
            console.error(buildHelpText(getPackageVersion()));
            process.exitCode = 2;
            return;
        }

        // Interactive mode - run TUI
        // Remove updatemessage before running TUI
        const settings = await loadSettings();
        if (settings.updatemessage) {
            const { updatemessage, ...newSettings } = settings;
            await saveSettings(newSettings);
        }
        // Imported lazily: the TUI pulls in ink/React/yoga-layout, which the
        // status line render path never touches. Claude Code re-runs this
        // binary every couple of seconds, so keeping that graph off the
        // render path is worth the dynamic import here.
        const { runTUI } = await import('./tui');
        runTUI();
    }
}

void main();
