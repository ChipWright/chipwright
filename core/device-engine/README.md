# @openhome/device-engine

The Device Definition Language (DDL) compiler and the Hardware Abstraction Layer — the
foundation of OpenHome Studio (branches 1 and 2, Phase 1).

A device manifest is the single source of truth. The compiler validates it and runs
generator backends that emit downstream artifacts (firmware interfaces, documentation,
and, later, cloud APIs, tests, and certification checklists).

## Usage

```sh
pnpm --filter @openhome/device-engine build

# Validate a manifest
node dist/cli.js validate ../../examples/thermostat/device.yaml

# Compile a manifest into generated artifacts
node dist/cli.js compile ../../examples/thermostat/device.yaml --out ./out
```

During development you can run the CLI without building:

```sh
pnpm --filter @openhome/device-engine openhome -- validate ../../examples/thermostat/device.yaml
```

## Layout

- `src/schema.ts` — manifest types and the normalized intermediate representation (IR)
- `src/validate.ts` — manifest validation with structured diagnostics
- `src/parse.ts` — load a manifest file into a validated IR
- `src/generators/` — generator backends (firmware interface, documentation)
- `src/cli.ts` — command-line entry point
