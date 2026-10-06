# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ccstatusline is a customizable status line formatter for Claude Code CLI that displays model info, git branch, token usage, and other metrics. It functions as:
1. A piped command processor for Claude Code status lines (the hot path: Claude Code runs it on every repaint)
2. An interactive TUI configuration tool when run in a terminal without input
3. A headless CLI (`--help`, `--preview`, `--validate`, `--schema`, `--doctor`) for galleries, CI, editors, and troubleshooting

## Development Commands

```bash
# Install dependencies
bun install

# Run in interactive TUI mode
bun run start

# Test with piped input (use [1m] suffix for 1M context models)
echo '{"model":{"id":"claude-sonnet-4-5-20250929[1m]"},"transcript_path":"test.jsonl"}' | bun run src/ccstatusline.ts

# Or use example payload
bun run example

# Headless CLI (no TUI, no stdin)
bun run src/ccstatusline.ts --help
bun run src/ccstatusline.ts --preview --width 100 --json
bun run src/ccstatusline.ts --validate path/to/config.json
bun run src/ccstatusline.ts --schema
bun run src/ccstatusline.ts --doctor --json

# Build for npm distribution
bun run build   # Creates dist/ccstatusline.js with Node.js 14+ compatibility

# Execute the built package under Node (version, piped render, error paths, CLI flags, chunk isolation)
bun run scripts/smoke-dist.ts

# Run tests
bun test

# Run tests in watch mode
bun test --watch

# Lint and type check
bun run lint      # Runs TypeScript type checking and ESLint without modifying files

# Apply ESLint auto-fixes intentionally
bun run lint:fix
```

## Architecture

The project has dual runtime compatibility - works with both Bun and Node.js:

