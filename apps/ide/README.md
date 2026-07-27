# Chipwright

The developer application for Chipwright: a project explorer, a visual device
designer that emits DDL, a live twin debugger, and an AI assistant panel. It is delivered
as a **VS Code extension** over the shell-agnostic studio core.

## Panels

- **Designer** and **Twin** — visual DDL editing and live twin debugging, over `core/studio`.
  From the Designer, **Generate** writes every artifact (firmware interface, cloud API, tests,
  docs) to a `generated/` folder next to the manifest, and **Scaffold firmware** writes a
  starter module wired to the generated interface and opens it. Generated output is
  regenerable; the scaffold is yours to edit and is never overwritten.
- **AI Assistant** (`Open AI Assistant` from the Devices view) — a chat panel over
  `core/assistant`. It is bring-your-own-key (provider and model in settings under
  `chipwright.assistant`; the API key is stored in VS Code secret storage, never in settings
  or the webview). It proposes DDL edits as a diff, checked against the compiler first, and
  applies them to the device manifest only when you click Apply, preserving comments.

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
