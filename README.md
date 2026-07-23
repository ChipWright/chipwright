# OpenHome Studio

An open-source development platform for smart-home and IoT devices — the missing
abstraction layer that lets a developer build a **device capability** instead of
chip-specific firmware. The goal: creating a smart device should feel as approachable
as creating a web application.

## Why

Web development collapsed into clean, reasoned layers (App -> Framework -> OS ->
Hardware). Smart devices did not: firmware, cloud, protocols, mobile apps,
certification, and manufacturing are all separate concerns a single team must juggle.
OpenHome Studio inverts that. A single declarative source of truth — the **Device
Definition Language (DDL)** — becomes the input from which firmware interfaces, cloud
APIs, tests, documentation, and certification checklists are generated.

## Repository layout

| Path                  | Purpose                                             | Status      |
| --------------------- | --------------------------------------------------- | ----------- |
| `core/device-engine`  | DDL compiler and Hardware Abstraction Layer         | In progress |
| `sdk/firmware`        | Device SDK and HAL (lifecycle, telemetry, drivers)  | In progress |
| `simulator`           | Digital-twin engine and fault injection             | Planned     |
| `protocols`           | Matter, Thread, BLE, WiFi, and legacy adapters      | Planned     |
| `cloud`               | Device registry, telemetry, command dispatch, OTA   | Planned     |
| `apps/ide`            | Developer IDE (visual designer, twin debugger)      | Planned     |
| `tests`              | Test framework and hardware-in-the-loop harness     | Planned     |
| `docs`                | Documentation generator, roadmap, and RFCs          | Ongoing     |
| `examples`            | Reference device definitions                         | Ongoing     |

See [docs/ROADMAP.md](docs/ROADMAP.md) for the phased plan.

## Development order

Build one device class end-to-end before widening the platform. The critical path is
`DDL -> Simulator -> SDK`; nothing meaningful ships before the DDL exists.

## Requirements

- Node.js >= 22
- pnpm >= 11

## Getting started

```sh
pnpm install
pnpm --filter @openhome/device-engine build
pnpm --filter @openhome/device-engine test
```

## License

MIT. See [LICENSE](LICENSE).
