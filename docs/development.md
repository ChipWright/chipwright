# Development

The monorepo is a pnpm workspace. TypeScript packages build in dependency order; the C
components build with `make`.

## Repository layout

| Path | What it is | License |
| ---- | ---------- | ------- |
| `core/device-engine` | Definition compiler, IR, and code generators | Elastic-2.0 |
| `core/studio` | Shell-agnostic IDE core: validate, generate, drive the twin | Elastic-2.0 |
| `core/assistant` | Provider-agnostic AI assistant | Elastic-2.0 |
| `core/conformance` | Device-class conformance engine and Matter device-type mapping | Elastic-2.0 |
| `sdk/firmware` | Device SDK, HAL, native BSP, ESP32-C6 targets (telemetry, Matter, OTA) | **Apache-2.0** |
| `simulator` | Digital-twin engine and fault injection | Elastic-2.0 |
| `protocols` | Matter commissioning and transport simulation | Elastic-2.0 |
| `cloud` | Registry, telemetry, shadow, commands, identity, signing, OTA | Elastic-2.0 |
| `marketplace` | Signed device-package registry, CLI, and HTTP service | Elastic-2.0 |
| `apps/ide` | Developer IDE, delivered as a VS Code extension | Elastic-2.0 |
| `tests` | Acceptance framework and hardware-in-the-loop harness | Elastic-2.0 |
| `examples` | Reference device definitions (`thermostat`, `smart_plug`) | Elastic-2.0 |

## Building and testing

```sh
pnpm install
pnpm -r build                      # build every TypeScript package in dependency order
pnpm -r typecheck                  # strict type check
pnpm -r test                       # TypeScript: device engine, cloud, IDE core, marketplace, assistant
make -C sdk/firmware/tests run     # SDK and HAL unit tests
make -C simulator/tests run        # twin runtime unit tests
make -C protocols/tests run        # transport and Matter unit tests
make -C tests test                 # end-to-end acceptance suites
```

CI runs all of the above on every push and pull request, plus the ESP32 BSP host-compile check
and the twin smoke test. See [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the contribution model and setup, and
[adding a board](adding-a-board.md) to bring a new chip to the silicon layer.
