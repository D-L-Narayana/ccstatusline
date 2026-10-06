import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { WidgetItem } from '../../../types/Widget';
import type { NumberEditorSpec } from '../../../types/WidgetEditorSpec';
import { shouldInsertInput } from '../../../utils/input-guards';

export interface NumberEditorProps {
    widget: WidgetItem;
    spec: NumberEditorSpec;
    onComplete: (updated: WidgetItem) => void;
    onCancel: () => void;
}

const DEFAULT_HELP = 'Press Enter to save, ESC to cancel';
const DIGITS_ONLY = /^\d+$/;

function describeRange(min: number | undefined, max: number | undefined): string | null {
    if (min !== undefined && max !== undefined) {
        return `Range: ${min}-${max}.`;
    }

    if (min !== undefined) {
        return `Minimum: ${min}.`;
    }

    if (max !== undefined) {
        return `Maximum: ${max}.`;
    }

    return null;
}

export const NumberEditor: React.FC<NumberEditorProps> = ({ widget, spec, onComplete, onCancel }) => {
    const [text, setText] = useState(spec.initialValue);

    useInput((input, key) => {
        if (key.return) {
            // Clamping and validation belong to the spec's commit; the editor
            // only tells "a number" apart from "cleared" (blank or unparseable).
            const parsed = Number.parseInt(text, 10);
            onComplete(spec.commit(widget, Number.isNaN(parsed) ? null : parsed));
        } else if (key.escape) {
            onCancel();
        } else if (key.backspace) {
            setText(text.slice(0, -1));
        } else if (shouldInsertInput(input, key) && DIGITS_ONLY.test(input)) {
            setText(text + input);
        }
    });

    const range = describeRange(spec.min, spec.max);
    const help = spec.help ?? DEFAULT_HELP;

    return (
        <Box flexDirection='column'>
            <Box>
                <Text>{spec.prompt}</Text>
                <Text>{text}</Text>
                <Text backgroundColor='gray' color='black'>{' '}</Text>
            </Box>
            <Text dimColor>{range ? `${range} ${help}` : help}</Text>
        </Box>
    );
};
