import React from 'react';

import type { WidgetItem } from '../../../types/Widget';
import type { WidgetEditorSpec } from '../../../types/WidgetEditorSpec';

import { NumberEditor } from './NumberEditor';
import { SearchListEditor } from './SearchListEditor';
import { SymbolSlotsEditor } from './SymbolSlotsEditor';
import { TextEditor } from './TextEditor';

export interface WidgetEditorHostProps {
    widget: WidgetItem;
    spec: WidgetEditorSpec;
    onComplete: (updated: WidgetItem) => void;
    onCancel: () => void;
}

// Dispatches on spec.kind so the items editor needs no knowledge of the
// individual editors.
export const WidgetEditorHost: React.FC<WidgetEditorHostProps> = ({ widget, spec, onComplete, onCancel }) => {
    switch (spec.kind) {
        case 'text':
            return (
                <TextEditor
                    widget={widget}
                    spec={spec}
                    onComplete={onComplete}
                    onCancel={onCancel}
                />
            );
        case 'number':
            return (
                <NumberEditor
                    widget={widget}
                    spec={spec}
                    onComplete={onComplete}
                    onCancel={onCancel}
                />
            );
        case 'symbol-slots':
            return (
                <SymbolSlotsEditor
                    widget={widget}
                    spec={spec}
                    onComplete={onComplete}
                    onCancel={onCancel}
                />
            );
        case 'search-list':
            return (
                <SearchListEditor
                    widget={widget}
                    spec={spec}
                    onComplete={onComplete}
                    onCancel={onCancel}
                />
            );
    }
};
