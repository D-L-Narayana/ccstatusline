/**
 * One command-line option. `argument` is the placeholder shown in the help
 * text: `<name>` for a required value, `[name]` for an optional one.
 */
export interface CliOption {
    flag: string;
    argument?: string;
    description: string;
}

export const HELP_FLAG = '--help';
export const HELP_ALIAS = '-h';

/**
 * Flags the entry point consumes before the CLI dispatcher runs (the Claude
 * Code hook handler and the detached Git review cache refresh). They are not
 * user-facing options, so they are neither listed in the help nor reported as
 * unknown.
 */
export const INTERNAL_FLAGS: readonly string[] = ['--hook', '--internal-refresh-git-review-cache'];

/** Conventional end-of-options marker; everything after it is positional. */
const END_OF_OPTIONS = '--';

/**
 * Every user-facing option, in help order. This list drives the help text, the
 * unknown-flag check in the entry point and the documentation consistency test.
 */
export const CLI_OPTIONS: readonly CliOption[] = [
    { flag: HELP_FLAG, description: 'Print this help and exit' },
    { flag: '--version', description: 'Print the installed package version and exit' },
    { flag: '--config', argument: '<path>', description: 'Read and write settings at this path instead of ~/.config/ccstatusline/settings.json' },
    { flag: '--preview', description: 'Render the configured status line with sample data and exit' },
    { flag: '--width', argument: '<columns>', description: 'Terminal width for --preview (default: the detected width)' },
    { flag: '--json', description: 'Machine-readable output for --preview and --doctor' },
    { flag: '--validate', argument: '[file]', description: 'Check a config file for problems (default: the active settings file)' },
    { flag: '--schema', argument: '[settings|status-json]', description: 'Print the JSON Schema for settings.json (default) or the Claude Code status JSON' },
    { flag: '--doctor', description: 'Print diagnostics about the installation and environment' }
];

function takesRequiredValue(option: CliOption): boolean {
    return option.argument?.startsWith('<') ?? false;
}

/**
 * Tokens that look like long options (`--name`) but are not known, each
 * reported once in order of first appearance. The value that follows an option
 * with a required argument (for example the path after `--config`) is never
 * mistaken for an option, and the internal flags are ignored.
 */
export function findUnknownOptions(argv: string[]): string[] {
    const known = new Map(CLI_OPTIONS.map((option): [string, CliOption] => [option.flag, option]));
    const unknown: string[] = [];

    for (let index = 0; index < argv.length; index++) {
        const token = argv[index];
        if (token === undefined || token === END_OF_OPTIONS) {
            break;
        }

        if (!token.startsWith('--') || INTERNAL_FLAGS.includes(token)) {
            continue;
        }

        const option = known.get(token);
        if (!option) {
            if (!unknown.includes(token)) {
                unknown.push(token);
            }
            continue;
        }

        const next = argv[index + 1];
        if (takesRequiredValue(option) && next !== undefined && !next.startsWith('--')) {
            // The next token is this option's value, not an option of its own.
            index++;
        }
    }

    return unknown;
}
