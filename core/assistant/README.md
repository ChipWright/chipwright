# AI Development Assistant

Provider-agnostic AI assistant for OpenHome Studio (branch 11, Phase 6): a tool-using agent
that helps engineers understand, diagnose, and evolve device definitions. Its suggestions
are **grounded** — checked against the real DDL compiler before they reach you — and
applying any change is always a human-in-the-loop step.

## Bring your own LLM

The assistant talks to whatever model you configure with your own API key. Three wire
formats are supported natively:

- **`anthropic`** — Anthropic Messages API (Claude)
- **`gemini`** — Google Gemini `generateContent`
- **`openai-compatible`** — the OpenAI Chat Completions format. With a configurable base
  URL this one adapter reaches OpenAI, OpenRouter, Groq, DeepSeek, Mistral, Azure OpenAI,
  and local servers such as Ollama and LM Studio. In practice this is "any API key."

Configuration comes from the environment:

```
OPENHOME_LLM_PROVIDER   anthropic | gemini | openai-compatible   (default anthropic)
OPENHOME_LLM_API_KEY    your key (omit only when using a local base URL)
OPENHOME_LLM_MODEL      model id (a sensible per-provider default otherwise)
OPENHOME_LLM_BASE_URL   endpoint for openai-compatible, e.g. http://localhost:11434/v1
```

## What it does

The agent runs a set of tools over the platform, each grounded in `@openhome/studio-core`:

- `read_device` — read a manifest from disk
- `validate_manifest` — validate YAML against the DDL and return diagnostics
- `compile_manifest` — compile and report the artifacts it generates
- `list_templates` — the built-in device templates as starting points
- `propose_device` — the human-in-the-loop gate: it refuses to record a proposal unless the
  manifest compiles, so a broken suggestion can never reach you

The loop sends the conversation and tool schemas to your provider, runs any tool calls,
feeds the results back, and repeats until a final answer or a step cap. It never writes
files; proposals are surfaced for you to apply.

## Drafting a board support package

The same grounded loop helps a hardware contributor draft a BSP for a new chip. Its tools
read the exact HAL interface and a reference BSP, and the grounding is a real host compile
check: `propose_bsp` refuses any draft that does not compile against `sdk/firmware/include`
with the repository's flags (including `-Werror`), so a BSP that would not build can never
be surfaced. This is the firmware counterpart of `propose_device`.

- `read_hal_interface` — the HAL and SDK headers a BSP must implement
- `read_reference_bsp` — the native or esp32 BSP as a worked example (esp32 shows vendor
  headers stubbed under `hostcheck/`)
- `compile_bsp` — compile a draft against the real HAL and return the compiler output
- `propose_bsp` — the gate: only a BSP that compiles is recorded

## Command line

```sh
export OPENHOME_LLM_PROVIDER=anthropic
export OPENHOME_LLM_API_KEY=sk-...
node dist/cli.js ask "add a humidity sensor and make it battery powered" \
  --device examples/thermostat/device.yaml
# review the diff, then:
node dist/cli.js ask "..." --device examples/thermostat/device.yaml --apply
```

Point it at a local model instead (no key needed):

```sh
export OPENHOME_LLM_PROVIDER=openai-compatible
export OPENHOME_LLM_BASE_URL=http://localhost:11434/v1
export OPENHOME_LLM_MODEL=llama3.1
node dist/cli.js ask "explain what this device does" --device examples/thermostat/device.yaml
```

Draft a BSP for a new board (run from the repo root so it can read the HAL). The draft is
shown only if it compiles; re-run with `--apply` to write it under `sdk/firmware/bsp/<board>`:

```sh
node core/assistant/dist/cli.js bsp "STM32U5 with an on-die temperature sensor"
node core/assistant/dist/cli.js bsp "STM32U5 ..." --apply
```

## Privacy

Your prompt and the manifest contents are sent to whichever endpoint you configure. API
keys are read from the environment, never logged, and sent only to that endpoint — which
can be `localhost` for a fully private local model.

## Running

```sh
pnpm --filter @openhome/assistant test
```

The full agent loop and every provider adapter are tested with a scripted mock provider and
a mocked `fetch`, so the suite runs in CI with no API keys and no network.

## Not yet implemented

- An in-editor chat panel in the IDE (this core is shell-agnostic and built to back it)
- Running the digital twin as a grounding tool (needs a manifest-driven twin)
- Running the acceptance test suites as a tool, and token or cost accounting
