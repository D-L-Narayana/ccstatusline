import { getPackageVersion } from '../utils/terminal';

import {
    HELP_ALIAS,
    HELP_FLAG
} from './args';
import { runDoctor } from './doctor';
import { buildHelpText } from './help';
import {
    defaultCliIo,
    type CliIo
} from './io';
import {
    parsePreviewWidth,
    runPreview
} from './preview';
import {
    SCHEMA_TARGETS,
    buildJsonSchema,
    isSchemaTarget
} from './schema';
import { runValidate } from './validate';

export type CliDispatchResult
    = | { handled: false }
        | { handled: true; exitCode: number };

const EXIT_OK = 0;
const EXIT_USAGE = 2;

/** Flags that select a headless mode; at most one may be given. */
const MODE_FLAGS = ['--preview', '--validate', '--schema', '--doctor'] as const;

function handled(exitCode: number): CliDispatchResult {
    return { handled: true, exitCode };
}

/** The token after `flag` when it is a value rather than another option. */
function valueAfter(argv: string[], flag: string): string | undefined {
    const index = argv.indexOf(flag);
    if (index === -1) {
        return undefined;
    }

    const next = argv[index + 1];
    return next !== undefined && !next.startsWith('-') ? next : undefined;
}

function runSchema(argv: string[], io: CliIo): CliDispatchResult {
    const target = valueAfter(argv, '--schema') ?? 'settings';
    if (!isSchemaTarget(target)) {
        io.stderr(`ccstatusline: unknown schema target "${target}" (expected ${SCHEMA_TARGETS.join(' or ')})\n`);
        return handled(EXIT_USAGE);
    }

    io.stdout(`${JSON.stringify(buildJsonSchema(target), null, 2)}\n`);
    return handled(EXIT_OK);
}

async function runPreviewMode(argv: string[], json: boolean, io: CliIo): Promise<CliDispatchResult> {
    let width: number | undefined;
    const widthIndex = argv.indexOf('--width');
    if (widthIndex !== -1) {
        // Taken verbatim (even "-3") so the error can quote what was given.
        const raw = argv[widthIndex + 1];
        const parsed = parsePreviewWidth(raw);
        if (parsed === null) {
            io.stderr(raw === undefined
                ? 'ccstatusline: --width requires a number of columns\n'
                : `ccstatusline: --width expects a positive whole number of columns, got "${raw}"\n`);
            return handled(EXIT_USAGE);
        }

        width = parsed;
    }

    return handled(await runPreview({ width, json }, io));
}

/**
 * Runs the headless CLI mode requested by `argv`, if any. Never reads stdin.
 * Returns `handled: false` when no mode is requested so the entry point can
 * continue with the piped render or the TUI.
 */
export async function runCli(argv: string[], io: CliIo = defaultCliIo): Promise<CliDispatchResult> {
    if (argv.includes(HELP_FLAG) || argv.includes(HELP_ALIAS)) {
        io.stdout(buildHelpText(getPackageVersion()));
        return handled(EXIT_OK);
    }

    const modes = MODE_FLAGS.filter(flag => argv.includes(flag));
    if (modes.length > 1) {
        io.stderr(`ccstatusline: ${modes.join(' and ')} cannot be combined; choose one mode\n`);
        return handled(EXIT_USAGE);
    }

    const mode = modes[0];
    if (mode === undefined) {
        return { handled: false };
    }

    const json = argv.includes('--json');
    switch (mode) {
        case '--schema':
            return runSchema(argv, io);
        case '--doctor':
            return handled(await runDoctor({ json }, io));
        case '--validate':
            return handled(await runValidate(valueAfter(argv, '--validate'), io));
        case '--preview':
            return runPreviewMode(argv, json, io);
    }
}
