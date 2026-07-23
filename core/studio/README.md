# @openhome/studio-core

The shell-agnostic core of the OpenHome Studio developer IDE. It holds all IDE logic with
no dependency on any window or editor, so the same code backs the VS Code extension today
and a standalone application (Electron or Tauri) later.

## Surface

- **`validate(manifestYaml)`** — parse a manifest and report diagnostics.
- **`generate(manifestYaml)`** — produce every downstream artifact (firmware interface,
  cloud API, tests, documentation) from the manifest, via `@openhome/device-engine`.
- **`spawnTwin(options, handlers)`** — launch the controllable twin binary
  (`simulator/examples/twin_studio`) and stream its telemetry samples to the shell for the
  live debugger. `twinArgs` and the telemetry parser are pure and unit tested; the process
  spawn is the only untested surface.

## Why it exists

Keeping this logic out of the shell is what lets the IDE change shells without a rewrite.
A shell (the VS Code extension, or a future app) only ever calls these functions and
forwards the results to its UI. See the Developer IDE architecture section in
[../../docs/ROADMAP.md](../../docs/ROADMAP.md).

## Development

```sh
pnpm --filter @openhome/device-engine build
pnpm --filter @openhome/studio-core test
```

`core/studio` consumes the built output of `@openhome/device-engine`, so build the device
engine first (the workspace build does this in dependency order).
