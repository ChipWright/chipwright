# Developer IDE

The developer application for OpenHome Studio: a project explorer, a visual device
designer that emits DDL, and a live twin debugger. It is delivered as a **VS Code
extension** (branch 10, Phase 5).

## Architecture

The extension is a thin adapter. All real logic lives in `core/studio`, a shell-agnostic
Node library that validates manifests, generates artifacts, and drives the live twin. The
extension registers commands, views, and webview panels, and forwards their messages to
`core/studio`.

```
Webview UI (visual designer, twin debugger)   <- branded product identity
        | postMessage
apps/ide (VS Code extension adapter)          <- this package, thin glue
        | function calls
core/studio (validate, generate, twin driver) <- shell-agnostic, unit tested in CI
        | spawns
simulator/examples/twin_studio (C twin)
```

This split is deliberate: the IDE is designed to graduate into a standalone application
(Electron or Tauri) later without a rewrite. The webview UI and `core/studio` move over
unchanged; only this adapter is replaced, because a webview talking to a Node backend over
messages is the same shape those app shells use.

## Testing

VS Code extension integration tests require a downloaded editor, which is heavy and flaky
in CI. The logic that matters is therefore unit tested in `core/studio` instead, and the
twin binary spawn is exercised by a manual demonstration, mirroring how the cloud bridge
is structured. This adapter is kept thin enough to hold no untested logic of its own.

Status: in progress.
