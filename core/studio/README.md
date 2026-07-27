# @chipwright/studio-core

The shell-agnostic core of the Chipwright developer IDE. It holds all IDE logic with
no dependency on any window or editor, so the same code backs the VS Code extension today
and a standalone application (Electron or Tauri) later.

## Surface

- **`validate(manifestYaml)`** — parse a manifest and report diagnostics.
- **`generate(manifestYaml)`** — produce every downstream artifact (firmware interface,
  cloud API, tests, documentation) from the manifest, via `@chipwright/device-engine`.
- **`spawnTwin(options, handlers)`** — launch the controllable twin binary
  (`simulator/examples/twin_studio`) and stream its telemetry samples to the shell for the
  live debugger. `twinArgs` and the telemetry parser are pure and unit tested; the process
  spawn is the only untested surface.

## Why it exists

Keeping this logic out of the shell is what lets the IDE change shells without a rewrite.
A shell (the VS Code extension, or a future app) only ever calls these functions and
forwards the results to its UI.

## Development

```sh
pnpm --filter @chipwright/device-engine build
pnpm --filter @chipwright/studio-core test
```

`core/studio` consumes the built output of `@chipwright/device-engine`, so build the device
engine first (the workspace build does this in dependency order).
