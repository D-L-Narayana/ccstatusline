# Development

Development setup, project structure, and API documentation for `ccstatusline`.

If you want the main project overview, return to [README.md](../README.md).

## Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- Git
- Node.js 14+ (optional, for running the built `dist/ccstatusline.js` binary or npm publishing)

## Setup

```bash
# Clone the repository
git clone https://github.com/sirmalloc/ccstatusline.git
cd ccstatusline

# Install dependencies
bun install
```

## Development Commands

```bash
# Run in TUI mode
bun run start

# Test piped mode with example payload
bun run example

# Run tests
bun test

# Run typecheck + eslint checks without modifying files
bun run lint

# Apply ESLint auto-fixes intentionally
bun run lint:fix

# Build for distribution
bun run build

# Execute the built package under Node: version, piped render, error paths, CLI flags, chunk isolation
bun run scripts/smoke-dist.ts

# Headless CLI without the TUI or Claude Code input
bun run src/ccstatusline.ts --preview --width 100
bun run src/ccstatusline.ts --validate ~/ccstatusline-config.json
bun run src/ccstatusline.ts --doctor --json

# Generate TypeDoc documentation
bun run docs
```

## Configuration Files

- `~/.config/ccstatusline/settings.json` - ccstatusline UI/render settings
- `~/.claude/settings.json` - Claude Code settings (`statusLine` command object)
- `~/.cache/ccstatusline/block-cache-*.json` - block timer cache, including one-minute no-active-block results (keyed by Claude config directory hash)
- `~/.cache/ccstatusline/git-cache/git-*.json` - persistent git widget command cache
- `~/.cache/ccstatusline/git-review/git-review-*.json` - cached Git PR/MR lookup results
- `~/.cache/ccstatusline/custom-command-cache/cmd-*.json` - opt-in custom command results, grouped by working directory and keyed by command, timeout, session ID, and terminal width
- `~/.cache/ccstatusline/terminal-width.json` - per-session no-width probe results; detected numeric widths are not persisted by the renderer
- `~/.cache/ccstatusline/usage.json` and `~/.cache/ccstatusline/usage.lock` - usage API data cache and fetch backoff lock
- `~/.cache/ccstatusline/claude-status.json` and `~/.cache/ccstatusline/claude-status.lock` - Claude service-status cache and failed-fetch backoff lock
- `~/.cache/ccstatusline/skills/skills-*.jsonl` - per-session skill activity recorded by the `--hook` handler for the Skills widget

Every `~/.cache/ccstatusline` path above is resolved through `getCacheDir()` in `src/utils/cache-dir.ts`. Set `CCSTATUSLINE_CACHE_DIR` to relocate all of them at once: relative paths resolve against the current working directory, and an empty value falls back to the default. Tests and sandboxed renders should prefer this variable over faking `HOME`; `ccstatusline --doctor` prints the directory in effect.

If you use a custom Claude config location, set `CLAUDE_CONFIG_DIR` and ccstatusline will read/write that path instead of `~/.claude`.

On macOS, usage credentials for a custom profile come from `Claude Code-credentials-<sha256(configDir)[:8]>`, then that profile's `.credentials.json`; the lookup does not fall back to another profile's Keychain entry. The hash uses the raw `CLAUDE_CONFIG_DIR` value normalized to NFC, without path resolution. `CLAUDE_SECURESTORAGE_CONFIG_DIR` overrides that hash input, including an empty value to force the default service lookup. Default lookup tries the plain service, discovered suffixed services, then the credentials file. Other platforms use the credentials file directly.

Usage-cache identity prefers a truncated SHA-256 fingerprint of the refresh token and falls back to the access token when no refresh token is available. Access-token rotation preserves the cache when the refresh token is unchanged. Legacy caches carrying the current access-token hash remain readable; the next successful fetch stores the preferred fingerprint. Mismatched account fingerprints are rejected even for stale-cache fallback during API backoff.

