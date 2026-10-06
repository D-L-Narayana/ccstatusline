import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';

import { getVisibleText } from './ansi';
import { advanceGlobalPowerlineThemeIndex } from './powerline-theme-index';
import {
    calculateMaxWidthsFromPreRendered,
    countPowerlineStartCapSlots,
    preRenderAllWidgets,
    renderStatusLineWithInfo
} from './renderer';
import { advanceGlobalSeparatorIndex } from './separator-index';

export interface RenderedLine {
    /** Position of the line in settings.lines (empty and blank lines are skipped). */
    index: number;
    /** Styled status line exactly as the renderer produced it. */
    line: string;
    /** True when the line had to be shortened to fit the terminal width. */
    wasTruncated: boolean;
}

/**
 * Renders every configured line that produces visible text.
 *
 * This is the single render pipeline shared by the status line entry point,
 * the TUI preview and headless previews. Widgets are pre-rendered once, the
 * auto-align widths are calculated across all lines, and the separator,
 * Powerline theme and start-cap indices continue across the lines that were
 * actually emitted — a line whose visible text is blank is dropped without
 * consuming any of those slots.
 *
 * Callers own any output post-processing (non-breaking spaces, leading reset
 * codes, config warning badges).
 */
export function renderLines(settings: Settings, context: RenderContext): RenderedLine[] {
    const lines = settings.lines;

    // Always pre-render all widgets once (for efficiency and shared alignment)
    const preRenderedLines = preRenderAllWidgets(lines, settings, context);
    const preCalculatedMaxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);

    const rendered: RenderedLine[] = [];
    let globalSeparatorIndex = 0;
    let globalPowerlineThemeIndex = 0;
    let globalPowerlineStartCapIndex = 0;

    for (let i = 0; i < lines.length; i++) {
        const lineItems = lines[i];
        if (!lineItems || lineItems.length === 0) {
            continue;
        }

        const preRenderedWidgets = preRenderedLines[i] ?? [];
        const lineContext: RenderContext = {
            ...context,
            lineIndex: i,
            globalSeparatorIndex,
            globalPowerlineThemeIndex,
            globalPowerlineStartCapIndex
        };
        const { line, wasTruncated } = renderStatusLineWithInfo(
            lineItems,
            settings,
            lineContext,
            preRenderedWidgets,
            preCalculatedMaxWidths
        );

        // Only emit the line if it has content (not just ANSI codes)
        if (getVisibleText(line).trim().length === 0) {
            continue;
        }

        rendered.push({ index: i, line, wasTruncated });

        globalSeparatorIndex = advanceGlobalSeparatorIndex(globalSeparatorIndex, lineItems, preRenderedWidgets);
        if (settings.powerline.enabled) {
            globalPowerlineStartCapIndex += countPowerlineStartCapSlots(lineItems, preRenderedWidgets);
        }
        if (settings.powerline.enabled && settings.powerline.continueThemeAcrossLines) {
            globalPowerlineThemeIndex = advanceGlobalPowerlineThemeIndex(globalPowerlineThemeIndex, preRenderedWidgets);
        }
    }

    return rendered;
}
