import chalk from 'chalk';
import {
    Box,
    Text
} from 'ink';
import React from 'react';

import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import {
    getVisibleWidth,
    stripOscCodes,
    truncateStyledText
} from '../../utils/ansi';
import { renderLines } from '../../utils/render-lines';

export interface StatusLinePreviewProps {
    lines: WidgetItem[][];
    terminalWidth: number;
    settings?: Settings;
    onTruncationChange?: (isTruncated: boolean) => void;
}

interface PreviewRenderState {
    renderedLines: string[];
    anyTruncated: boolean;
}

const PREVIEW_LINE_INDENT = '  ';

export function preparePreviewLineForTerminal(line: string, terminalWidth: number): string {
    const printableLine = stripOscCodes(line);
    const availableWidth = Math.max(0, terminalWidth - getVisibleWidth(PREVIEW_LINE_INDENT));
    return truncateStyledText(printableLine, availableWidth, { ellipsis: true });
}

export const StatusLinePreview: React.FC<StatusLinePreviewProps> = ({ lines, terminalWidth, settings, onTruncationChange }) => {
    // Render the configured lines through the same pipeline as the status line
    // output. Pass the full terminal width - the renderer handles preview adjustments.
    const { renderedLines, anyTruncated } = React.useMemo<PreviewRenderState>(() => {
        if (!settings)
            return { renderedLines: [], anyTruncated: false };

        const previewContext: RenderContext = {
            terminalWidth,
            isPreview: true,
            minimalist: settings.minimalistMode,
            gitCacheTtlSeconds: settings.gitCacheTtlSeconds,
            customCommandCacheTtlSeconds: settings.customCommandCacheTtlSeconds
        };
        const rendered = renderLines({ ...settings, lines }, previewContext);

        return {
            renderedLines: rendered.map(entry => entry.line),
            anyTruncated: rendered.some(entry => entry.wasTruncated)
        };
    }, [lines, terminalWidth, settings]);

    // Notify parent when truncation status changes
    React.useEffect(() => {
        onTruncationChange?.(anyTruncated);
    }, [anyTruncated, onTruncationChange]);

    return (
        <Box flexDirection='column'>
            <Box borderStyle='round' borderColor='gray' borderDimColor width='100%' paddingLeft={1}>
                <Text>
                    &gt;
                    <Text dimColor> Preview  (ctrl+s to save configuration at any time)</Text>
                </Text>
            </Box>
            {renderedLines.map((line, index) => (
                <Text key={index} wrap='truncate'>
                    {PREVIEW_LINE_INDENT}
                    {preparePreviewLineForTerminal(line, terminalWidth)}
                    {chalk.reset('')}
                </Text>
            ))}
        </Box>
    );
};
