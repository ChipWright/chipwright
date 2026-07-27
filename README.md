# Chipwright

[![CI](https://github.com/ChipWright/chipwright/actions/workflows/ci.yml/badge.svg)](https://github.com/ChipWright/chipwright/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Elastic--2.0%20%2B%20Apache--2.0-blue.svg)](LICENSING.md)

**Build a production smart device from a single definition, and it's free.**

Describe your device once, in plain terms: what it senses, what it controls, how it connects,
how it is powered and secured. Chipwright gives you the firmware interface, the cloud API,
the tests, and the documentation, runs it as a live digital twin before you own any hardware,
delivers signed over-the-air updates to the real chip, and packages it so others can install
it. Building a smart device should feel as approachable as building a web app.

```yaml
device:
  name: smart_thermostat
  category: thermostat
capabilities:
  temperature_sensor: { type: sensor, unit: celsius, range: { min: -20, max: 50 } }
  hvac:               { type: actuator, modes: [heating, cooling, off] }
connectivity: { protocols: [matter, thread, bluetooth] }
```

That one file becomes a C firmware interface, an OpenAPI cloud contract, a runnable acceptance
suite, reference docs and a docs site, a Matter device, and a signed shareable package. They
stay in lockstep because they are generated, never authored separately.

## What you can do

- **Turn one definition into everything.** Validate a device manifest and generate a firmware
  interface header, an OpenAPI cloud contract, a target-agnostic acceptance suite, Markdown
  docs, and a self-contained static docs site. Change the definition and they all change with
  it.
- **Develop before you have hardware.** Run the device as a digital twin that executes the real
  SDK build, with sensor, network, and power fault injection.
- **Design and debug visually.** A VS Code extension with a device designer and a live twin
  debugger (telemetry chart, fault controls).
- **Work with an AI assistant.** A bring-your-own-key agent that proposes device edits, each
  checked against the real compiler before you see it. Anthropic, Gemini, any OpenAI-compatible
  endpoint, or a local model, from the CLI or an in-editor chat panel.
- **Operate a fleet.** A cloud service for device registry, telemetry, device shadow, command
  dispatch, per-device identity and certificates, firmware signing, and staged rollouts.
- **Ship signed updates over the air**, with automatic rollback if a build fails to boot, and
  **share devices** through a marketplace of signed packages that are verified on install.
- **Run on a real chip, twin-first.** The same acceptance suite runs against the twin and a
  physical ESP32-C6 unchanged, and the device commissions onto a real Matter fabric.

## Get started

Requirements: **Node.js >= 22**, **pnpm >= 11** (`corepack enable`), and a **C toolchain**
(`make` plus `gcc` or `clang`; Xcode Command Line Tools on macOS, `build-essential` on
Debian/Ubuntu).

```sh
git clone https://github.com/ChipWright/chipwright.git
cd chipwright
pnpm install
pnpm -r build        # build every package
pnpm -r test         # run the TypeScript test suites
```

Then take a device from definition to running twin in three commands (run from the repo root):

```sh
# 1. Validate the reference device
node core/device-engine/dist/cli.js validate examples/thermostat/device.yaml

# 2. Generate firmware, cloud API, tests, and docs from it
node core/device-engine/dist/cli.js compile examples/thermostat/device.yaml --out build/generated

# 3. Run it as a live digital twin with a stuck-sensor fault injected
make -C simulator/examples/twin_studio
./simulator/examples/twin_studio/build/twin_studio --ticks 10 --interval-ms 200 --fault stuck --fault-at 5
```

Prefer to work visually? Install the **Chipwright** VS Code extension for a device designer and
live twin debugger. The AI assistant can also draft device edits for you from a prompt.

The full walkthrough, including the cloud, over-the-air updates, the marketplace, and the AI
assistant, is in the [guided tour](docs/guided-tour.md).

## Documentation

- [Guided tour](docs/guided-tour.md) - the whole platform, definition to signed package.
- [Run it on real hardware](docs/hardware.md) - ESP32-C6 telemetry, HIL testing, Matter, OTA.
- [Architecture](docs/architecture.md) - the three layers and how they fit together.
- [Development](docs/development.md) - repository layout, building, and testing.
- [Adding a board](docs/adding-a-board.md) - bring a new chip to the silicon layer.
- Component guides: [IDE](apps/ide/README.md), [AI assistant](core/assistant/README.md),
  [cloud](cloud/README.md), [marketplace](marketplace/README.md).
- [Roadmap](docs/ROADMAP.md) and [contributing](CONTRIBUTING.md).

## Extend it with your hardware

The reference ESP32-C6 support was built the same way anyone can add a chip: implement the
Hardware Abstraction Layer for it. The firmware tree is Apache-2.0 precisely so board support
can be contributed, shipped, and relicensed without friction. Start with
[docs/adding-a-board.md](docs/adding-a-board.md). Publishing device definitions through the
[marketplace](marketplace/README.md) is the other way to contribute, as content, without
changing the platform.

## Licensing

Chipwright is **free to use**, split across two licenses along a deliberate line: the service
(everything except `sdk/firmware/`) is under the [Elastic License 2.0](LICENSE) (use, modify,
and self-host freely; do not offer it to others as a hosted service), and the hardware layer
([`sdk/firmware/`](sdk/firmware/)) is under [Apache-2.0](sdk/firmware/LICENSE) so board support
can be contributed and shipped freely. Your device definitions are your own content. Full
details in [LICENSING.md](LICENSING.md).

## Author

Chipwright is created and maintained by **[Diego Regalado](https://github.com/Diegoregalado0)**.