### Core Structure
- **src/ccstatusline.ts**: Main entry point. Dispatch order: internal Git review cache refresh → `--version` → `--config <path>` → `--hook` → headless CLI (`runCli` from src/cli) → unknown-flag handling → piped render or TUI
  - Piped mode: Parses JSON from stdin (`StatusJSONSchema`) and renders formatted status lines through `renderLines()`
  - Interactive mode: Launches the React/Ink TUI via a dynamic `import('./tui')`, so the TUI bundle is never loaded on the render path
  - Unknown `--flags`: in piped mode one stderr warning and normal rendering (never break a user's status line); in a terminal, help on stderr and exit code 2

### Headless CLI (src/cli/)
- **args.ts**: `CLI_OPTIONS` (the flag table shared by the help text and `findUnknownOptions`)
- **index.ts**: `runCli(argv)` handles `--help`/`-h`, `--preview [--width N] [--json]`, `--validate [file]`, `--schema [settings|status-json]`, `--doctor [--json]`; it never reads stdin
- `--preview` renders from settings with `isPreview: true` (custom commands are not executed, no network); `--validate` exits 0 valid / 1 invalid / 2 unreadable and lists the shell commands and hyperlinks found by `config-review.ts`; `--schema` prints JSON Schema (draft 2020-12) via `z.toJSONSchema`; `--doctor` never reads credentials or prints token-like values

### TUI Components (src/tui/)
- **index.tsx**: Main TUI entry point that handles React/Ink initialization
- **App.tsx**: Root component managing navigation and state
- **components/**: Modular UI components for different configuration screens
  - MainMenu, LineSelector, ItemsEditor, ColorMenu, GlobalOverridesMenu
  - PowerlineSetup, TerminalOptionsMenu, StatusLinePreview, ImportPreviewDialog
  - **items-editor/**: input handling for the line editor (opens widget editors through `getEditorSpec`)
  - **color-menu/**: color menu state mutations
  - **widget-editors/**: generic editors (text, number, symbol-slots, search-list) that render a `WidgetEditorSpec`

### Utilities (src/utils/)
- **config.ts**: Settings management
  - Loads from `~/.config/ccstatusline/settings.json` (or the `--config` path)
  - Handles migration from old settings format
  - Default configuration if no settings exist; never overwrites an invalid file (recovery contract)
  - `validateImportFile` reports every schema issue (`issues`) for imports and `--validate`
- **config-review.ts**: `collectConfigRisks` (shell commands, hyperlinks) and `formatSettingsIssues` for the import preview and `--validate`
- **render-lines.ts**: `renderLines(settings, context)` - the single multi-line pipeline shared by the entry point, the TUI preview, and `--preview`; must not import ink/react
- **renderer.ts**: Core rendering logic for status lines
  - Handles terminal width detection and truncation (`wasTruncated` is set only when a line was actually shortened)
  - Applies colors, padding, and separators
  - Manages flex separator expansion
- **cache-dir.ts**: `getCacheDir()` / `getCachePath()` - every on-disk cache resolves through here; `CCSTATUSLINE_CACHE_DIR` overrides `~/.cache/ccstatusline`
- **widget-manifest.ts**: `WIDGET_MANIFEST` - the widget registry source of truth (type → widget factory); layout widgets live in `LAYOUT_WIDGET_MANIFEST`
- **powerline.ts**: Powerline font detection and installation
- **claude-settings.ts**: Integration with Claude Code settings.json
  - Respects `CLAUDE_CONFIG_DIR` environment variable with fallback to `~/.claude`
  - Provides installation command constants (NPM, BUNX, self-managed)
  - Detects installation status and manages settings.json updates
  - Validates config directory paths with proper error handling
- **colors.ts**: Color definitions and ANSI code mapping
- **model-context.ts**: Model-to-context-window mapping
  - The window size comes from `context_window.context_window_size` when Claude Code reports it, then from a model-name hint such as a `[1m]` suffix, then from the fallback (`CCSTATUSLINE_CONTEXT_SIZE_FALLBACK`, default 200k); usable context is 80% of the window

### Widgets (src/widgets/)
Custom widgets implementing the Widget interface defined in src/types/Widget.ts. Widget modules are plain `.ts` files and must not import `ink` or `react`: `src/__tests__/hot-path-isolation.test.ts` bundles `src/utils/renderer.ts` (which reaches every widget through the registry) and the entry point's static import closure, and fails when either contains the TUI framework.

**Widget Interface:**
All widgets must implement:
- `getDefaultColor()`: Default color for the widget
- `getDescription()`: Description shown in TUI
- `getDisplayName()`: Display name shown in TUI (documented in docs/USAGE.md; `src/utils/__tests__/docs-consistency.test.ts` fails when a display name is missing there)
- `getCategory()`: Picker category (Core, Git, Jujutsu, Tokens, Cache, Token Speed, Context, Session, Usage, Environment, Custom)
- `getEditorDisplay()`: How the widget appears in the editor
- `render()`: Core rendering logic that produces the widget output
- `supportsRawValue()`: Whether widget supports raw value mode
- `supportsColors()`: Whether widget supports color customization
- Optional: `getEditorSpec(item, action)` (declarative editor: text, number, symbol-slots, or search-list; see src/types/WidgetEditorSpec.ts), `getCustomKeybinds()`, `getHideableStates()`, `supportsNumberFormat()`, `handleEditorAction()`, `getNumericValue()`, `preservesRenderedColors()`

**Widget Registry Pattern:**
- Located in src/utils/widgets.ts, built from `WIDGET_MANIFEST` in src/utils/widget-manifest.ts
- Uses a Map-based registry (`widgetRegistry`) that maps widget type strings to widget instances
- `getWidget(type)`: Retrieves widget instance by type (legacy aliases such as `git-pr` resolve to `git-review`)
- `getAllWidgetTypes()`: Returns all available widget types
- `isKnownWidgetType()`: Validates if a type is registered
- New widgets: export the class from src/widgets/index.ts, register it in src/utils/widget-manifest.ts, document the display name in docs/USAGE.md, and never bind `h` (reserved for the shared hide-states checklist)

**Available Widgets (by family):**
- Core / Claude Code: Model, Output Style, Version, Claude Session ID, Claude Status (service health), Voice Status, Sandbox Status, Remote Control Status, Thinking Effort, Vim Mode
- Session: Session Clock, Session Cost, Session Name, Claude Account Email, Skills, Cache Timer, Lines Changed (`cost.total_lines_added/removed`), API Time (`cost.total_api_duration_ms`)
- Git: Git Branch, Git Changes/Insertions/Deletions, Git Status/Staged/Unstaged/Untracked, file-count and clean-status widgets, Git Ahead/Behind, Git Conflicts, Git SHA, Git Root Dir, Git PR/MR, Git CI Status, origin/upstream remote widgets, Git Is Fork, worktree widgets
- Jujutsu: JJ Revision, JJ Bookmarks, JJ Workspace, JJ Changes/Insertions/Deletions, JJ Root Dir, JJ Description
- Tokens / Cache / Token Speed: Tokens Input/Output/Cached/Total, Cache Hit Rate, Cache Read, Cache Write, Input/Output/Total Speed
- Context: Context Length, Context Window, Context %, Context % (usable), Context Bar, Compaction Counter
- Usage: Session Usage, Weekly Usage, the per-model weekly usage widgets registered in `WEEKLY_MODEL_USAGE_BUCKETS` (src/utils/usage-types.ts), Extra Usage Utilization/Remaining/Used, Block Timer, Block Reset Timer, Weekly Reset Timer
- Environment: Current Working Dir, Terminal Width, Memory Usage
- Custom: Custom Text, Custom Symbol, Custom Command, Link
- Layout (not in the registry): Separator, Flex Separator

## Key Implementation Details

- **Cross-platform stdin reading**: Detects Bun vs Node.js environment and uses appropriate stdin API
- **CLI modes**: `--version`, `--config <path>`, `--hook`, `--help`/`-h`, `--preview [--width N] [--json]`, `--validate [file]`, `--schema [settings|status-json]`, `--doctor [--json]`
- **Environment variables**: `CLAUDE_CONFIG_DIR` (Claude Code config directory), `CCSTATUSLINE_WIDTH` (terminal width override), `CCSTATUSLINE_CACHE_DIR` (cache directory override), `CCSTATUSLINE_CONTEXT_SIZE_FALLBACK` (last-resort context window size), `HTTPS_PROXY` (usage API proxy)
- **Token metrics**: Parses Claude Code transcript files (JSONL format) to calculate token usage
- **Git integration**: Uses child_process to get current branch and changes, with in-memory and on-disk caches
- **Terminal width management**: Three modes for handling width (full, full-minus-40, full-until-compact)
- **Flex separators**: Special separator type that expands to fill available space
- **Powerline mode**: Optional Powerline-style rendering with arrow separators
- **Custom commands**: Execute shell commands and display output in status line; never executed in previews (TUI preview or `--preview`)
- **Mergeable items**: Items can be merged together with or without padding
- **Hot path**: Everything reachable from the piped render path must stay free of `ink`/`react`; the TUI is loaded lazily only in interactive mode

## Bun Usage Preferences

Default to using Bun instead of Node.js:
- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun install` instead of `npm install`
- Use `bun run <script>` instead of `npm run <script>`
- Use `bun build` with appropriate options for building
- Bun automatically loads .env, so don't use dotenv

## Important Notes

- **ink@6.2.0 patch**: The project uses a patch for ink@6.2.0 to fix backspace key handling on macOS
  - Issue: ink treats `\x7f` (backspace on macOS) as delete key instead of backspace
  - Fix: Patches `build/parse-keypress.js` to correctly map `\x7f` to backspace
  - Applied automatically during `bun install` via `patchedDependencies` in package.json
  - Patch file: `patches/ink@6.2.0.patch`
- **Build process**: Two-step build using `bun run build`
  1. `bun build`: Bundles src/ccstatusline.ts into dist/ccstatusline.js (with code-split chunks) targeting Node.js 14+
  2. `postbuild`: Runs scripts/replace-version.ts to replace `__PACKAGE_VERSION__` placeholder with actual version from package.json
  - `bun run scripts/smoke-dist.ts` executes the built package under Node (CI runs it after the build job); the entry chunk's static import closure must not reach the ink/React chunk
- **ESLint configuration**: Uses flat config format (eslint.config.js) with TypeScript and React plugins
- **Dependencies**: Every dependency is a devDependency and gets bundled into `dist/`; package.json declares no runtime dependencies, so adding one changes the published install footprint
- **Type checking and linting**: Run checks via `bun run lint` and use `bun run lint:fix` only when you intentionally want ESLint auto-fixes. Never use `npx eslint`, `eslint`, `tsx`, `bun tsc`, or any other variation directly
- **Lint rules**: Never disable a lint rule via a comment, no matter how benign the lint warning or error may seem
- **Testing**: Uses Vitest (via Bun) with more than 150 test files under `src/**/__tests__` covering utils, widgets, TUI components, the CLI, and the built bundle:
  - Model context detection and token calculation (src/utils/__tests__/model-context.test.ts)
  - Context percentage calculations (src/utils/__tests__/context-percentage.test.ts)
  - JSONL transcript parsing (src/utils/__tests__/jsonl.test.ts)
  - Widget rendering and editor specs (src/widgets/__tests__/*.test.ts)
  - TUI components rendered with an Ink test harness (src/tui/**/__tests__)
  - Headless CLI commands (src/cli/__tests__)
  - Docs consistency: every widget display name and CLI flag must appear in docs/USAGE.md (src/utils/__tests__/docs-consistency.test.ts)
  - Hot-path isolation: the bundled entry must not statically import the TUI (src/__tests__/hot-path-isolation.test.ts)
  - Run tests with `bun test` or `bun test --watch` for watch mode; run one file with `bun test <path>`
  - Test configuration: vitest.config.ts
  - New behavior is test-first: write the failing test, watch it fail on an assertion, then implement; never use `.skip`, `.only`, or `.todo`
  - Manual testing also available via piped input, `--preview`, and TUI interaction
