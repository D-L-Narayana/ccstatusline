import {
    describe,
    expect,
    it
} from 'vitest';

import { CLI_OPTIONS } from '../args';
import { buildHelpText } from '../help';

describe('buildHelpText', () => {
    const help = buildHelpText('9.9.9');

    it('names the program and the version on the first line', () => {
        const firstLine = help.split('\n')[0] ?? '';

        expect(firstLine).toContain('ccstatusline');
        expect(firstLine).toContain('9.9.9');
    });

    it('lists every option with its argument placeholder and description', () => {
        expect(CLI_OPTIONS.length).toBeGreaterThan(0);
        for (const option of CLI_OPTIONS) {
            const label = option.argument ? `${option.flag} ${option.argument}` : option.flag;
            expect(help).toContain(label);
            expect(help).toContain(option.description);
        }
    });

    it('shows the -h alias next to --help', () => {
        expect(help).toMatch(/-h, --help/);
    });

    it('explains both the interactive and the piped usage', () => {
        expect(help).toContain('Usage:');
        expect(help).toMatch(/\| ccstatusline/);
        expect(help).toContain('Examples:');
        expect(help).toContain('--preview --width');
    });

    it('omits the version when none is known and ends with a single newline', () => {
        const unversioned = buildHelpText('');

        expect(unversioned.split('\n')[0]).toBe('ccstatusline');
        expect(unversioned.endsWith('\n')).toBe(true);
        expect(unversioned.endsWith('\n\n')).toBe(false);
        expect(help.endsWith('\n')).toBe(true);
    });
});
