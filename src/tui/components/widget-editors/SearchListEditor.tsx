import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { WidgetItem } from '../../../types/Widget';
import type { SearchListEditorSpec } from '../../../types/WidgetEditorSpec';
import { getMatchSegments } from '../../../utils/fuzzy';
import { shouldInsertInput } from '../../../utils/input-guards';

export interface SearchListEditorProps {
    widget: WidgetItem;
    spec: SearchListEditorSpec;
    onComplete: (updated: WidgetItem) => void;
    onCancel: () => void;
}

const DEFAULT_MAX_VISIBLE = 10;
const HELP_TEXT = 'Type to search, Up/Down select, Enter save, ESC cancel';

interface VisibleRange {
    start: number;
    end: number;
}

// Keeps the selection centred in the window while clamping to the list bounds.
function getVisibleRange(selectedIndex: number, totalOptions: number, maxVisible: number): VisibleRange {
    if (totalOptions <= maxVisible) {
        return { start: 0, end: totalOptions };
    }

    const halfWindow = Math.floor(maxVisible / 2);
    const maxStart = totalOptions - maxVisible;
    const start = Math.min(Math.max(0, selectedIndex - halfWindow), maxStart);
    return { start, end: start + maxVisible };
}

function getInitialSelectedIndex(spec: SearchListEditorSpec): number {
    const index = spec.getOptions('').findIndex(option => option.value === spec.initialValue);
    return index === -1 ? 0 : index;
}

export const SearchListEditor: React.FC<SearchListEditorProps> = ({ widget, spec, onComplete, onCancel }) => {
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(() => getInitialSelectedIndex(spec));
    const maxVisible = spec.maxVisible ?? DEFAULT_MAX_VISIBLE;
    const options = spec.getOptions(query);
    const clampedIndex = options.length === 0 ? 0 : Math.min(selectedIndex, options.length - 1);
    const selectedOption = options[clampedIndex];
    const visibleRange = getVisibleRange(clampedIndex, options.length, maxVisible);
    const visibleOptions = options.slice(visibleRange.start, visibleRange.end);

    useInput((input, key) => {
        if (key.return) {
            if (selectedOption) {
                onComplete(spec.commit(widget, selectedOption.value));
            }
        } else if (key.escape) {
            onCancel();
        } else if (key.upArrow || key.downArrow) {
            if (options.length === 0) {
                return;
            }

            const lastIndex = options.length - 1;
            setSelectedIndex((previous) => {
                const current = Math.min(previous, lastIndex);
                if (key.downArrow) {
                    return current + 1 > lastIndex ? 0 : current + 1;
                }

                return current - 1 < 0 ? lastIndex : current - 1;
            });
        } else if (key.backspace || key.delete) {
            setQuery(previous => previous.slice(0, -1));
            setSelectedIndex(0);
        } else if (shouldInsertInput(input, key)) {
            setQuery(previous => previous + input);
            setSelectedIndex(0);
        }
    });

    return (
        <Box flexDirection='column'>
            <Box>
                <Text bold>{spec.title}</Text>
                <Text dimColor>{` Current: ${spec.currentLabel}`}</Text>
            </Box>
            <Box>
                <Text dimColor>Search: </Text>
                <Text color='cyan'>{query || '(none)'}</Text>
            </Box>
            <Text dimColor>{HELP_TEXT}</Text>
            <Box marginTop={1} flexDirection='column'>
                {options.length === 0 ? (
                    <Text dimColor>{spec.emptyMessage}</Text>
                ) : (
                    visibleOptions.map((option, visibleIndex) => {
                        const isSelected = visibleRange.start + visibleIndex === clampedIndex;
                        const segments = getMatchSegments(option.displayName, query);

                        return (
                            <Box key={option.value} flexDirection='row' flexWrap='nowrap'>
                                <Box width={3}>
                                    <Text color={isSelected ? 'green' : undefined}>
                                        {isSelected ? '> ' : '  '}
                                    </Text>
                                </Box>
                                {segments.map((segment, index) => (
                                    <Text
                                        key={index}
                                        color={isSelected ? 'green' : (segment.matched ? 'yellowBright' : undefined)}
                                        bold={isSelected ? true : segment.matched}
                                    >
                                        {segment.text}
                                    </Text>
                                ))}
                                <Text dimColor>{` - ${option.description}`}</Text>
                            </Box>
                        );
                    })
                )}
            </Box>
            {options.length > maxVisible && (
                <Box marginTop={1}>
                    <Text dimColor>{`Showing ${visibleRange.start + 1}-${visibleRange.end} of ${options.length}`}</Text>
                </Box>
            )}
        </Box>
    );
};
