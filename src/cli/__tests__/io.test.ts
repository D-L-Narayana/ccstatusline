import {
    afterEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { defaultCliIo } from '../io';

describe('defaultCliIo', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('writes stdout text to the process stdout stream without altering it', () => {
        const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

        defaultCliIo.stdout('plain line\n');

        expect(write).toHaveBeenCalledTimes(1);
        expect(write).toHaveBeenCalledWith('plain line\n');
    });

    it('writes stderr text to the process stderr stream without altering it', () => {
        const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

        defaultCliIo.stderr('problem\n');

        expect(write).toHaveBeenCalledTimes(1);
        expect(write).toHaveBeenCalledWith('problem\n');
    });
});