Settings saves are atomic and preserve symlinked `settings.json` files by writing through the resolved target. Invalid or unreadable settings are never overwritten during load; `loadSettings()` returns in-memory defaults, records `getConfigLoadError()`, and renderer paths surface that state with an invalid-config warning badge. The TUI captures that load error, keeps a visible warning active, and guards both save paths with an overwrite confirmation until a valid configuration is saved.

Configuration exports snapshot the live TUI settings and add an `exportedBy` package version. Imports reject newer schema versions before current-schema parsing, migrate supported older formats, and retain the source payload's present-key set so merge mode changes only explicitly supplied settings. `applyImport()` filters machine-local installation, schema-version, and update-message metadata; replace mode restores the current installation metadata, while merge mode preserves every omitted value.

Usage-fetch tests spawn subprocess probes. Keep those probes sandboxed by setting `HOME`, `USERPROFILE`, `CLAUDE_CONFIG_DIR`, and proxy variables explicitly so tests cannot read or write a developer's live ccstatusline usage cache.

Usage-lock deadlines more than 24 hours ahead are treated as poisoned and ignored, so mocked clocks, system clock jumps, or old test artifacts cannot suppress usage fetching indefinitely. Valid deadlines up to 24 hours ahead, including API `Retry-After` backoffs, remain active.

## Widget Data Sources

- **Transcript-backed widgets** stream the active JSONL transcript once per render through `getTranscriptAnalysis()`, collecting token, duration, speed, compaction, thinking-effort, and session-name data in one pass without materializing the whole file. Referenced subagent transcripts are streamed separately only when speed metrics include subagents.
- **Block Timer** caches a detected block until its five-hour window expires. When a full scan finds no active block, that empty result is cached for one minute so subsequent repaints do not repeatedly walk and read the entire transcript history.
- **Cache Timer** reads the transcript tail directly on every render. It expands the read backward when a trailing JSONL record exceeds the initial window, ignores sidechain and synthetic API-error rows, and anchors the countdown only on assistant requests with cache activity. It does not create a separate cache file.
- **Claude Status** reads `status.claude.com` through HTTPS, honors `HTTPS_PROXY`, and caches successful responses for five minutes. It requests incident data only when at least one configured Claude Status widget enables history, applies a 30-second backoff after failed fetches, and serves a usable stale cache when available.
- **Local Git widgets** cache command results in memory and under `~/.cache/ccstatusline/git-cache`. Cache misses invoke Git with a five-second timeout; failures, including timeouts, are cached as `null`. Persistent writes use one stable `.tmp` path per cache file and attempt best-effort cleanup on failure, bounding orphaned files when Windows virus scanners or sync clients temporarily hold a handle.
- **Git PR/MR and Git CI Status** render from the versioned disk cache under `~/.cache/ccstatusline/git-review`. Missing or stale entries are refreshed in a detached helper so network-bound `gh` or `glab` calls do not block rendering. Git CI Status adds GitHub's `statusCheckRollup`; if the authenticated `gh` token cannot read checks, the refresh retries with PR metadata only so Git PR/MR still works.
- **Usage widgets** merge Claude Code's stdin `rate_limits` with `/api/oauth/usage` only for fields required by the active widgets. Session and aggregate weekly fields prefer the flat API buckets and fall back to `limits[]`; per-model weekly fields prefer `weekly_scoped` entries. A model-scoped entry reporting 0% without `resets_at` is valid zero usage, while unscoped empty placeholders remain filtered out. `WEEKLY_MODEL_USAGE_BUCKETS` in `src/utils/usage-types.ts` is the shared registry for Sonnet, Opus, and Fable widget wiring, field requirements, reset fields, and scoped-limit matching. Session and weekly percentage widgets delegate rendering and editor behavior to `src/widgets/shared/usage-percent-widget.ts`; the Fable label is `Weekly Fable:`.
- **Custom Command** delegates to `src/utils/custom-command.ts`. `customCommandCacheTtlSeconds` defaults to `0` (disabled), with a maximum of 60 seconds. Both successes and failures are cached, with TTL measured from command completion; without a session ID, entries stay in process memory. Other stdin fields are deliberately excluded from the key. A helper in the current runtime captures stdout in memory, limits it to 1 MiB, and retains at most 16,384 characters; it enforces command deadlines and closes inherited pipes, terminating the process group on POSIX or the shell on Windows when a command times out. Cached raw output is formatted separately by each widget, and previews never execute commands.
- **Terminal width** is memoized once per render, including a `null` probe result. Linux first probes ancestor terminal devices through `/proc` and `tty.WriteStream`; portable fallbacks use `execFileSync` for `ps`, `stty`, and `tput`. `CCSTATUSLINE_WIDTH` takes precedence, including on Windows where probing is disabled. Only no-width results are persisted per session, for `terminalWidthCacheTtlSeconds` (default 5, range 0–300); `0` disables cross-process reuse. Numeric widths are re-probed on the next render.
- **Context length transcript fallback** treats the latest `compact_boundary` as the start of the current context. It uses the first main-chain usage entry after that boundary, then `compactMetadata.postTokens`, then zero, while session token totals remain cumulative.
- **Sandbox Status** reads `sandbox.enabled` from Claude Code's layered project-local, project, user-local, and user settings on every refresh. This reflects `/sandbox` file updates but remains a best-effort indicator when managed or CLI settings take precedence.

