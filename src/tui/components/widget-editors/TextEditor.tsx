import {
    Box,
    Text,
    useInput
} from 'ink';
import React, { useState } from 'react';

import type { WidgetItem } from '../../../types/Widget';
import type { TextEditorSpec } from '../../../types/WidgetEditorSpec';
import { shouldInsertInput } from '../../../utils/input-guards';

import {
    getGraphemes,
    graphemeToStringIndex,
    stringToGraphemeIndex
} from './graphemes';

export interface TextEditorProps {
    widget: WidgetItem;
    spec: TextEditorSpec;
    onComplete: (updated: WidgetItem) => void;
    onCancel: () => void;
}

const HELP_TEXT = '←→ move cursor, Ctrl+←→ jump to start/end, Enter save, ESC cancel';

// Inverse video marks the grapheme under the cursor, or a blank cell when the
// cursor sits at the end of the text.
function renderWithCursor(prompt: string, text: string, cursorPos: number): string {
    const graphemes = getGraphemes(text);
    const cursorGraphemeIndex = stringToGraphemeIndex(text, cursorPos);
    let display = prompt;

    graphemes.forEach((grapheme, index) => {
        display += index === cursorGraphemeIndex ? `\x1b[7m${grapheme}\x1b[0m` : grapheme;
    });

    if (cursorGraphemeIndex >= graphemes.length) {
        display += '\x1b[7m \x1b[0m';
    }

    return display;
}

export const TextEditor: React.FC<TextEditorProps> = ({ widget, spec, onComplete, onCancel }) => {
    const [text, setText] = useState(spec.initialValue);
    const [cursorPos, setCursorPos] = useState(spec.initialValue.length);

    useInput((input, key) => {
        if (key.return) {
            onComplete(spec.commit(widget, text));
        } else if (key.escape) {
            onCancel();
        } else if (key.ctrl && (key.leftArrow || input === 'ArrowLeft')) {
            setCursorPos(0);
        } else if (key.ctrl && (key.rightArrow || input === 'ArrowRight')) {
            setCursorPos(text.length);
        } else if (key.leftArrow) {
            const graphemeIndex = stringToGraphemeIndex(text, cursorPos);
            if (graphemeIndex > 0) {
                setCursorPos(graphemeToStringIndex(text, graphemeIndex - 1));
            }
        } else if (key.rightArrow) {
            const graphemeIndex = stringToGraphemeIndex(text, cursorPos);
            if (graphemeIndex < getGraphemes(text).length) {
                setCursorPos(graphemeToStringIndex(text, graphemeIndex + 1));
            }
        } else if (key.backspace) {
            const graphemeIndex = stringToGraphemeIndex(text, cursorPos);
            if (graphemeIndex > 0) {
                const deleteFrom = graphemeToStringIndex(text, graphemeIndex - 1);
                const deleteTo = graphemeToStringIndex(text, graphemeIndex);
                setText(text.slice(0, deleteFrom) + text.slice(deleteTo));
                setCursorPos(deleteFrom);
            }
        } else if (key.delete) {
            const graphemeIndex = stringToGraphemeIndex(text, cursorPos);
            if (graphemeIndex < getGraphemes(text).length) {
                const deleteFrom = graphemeToStringIndex(text, graphemeIndex);
                const deleteTo = graphemeToStringIndex(text, graphemeIndex + 1);
                setText(text.slice(0, deleteFrom) + text.slice(deleteTo));
            }
        } else if (shouldInsertInput(input, key)) {
            // Advance by the inserted string length so multi-code-unit input
            // (emoji with modifiers, pasted text) keeps the cursor in sync.
            setText(text.slice(0, cursorPos) + input + text.slice(cursorPos));
            setCursorPos(cursorPos + input.length);
        }
    });

    // Live validation only warns; saving stays possible so partially typed
    // values are never trapped in the editor.
    const warning = spec.validate?.(text) ?? null;

    return (
        <Box flexDirection='column'>
            <Text>{renderWithCursor(spec.prompt, text, cursorPos)}</Text>
            {spec.hint ? <Text dimColor>{spec.hint}</Text> : null}
            {warning !== null ? <Text color='yellow'>{warning}</Text> : null}
            <Text dimColor>{HELP_TEXT}</Text>
        </Box>
    );
};
