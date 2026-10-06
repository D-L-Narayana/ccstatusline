import chalk from 'chalk';

import type { RenderContext } from '../types/RenderContext';
import { getVisibleText } from '../utils/ansi';
import { updateColorMap } from '../utils/colors';
import {
    getConfigLoadError,
    loadSettings
} from '../utils/config';
import { renderLines } from '../utils/render-lines';
import {
    getTerminalWidth,
    isTerminalWidth
} from '../utils/terminal';

import type { CliIo } from './io';

export interface PreviewOptions {
    /** Columns to render for; defaults to the detected terminal width. */
    width?: number;
    json: boolean;
}

export interface PreviewJsonLine {
    /** Position in settings.lines. */
    index: number;
    /** Styled line with ANSI sequences, exactly as a Claude Code repaint would receive it. */
    text: string;
    /** The same line with every escape sequence removed. */
    plain: string;
    wasTruncated: boolean;
}

export interface PreviewJson {
    /** Width the lines were rendered for; null when none was given or detected. */
    width: number | null;
    lines: PreviewJsonLine[];
}

/**
 * Parses a `--width` value: a whole number of columns from 1 to
 * MAX_TERMINAL_WIDTH (65535), or null. A terminal reports its width through a
 * 16-bit field (`winsize.ws_col`), so no real terminal is wider; larger digit
 * strings — including ones parseInt would round or turn into Infinity — are
 * rejected as usage errors instead of sizing strings the renderer cannot build.
 */
export function parsePreviewWidth(raw: string | undefined): number | null {
    if (raw === undefined) {
        return null;
    }

    const trimmed = raw.trim();
    if (!/^\d+$/.test(trimmed)) {
        return null;
    }

    const width = Number.parseInt(trimmed, 10);
    return isTerminalWidth(width) ? width : null;
}

/**
 * Renders the configured status line with sample data and prints it. Widgets
 * see `isPreview`, so no custom command runs and nothing touches the network.
 */
export async function runPreview(options: PreviewOptions, io: CliIo): Promise<number> {
    const settings = await loadSettings();
    const loadError = getConfigLoadError();
    if (loadError !== null) {
        io.stderr(`ccstatusline: ${loadError}; previewing the built-in default configuration\n`);
    }

    // Same color setup as the status line render path.
    chalk.level = settings.colorLevel;
    updateColorMap();

    const width = options.width ?? getTerminalWidth();
    const context: RenderContext = {
        isPreview: true,
        terminalWidth: width,
        minimalist: settings.minimalistMode,
        gitCacheTtlSeconds: settings.gitCacheTtlSeconds,
        customCommandCacheTtlSeconds: settings.customCommandCacheTtlSeconds
    };
    const rendered = renderLines(settings, context);

    if (options.json) {
        const payload: PreviewJson = {
            width,
            lines: rendered.map(entry => ({
                index: entry.index,
                text: entry.line,
                plain: getVisibleText(entry.line),
                wasTruncated: entry.wasTruncated
            }))
        };
        io.stdout(`${JSON.stringify(payload, null, 2)}\n`);
        return 0;
    }

    for (const entry of rendered) {
        io.stdout(`${entry.line}\n`);
    }

    return 0;
}