## Widget Editors

Widgets never import `ink` or `react`. When a widget needs more than a keybind toggle (free text, a number, glyph slots, or a searchable list), it implements `getEditorSpec(item, action)` from `src/types/Widget.ts` and returns a declarative `WidgetEditorSpec` (`src/types/WidgetEditorSpec.ts`); the generic editors in `src/tui/components/widget-editors/` render it. The items editor opens an editor when a matched keybind's `handleEditorAction` returns `null` and `getEditorSpec` returns a spec. Four kinds exist:

- `text` - free text with a grapheme-aware cursor, an optional `hint` line, and an optional live `validate` warning (Custom Text, Custom Command, Link)
- `number` - digits only with optional `min`/`max`; blank input commits `null`, which means "clear" (max width, timeout, path segments, speed window, list limit)
- `symbol-slots` - one or more single-grapheme inputs (type to set, Tab for the default, Backspace for none) committed as an ordered array (Git/JJ glyphs, Custom Symbol, Lines Changed)
- `search-list` - a filterable single-select list backed by `getOptions(query)` (reset-timer locale and timezone)

Shared spec builders live in `src/widgets/shared/` (`symbol-override`, `max-width`, `speed-widget`, `locale-editor`, `timezone-editor`). Keeping widgets free of TUI imports is what lets the status line render path skip the ink/React bundle; `src/__tests__/hot-path-isolation.test.ts` fails if that bundle becomes statically reachable from the entry point again.

## Build Notes

- Build target is Node.js 14+ (`dist/ccstatusline.js`)
- `postbuild` replaces the bundled `__PACKAGE_VERSION__` placeholder from `package.json`; `ccstatusline --version` reads that value and exits before mode detection
- During install, `ink@6.2.0` is patched to fix backspace handling on macOS terminals
- React and React DOM are exact-version pins; dependency refreshes should update `package.json` and `bun.lock` together
- All dependencies are bundled into `dist/`; `package.json` declares no runtime dependencies, so the published package installs without a dependency tree
- `bun run scripts/smoke-dist.ts` builds (skip with `--no-build`) and executes `dist/ccstatusline.js` under Node inside a throwaway home directory (`HOME`, `USERPROFILE`, `CLAUDE_CONFIG_DIR`, and `CCSTATUSLINE_CACHE_DIR` all point into it): it checks `--version` against `package.json`, a piped render of `scripts/payload.example.json`, the malformed-JSON, schema-invalid-JSON, and empty-stdin error paths, the headless CLI flags (`--help`, `--preview --width 80` with and without `--json`, `--schema`, `--doctor --json`, `--validate` on the written defaults and on `scripts/smoke/broken-settings.json`), and that the entry chunk's static import closure never reaches the TUI framework chunk. `--phase=baseline` runs only the version, piped-render, and error-path cases; the default `--phase=all` is the release gate, and the CI `smoke` job runs it under Node 20 after the build job
- The status line render path (`src/ccstatusline.ts` → `src/utils/render-lines.ts` → widgets) must stay free of `ink`/`react` imports; the TUI is loaded with a dynamic import only in interactive mode

