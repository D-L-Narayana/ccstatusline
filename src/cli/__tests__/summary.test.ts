import {
    describe,
    expect,
    it
} from 'vitest';

import {
    DEFAULT_SETTINGS,
    type Settings
} from '../../types/Settings';
import { summarizeSettings } from '../summary';

function withLines(lines: Settings['lines']): Settings {
    return { ...DEFAULT_SETTINGS, lines };
}

describe('summarizeSettings', () => {
    it('counts the configured lines that have items and the widgets without separators', () => {
        // The default configuration has one populated line with four widgets
        // separated by three separators, followed by two empty lines.
        expect(summarizeSettings(DEFAULT_SETTINGS)).toEqual({ lineCount: 1, widgetCount: 4 });
    });

    it('ignores flex separators as well as plain separators', () => {
        const settings = withLines([
            [
                { id: '1', type: 'model' },
                { id: '2', type: 'flex-separator' },
                { id: '3', type: 'git-branch' }
            ],
            [{ id: '4', type: 'separator' }],
            [{ id: '5', type: 'custom-text', customText: 'hi' }]
        ]);

        expect(summarizeSettings(settings)).toEqual({ lineCount: 3, widgetCount: 3 });
    });

    it('reports zero for a configuration without any items', () => {
        expect(summarizeSettings(withLines([[], [], []]))).toEqual({ lineCount: 0, widgetCount: 0 });
    });
});
