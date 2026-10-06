// Generic Ink editors driven by WidgetEditorSpec. Widgets describe their
// editors declaratively (see src/types/WidgetEditorSpec.ts) and the items
// editor renders them through WidgetEditorHost, so no widget module needs to
// import ink or react.
export { NumberEditor, type NumberEditorProps } from './NumberEditor';
export { SearchListEditor, type SearchListEditorProps } from './SearchListEditor';
export { SymbolSlotsEditor, type SymbolSlotsEditorProps } from './SymbolSlotsEditor';
export { TextEditor, type TextEditorProps } from './TextEditor';
export { WidgetEditorHost, type WidgetEditorHostProps } from './WidgetEditorHost';
