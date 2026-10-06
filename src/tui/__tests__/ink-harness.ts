import type {
    Instance,
    RenderOptions
} from 'ink';
import { PassThrough } from 'node:stream';
import stripAnsi from 'strip-ansi';

// Shared Ink test harness: a fake TTY stdin plus capturing stdout/stderr so
// components can be rendered with ink's `render(node, harness.renderOptions)`
// and driven by writing raw key sequences to `stdin`. Not a test file itself
// (the runner only collects *.test.ts(x)).

/** Raw terminal sequences for the keys ink's useInput reports. */
export const KEYS = {
    enter: '\r',
    escape: '\u001B',
    tab: '\t',
    up: '\u001B[A',
    down: '\u001B[B',
    right: '\u001B[C',
    left: '\u001B[D',
    ctrlRight: '\u001B[1;5C',
    ctrlLeft: '\u001B[1;5D',
    backspace: '\u007F',
    delete: '\u001B[3~'
} as const;

class MockTtyStream extends PassThrough {
    isTTY = true;
    columns: number;
    rows = 40;

    constructor(columns: number) {
        super();
        this.columns = columns;
    }

    setRawMode() {
        return this;
    }

    ref() {
        return this;
    }

    unref() {
        return this;
    }
}

export interface CapturedWriteStream extends NodeJS.WriteStream {
    clearOutput: () => void;
    getOutput: () => string;
}

export interface InkHarnessOptions {
    /** Terminal width reported to ink; defaults to 120. */
    columns?: number;
}

export interface InkHarness {
    stdin: NodeJS.ReadStream;
    stdout: CapturedWriteStream;
    stderr: CapturedWriteStream;
    /** Pass straight to ink's `render(node, renderOptions)`. */
    renderOptions: RenderOptions;
    /** Lets ink process pending input and re-render (defaults to 25 ms). */
    flush: (delayMs?: number) => Promise<void>;
    /** Writes each sequence to stdin, flushing after every one. */
    press: (...sequences: string[]) => Promise<void>;
    /** Everything written to stdout so far, ANSI-stripped with \n line endings. */
    plainOutput: () => string;
    /** Unmounts the instance (when given) and destroys the streams. */
    cleanup: (instance?: Instance) => void;
}

function createCapturedStream(columns: number): CapturedWriteStream {
    const stream = new MockTtyStream(columns);
    const chunks: string[] = [];

    stream.on('data', (chunk: Buffer | string) => {
        chunks.push(chunk.toString());
    });

    return Object.assign(stream as unknown as NodeJS.WriteStream, {
        clearOutput() {
            chunks.length = 0;
        },
        getOutput() {
            return chunks.join('');
        }
    });
}

export function createInkHarness(options: InkHarnessOptions = {}): InkHarness {
    const columns = options.columns ?? 120;
    const stdin = new MockTtyStream(columns) as unknown as NodeJS.ReadStream;
    const stdout = createCapturedStream(columns);
    const stderr = createCapturedStream(columns);
    const flush = async (delayMs = 25): Promise<void> => {
        await new Promise<void>((resolve) => {
            setTimeout(resolve, delayMs);
        });

        // React flushes passive effects (useInput re-subscribing with the
        // latest handler) from scheduler tasks that may run after the timer
        // on a loaded machine; yield to them so the next key press is never
        // handled by a stale closure.
        for (let i = 0; i < 2; i++) {
            await new Promise<void>((resolve) => {
                setImmediate(resolve);
            });
        }
    };

    return {
        stdin,
        stdout,
        stderr,
        renderOptions: {
            stdin,
            stdout,
            stderr,
            debug: true,
            exitOnCtrlC: false,
            patchConsole: false
        },
        flush,
        press: async (...sequences) => {
            for (const sequence of sequences) {
                stdin.write(sequence);
                await flush();
            }
        },
        plainOutput: () => stripAnsi(stdout.getOutput()).replace(/\r\n/g, '\n'),
        cleanup: (instance) => {
            instance?.unmount();
            instance?.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    };
}
