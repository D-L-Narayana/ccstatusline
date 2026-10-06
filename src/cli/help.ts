import {
    CLI_OPTIONS,
    HELP_ALIAS,
    HELP_FLAG,
    type CliOption
} from './args';

const PROGRAM_NAME = 'ccstatusline';
const TAGLINE = 'Customizable status line for Claude Code.';
const DOCS_URL = 'https://github.com/sirmalloc/ccstatusline/blob/main/docs/USAGE.md#command-line-flags';
const INDENT = '  ';
const COLUMN_GAP = 2;

const USAGE_ROWS: readonly [string, string][] = [
    [PROGRAM_NAME, 'Open the interactive configuration (TUI)'],
    [`<status JSON> | ${PROGRAM_NAME}`, 'Render the status line for Claude Code'],
    [`${PROGRAM_NAME} --preview [--width <columns>] [--json]`, 'Render your configuration with sample data'],
    [`${PROGRAM_NAME} --validate [file]`, 'Check a settings file and list what it would run'],
    [`${PROGRAM_NAME} --schema [settings|status-json]`, 'Print a JSON Schema'],
    [`${PROGRAM_NAME} --doctor [--json]`, 'Print installation diagnostics']
];

const EXAMPLES: readonly string[] = [
    `${PROGRAM_NAME} --preview --width 120`,
    `${PROGRAM_NAME} --preview --width 100 --json`,
    `${PROGRAM_NAME} --config ./statusline.json --validate`,
    `${PROGRAM_NAME} --validate ~/ccstatusline-export.json`,
    `${PROGRAM_NAME} --schema > ccstatusline.schema.json`,
    `${PROGRAM_NAME} --doctor --json`,
    `cat status.json | ${PROGRAM_NAME}`
];

const EXIT_CODE_ROWS: readonly [string, string][] = [
    ['0', 'Success (for --validate: the configuration is valid)'],
    ['1', 'Invalid configuration (--validate) or a render error'],
    ['2', 'Usage error, unknown schema target, or unreadable file']
];

function optionLabel(option: CliOption): string {
    // Keep long flags in one column whether or not a short alias precedes them.
    const prefix = option.flag === HELP_FLAG ? `${HELP_ALIAS}, ` : ' '.repeat(HELP_ALIAS.length + 2);
    const flag = `${prefix}${option.flag}`;
    return option.argument ? `${flag} ${option.argument}` : flag;
}

function formatTable(rows: readonly [string, string][]): string[] {
    const column = Math.max(...rows.map(([label]) => label.length)) + COLUMN_GAP;
    return rows.map(([label, text]) => `${INDENT}${label.padEnd(column)}${text}`);
}

/** Help text generated from CLI_OPTIONS; `version` may be empty when unknown. */
export function buildHelpText(version: string): string {
    const header = version ? `${PROGRAM_NAME} ${version}` : PROGRAM_NAME;
    const optionRows = CLI_OPTIONS.map((option): [string, string] => [optionLabel(option), option.description]);

    const sections = [
        [header, TAGLINE],
        ['Usage:', ...formatTable(USAGE_ROWS)],
        ['Options:', ...formatTable(optionRows)],
        ['Examples:', ...EXAMPLES.map(example => `${INDENT}${example}`)],
        ['Exit codes:', ...formatTable(EXIT_CODE_ROWS)],
        [`Documentation: ${DOCS_URL}`]
    ];

    return `${sections.map(lines => lines.join('\n')).join('\n\n')}\n`;
}
