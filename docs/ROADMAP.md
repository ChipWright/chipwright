# OpenHome Studio Roadmap

The platform is decomposed into 15 subsystems ("branches"). We do not build them all at
once. Each phase produces something demonstrable and unblocks the next.

## Critical path

`DDL (01) -> Simulator (05) -> SDK (03)`. The DDL is the foundation; the simulator lets
every later branch be built and tested without hardware.

## Phases

1. **Foundation** — DDL, HAL (ESP32 target), SDK core, governance.
   Exit: a thermostat manifest compiles to firmware stubs that log telemetry.
2. **Connect** — Protocol layer (Matter first), simulator with fault and network
   injection. Exit: a virtual thermostat commissions over Matter and survives packet loss.
3. **Verify** — Test framework, hardware-in-the-loop rack.
   Exit: the same suite passes on twin and on a physical board in CI.
4. **Operate** — Cloud (registry, telemetry, commands), security (identity, signing),
   signed and staged OTA with rollback.
5. **Author** — Developer IDE (visual designer, twin debugger) delivered as a VS Code
   extension over a shell-agnostic core, plus a static documentation site generator.
6. **Scale** — AI development assistant, manufacturing pipeline, marketplace.

## The 15 branches

1. Device Definition Language (DDL) — Phase 1
2. Hardware Abstraction Layer — Phase 1
3. Firmware SDK — Phase 1
4. Protocol Integration Layer — Phase 2
5. Virtual Device Simulator / Digital Twin — Phase 2
6. Hardware-in-the-Loop Testing — Phase 3
7. Automated Testing Framework — Phase 3
8. Cloud Infrastructure — Phase 4
9. Security Framework — Phase 4
10. Developer IDE — Phase 5 (see "Developer IDE architecture" below)
11. AI Development Assistant — Phase 6
12. Manufacturing Pipeline — Phase 6
13. Marketplace / Community — Phase 6
14. Documentation Generator — Phase 5
15. Governance and Architecture — Phase 1, ongoing

## Current status

Phases 1 through 5 are complete and demonstrated end-to-end for the thermostat device
class: a single manifest generates the firmware interface, cloud API, tests, and
documentation; the twin commissions over simulated Matter and survives packet loss; a
device streams telemetry through the bridge into the cloud with signed, rollback-safe
OTA; and the developer IDE builds a device visually and debugs its twin. Phase 6 (Scale)
is in progress, starting with the marketplace: signed device packages that can be
published and installed with `openhome install <device>`.

## Developer IDE architecture (branch 10)

The IDE is delivered first as a **VS Code extension**, and is designed to graduate into a
standalone application later without a rewrite. Three layers, with a hard seam between
logic and shell:

- **`core/studio`** — a shell-agnostic Node library: validate a manifest, generate every
  artifact, and drive the live twin (spawn the twin binary, parse its telemetry). It has
  no VS Code dependency and holds all real logic, so it is fully unit tested in CI.
- **`apps/ide`** — the VS Code extension: a thin adapter that registers commands, views,
  and webview panels, and forwards their messages to `core/studio`.
- **Webview UI** — the branded visual designer and twin debugger, rendered as web pages
  inside VS Code. This is where product identity lives.

Graduating to a standalone app (Electron or Tauri) keeps `core/studio` and the webview UI
unchanged and replaces only the extension adapter, because a webview talking to a Node
backend over messages is the same shape those app shells use. VS Code integration tests
need a downloaded editor, so the extension adapter is kept thin and the twin binary spawn
stays a manual demonstration, while the tested logic lives in `core/studio`.

## AI Development Assistant (branch 11)

The target architecture is an MCP-style agent with tools over platform surfaces (read
DDL, run twin, query telemetry, run tests, propose diffs), with generation validated
before it reaches a developer.

The first slice is built in `core/assistant` (`@openhome/assistant`): a shell-agnostic,
provider-agnostic agent. It is **bring-your-own-key** — a neutral internal model sits
between the agent loop and three native wire formats (Anthropic Messages, Google Gemini
`generateContent`, and the OpenAI-compatible Chat Completions format, whose configurable
base URL also reaches OpenRouter, Groq, DeepSeek, Mistral, and local servers such as Ollama
and LM Studio). The agent's suggestions are **grounded**: its tools (`read_device`,
`validate_manifest`, `compile_manifest`, `list_templates`, `propose_device`) run over the
real DDL compiler through `@openhome/studio-core`, and `propose_device` refuses to record a
proposal unless the manifest compiles — so a broken suggestion can never surface. Applying a
change is always human-in-the-loop. The first surface is a CLI (`openhome-assist`); the full
loop and every provider adapter are tested with a scripted mock provider and a mocked
`fetch`, so the suite runs in CI with no API keys.

Next for this branch: an in-editor chat panel in the IDE (this core is built to back it),
a manifest-driven twin as a deeper grounding tool, and running the acceptance suites as a
tool. Default the Anthropic adapter to a current Claude model and confirm current API
specifics from the provider docs when revising an adapter.

## Marketplace (branch 13)

The `marketplace` package makes a device shareable: a package bundles the DDL manifest
with any drivers, tests, and documentation that ship alongside it, plus the metadata
needed to find it. Every package has a deterministic content hash; a publisher signs that
hash with an Ed25519 key, reusing the supply-chain trust model of the cloud firmware
signer. The registry refuses to store a malformed package or one whose signature does not
verify, and an installer re-checks the signature, re-validates the manifest through the
device engine, enforces the caller's set of trusted publishers, and rejects any file path
that would escape the target directory before writing anything. The library backs an
`openhome` command line (`publish`, `install`, `search`, `info`, `list`) over either a
local filesystem registry or, with `--registry-url`, a networked registry service: a thin
HTTP layer over the same registry, mirroring how the cloud package grew an HTTP layer over
its in-process core. Installs re-verify a fetched package exactly as a local one, so trust
does not depend on transport.
