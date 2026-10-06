import type { WidgetItem } from './Widget';

/** Free-text editor; the TUI renders a grapheme-aware cursor. */
export interface TextEditorSpec {
    kind: 'text';
    /** Prompt before the input, e.g. 'Enter custom text: '. */
    prompt: string;
    initialValue: string;
    /** Optional dim context line, e.g. 'Current URL: https://…'. */
    hint?: string;
    /** Live warning for the current value, or null when acceptable. Never blocks saving. */
    validate?: (value: string) => string | null;
    /** Applied when the user presses Enter. */
    commit: (item: WidgetItem, value: string) => WidgetItem;
}

/** Digits-only editor. Blank or unparseable input commits null, meaning "clear". */
export interface NumberEditorSpec {
    kind: 'number';
    prompt: string;
    /** Pre-filled text; '' renders as blank. */
    initialValue: string;
    /** Dim helper line; defaults to 'Press Enter to save, ESC to cancel'. */
    help?: string;
    min?: number;
    max?: number;
    commit: (item: WidgetItem, value: number | null) => WidgetItem;
}

export interface SymbolSlotSpec {
    id: string;
    label: string;
    defaultSymbol: string;
    initialValue: string;
}

/** One or more single-grapheme inputs: type to set, Tab = default, Backspace = none. */
export interface SymbolSlotsEditorSpec {
    kind: 'symbol-slots';
    /** Heading, e.g. 'Glyphs' or 'Custom symbol'. */
    title: string;
    slots: SymbolSlotSpec[];
    /** values[i] corresponds to slots[i]. */
    commit: (item: WidgetItem, values: string[]) => WidgetItem;
}

export interface SearchListOption {
    value: string;
    displayName: string;
    description: string;
}

/** Searchable single-select list (locale, timezone). */
export interface SearchListEditorSpec {
    kind: 'search-list';
    title: string;
    /** Rendered as 'Current: <currentLabel>'. */
    currentLabel: string;
    /** Option value to preselect when the query is empty. */
    initialValue: string;
    emptyMessage: string;
    /** Options for a query; may synthesize an option from the query itself. */
    getOptions: (query: string) => SearchListOption[];
    /** Visible rows; defaults to 10. */
    maxVisible?: number;
    commit: (item: WidgetItem, value: string) => WidgetItem;
}

export type WidgetEditorSpec
    = | TextEditorSpec
        | NumberEditorSpec
        | SymbolSlotsEditorSpec
        | SearchListEditorSpec;
