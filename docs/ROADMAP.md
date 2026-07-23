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
5. **Author** — Developer IDE (visual designer, twin debugger), documentation generator.
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
10. Developer IDE — Phase 5
11. AI Development Assistant — Phase 6
12. Manufacturing Pipeline — Phase 6
13. Marketplace / Community — Phase 6
14. Documentation Generator — Phase 5
15. Governance and Architecture — Phase 1, ongoing

## Current status

Phase 1 in progress. First deliverable: the DDL compiler in `core/device-engine`,
validating and compiling the reference thermostat manifest into a firmware interface
and documentation.

## AI Development Assistant (branch 11)

The target architecture is an MCP-style agent with tools over platform surfaces (read
DDL, run twin, query telemetry, run tests, propose diffs), with generation validated in
a sandboxed twin before it reaches a developer. This is a Phase 6 concern and is
intentionally out of scope for the MVP.
