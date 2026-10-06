/**
 * Output sinks for the headless CLI. Every command writes through this
 * interface so tests can capture output without touching process streams.
 */
export interface CliIo {
    stdout(text: string): void;
    stderr(text: string): void;
}

export const defaultCliIo: CliIo = {
    stdout: (text) => { process.stdout.write(text); },
    stderr: (text) => { process.stderr.write(text); }
};
