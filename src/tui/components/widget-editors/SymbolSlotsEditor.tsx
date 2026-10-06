import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { WidgetItem } from '../../../types/Widget';
import type { SymbolSlotsEditorSpec } from '../../../types/WidgetEditorSpec';
import { getVisibleWidth } from '../../../utils/ansi';
import { shouldInsertInput } from '../../../utils/input-guards';

import { getFirstGrapheme } from './graphemes';

export interface SymbolSlotsEditorProps {
    widget: WidgetItem;
    spec: SymbolSlotsEditorSpec;
    onComplete: (updated: WidgetItem) => void;
    onCancel: () => void;
}

const MULTI_SLOT_HELP = '↑↓ row, type to set, Tab default, Backspace none, Enter save, ESC cancel';
const SINGLE_SLOT_HELP = 'Type any character or emoji, Tab default, Backspace none, Enter save, ESC cancel';

export const SymbolSlotsEditor: React.FC<SymbolSlotsEditorProps> = ({ widget, spec, onComplete, onCancel }) => {
    const { slots } = spec;
    const [values, setValues] = useState<string[]>(() => slots.map(slot => slot.initialValue));
    const [selectedIndex, setSelectedIndex] = useState(0);
    // Labels are right-aligned so every value starts in the same column.
    const labelWidth = Math.max(...slots.map(slot => getVisibleWidth(slot.label)), 0);

    const setSelectedValue = (value: string): void => {
        setValues(values.map((current, index) => (index === selectedIndex ? value : current)));
    };

    useInput((input, key) => {
        if (key.return) {
            onComplete(spec.commit(widget, values));
        } else if (key.escape) {
            onCancel();
        } else if (key.upArrow && slots.length > 1) {
            setSelectedIndex(selectedIndex - 1 < 0 ? slots.length - 1 : selectedIndex - 1);
        } else if (key.downArrow && slots.length > 1) {
            setSelectedIndex(selectedIndex + 1 > slots.length - 1 ? 0 : selectedIndex + 1);
        } else if (key.tab) {
            setSelectedValue(slots[selectedIndex]?.defaultSymbol ?? '');
        } else if (key.backspace || key.delete) {
            setSelectedValue('');
        } else if (shouldInsertInput(input, key)) {
            // Only the first grapheme is kept, so pasted text or an emoji made
            // of several code units still yields a single symbol.
            setSelectedValue(getFirstGrapheme(input));
        }
    });

    return (
        <Box flexDirection='column'>
            <Text bold>{spec.title}</Text>
            <Text dimColor>{slots.length > 1 ? MULTI_SLOT_HELP : SINGLE_SLOT_HELP}</Text>
            <Box marginTop={1} flexDirection='column'>
                {slots.map((slot, index) => {
                    const isSelected = index === selectedIndex;
                    const value = values[index] ?? '';
                    const labelPadding = ' '.repeat(Math.max(labelWidth - getVisibleWidth(slot.label), 0));
                    return (
                        <Box key={slot.id} flexDirection='row' flexWrap='nowrap'>
                            <Box width={4}>
                                <Text color={isSelected ? 'green' : undefined}>
                                    {isSelected ? '▶ ' : '  '}
                                </Text>
                            </Box>
                            <Text color={isSelected ? 'green' : undefined}>
                                {`${labelPadding}${slot.label}: `}
                            </Text>
                            {value ? (
                                <Text inverse>{value}</Text>
                            ) : (
                                <Text inverse dimColor>(none)</Text>
                            )}
                            <Text dimColor>{` (default: ${slot.defaultSymbol || 'none'})`}</Text>
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
};