## API Documentation

[`llms.txt`](../llms.txt) provides a short project overview and links to the hand-written guides for coding agents.

Complete API documentation is generated using TypeDoc and includes detailed information about:

- **Core Types**: Configuration interfaces, widget definitions, and render contexts
- **Widget System**: All available widgets and their customization options
- **Utility Functions**: Helper functions for rendering, configuration, and terminal handling
- **Status Line Rendering**: Core rendering engine and formatting options

### Generating Documentation

To generate the API documentation locally:

```bash
# Generate documentation
bun run docs

# Clean generated documentation
bun run docs:clean
```

The documentation will be generated in the `typedoc/` directory and can be viewed by opening `typedoc/index.html` in your web browser.

### Documentation Structure

- **Types**: Core TypeScript interfaces and type definitions
- **Widgets**: Individual widget implementations and their APIs
- **Utils**: Utility functions for configuration, rendering, and terminal operations
- **Main Module**: Primary entry point and orchestration functions

## Project Structure

```text
ccstatusline/
├── src/
│   ├── ccstatusline.ts         # Main entry point (mode detection, CLI dispatch)
│   ├── cli/                    # Headless CLI: --help, --preview, --validate, --schema, --doctor
│   │   ├── args.ts             # Flag table shared by the help text and unknown-flag detection
│   │   ├── index.ts            # runCli() dispatch
│   │   └── ...
│   ├── tui/                    # React/Ink configuration UI
│   │   ├── App.tsx             # Root TUI component
│   │   ├── index.tsx           # TUI entry point
│   │   └── components/         # UI components
│   │       ├── MainMenu.tsx
│   │       ├── LineSelector.tsx
│   │       ├── ItemsEditor.tsx
│   │       ├── ColorMenu.tsx
│   │       ├── PowerlineSetup.tsx
│   │       ├── color-menu/     # Color menu state mutations
│   │       ├── items-editor/   # Items editor input handling
│   │       ├── widget-editors/ # Generic editors driven by WidgetEditorSpec
│   │       └── ...
│   ├── widgets/                # Status line widget implementations (no ink/react imports)
│   │   ├── Model.ts
│   │   ├── GitBranch.ts
│   │   ├── TokensTotal.ts
│   │   ├── OutputStyle.ts
│   │   ├── shared/             # Helpers shared by widget families (glyph slots, hideable states, editor specs)
│   │   └── ...
│   ├── utils/                  # Utility functions
│   │   ├── config.ts           # Settings management
│   │   ├── config-review.ts    # Schema issue formatting and shell-command/hyperlink review
│   │   ├── cache-dir.ts        # Cache directory resolution (CCSTATUSLINE_CACHE_DIR)
│   │   ├── render-lines.ts     # Shared multi-line render pipeline (entry point, TUI preview, --preview)
│   │   ├── renderer.ts         # Core rendering logic
│   │   ├── widget-manifest.ts  # Widget registry source of truth
│   │   ├── powerline.ts        # Powerline font utilities
│   │   ├── colors.ts           # Color definitions
│   │   └── claude-settings.ts  # Claude Code integration (supports CLAUDE_CONFIG_DIR)
│   └── types/                  # TypeScript type definitions
│       ├── Settings.ts
│       ├── Widget.ts
│       ├── WidgetEditorSpec.ts
│       ├── PowerlineConfig.ts
│       └── ...
├── scripts/
│   ├── payload.example.json    # Sample Claude Code status JSON (bun run example)
│   ├── replace-version.ts      # postbuild version stamping
│   ├── smoke-dist.ts           # Node smoke test for the built package
│   └── smoke/                  # Fixtures for the smoke test
├── dist/                       # Built files (generated)
├── docs/                       # Hand-written repository docs
├── typedoc/                    # Generated API docs
├── package.json
├── tsconfig.json
└── README.md
```
