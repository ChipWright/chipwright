# Chipwright

> Build a production smart device from a single definition, visually, in VS Code.

[![Version](https://img.shields.io/visual-studio-marketplace/v/chipwright.chipwright)](https://marketplace.visualstudio.com/items?itemName=chipwright.chipwright)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/chipwright.chipwright)](https://marketplace.visualstudio.com/items?itemName=chipwright.chipwright)
[![License](https://img.shields.io/badge/license-Elastic--2.0-blue.svg)](https://github.com/ChipWright/chipwright/blob/main/LICENSE)

Describe a device once, in plain terms, and Chipwright generates its firmware interface, cloud
API, tests, and docs. This extension is the visual front end: **design a device, watch it run as
a live digital twin, generate real code, and get AI help, without leaving the editor.**

## Features

### Visual device designer

Define what a device senses, controls, how it connects, and how it is powered, through a form
instead of hand-written config. It reads and writes a plain `device.yaml`, validates as you type,
and shows the artifacts your definition produces.

### Live twin debugger

Run the device as a digital twin before you own any hardware. Stream live telemetry to a chart
and inject sensor faults (stuck, failed, drifting) to see how the device behaves.

### Generate and scaffold

One click writes every generated artifact (firmware interface, cloud API, tests, docs) to a
`generated/` folder next to your manifest. A second click scaffolds a starter firmware module
wired to that interface and opens it, so "design" flows straight into "code." Generated output is
regenerable; your scaffolded code is yours and is never overwritten.

### AI assistant, bring your own key

A chat panel that proposes edits to your device and shows them as a diff. Every suggestion is
checked against the real compiler before you see it, and nothing is applied until you click Apply.
Use Anthropic, Gemini, any OpenAI-compatible endpoint, or a fully local model. Your key is stored
in VS Code secret storage and sent only to the endpoint you configure.

## Getting started

1. Install the extension and open the **Chipwright** view from the Activity Bar.
2. Create a device from a template, or open an existing `device.yaml`.
3. Design it in the **Designer**, then use **Generate** and **Scaffold firmware** from the output
   panel.
4. Switch to the **Twin** tab to run it and watch live telemetry.
5. Open the **AI Assistant** (sparkle icon) to edit the device from a prompt.

## Requirements

- The designer, artifact generation, and the AI assistant work in **any** workspace.
- The **twin debugger** runs Chipwright's digital twin, which lives in the
  [Chipwright source workspace](https://github.com/ChipWright/chipwright); open that repository to
  use it. Building the twin needs a C toolchain (`make` plus `gcc` or `clang`).

## Extension settings

| Setting | Description |
| --- | --- |
| `chipwright.assistant.provider` | LLM provider: `anthropic`, `gemini`, or `openai-compatible`. |
| `chipwright.assistant.model` | Model id. Leave blank for the provider default. |
| `chipwright.assistant.baseUrl` | Base URL for the `openai-compatible` provider (e.g. a local Ollama server). |

The assistant's API key is set through the panel and stored in VS Code secret storage, never in
settings.

## Learn more

- [Documentation and guided tour](https://github.com/ChipWright/chipwright#readme)
- [Report an issue](https://github.com/ChipWright/chipwright/issues)
- [Source code](https://github.com/ChipWright/chipwright)

Chipwright is created and maintained by [Diego Regalado](https://github.com/Diegoregalado0).
Licensed under the [Elastic License 2.0](https://github.com/ChipWright/chipwright/blob/main/LICENSE).
