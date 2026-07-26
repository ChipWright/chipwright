# Contributing to OpenHome Studio

OpenHome Studio is developed and maintained as a free service. The core service — the DDL and
its compiler, the generators, the twin, the cloud, the marketplace, the assistant, and the IDE
— is built by the maintainers and is not open for outside feature development.

What we actively invite from the community are the two layers that make the platform broader
for everyone:

- **Silicon — board support.** Bring a new chip to the platform by implementing the Hardware
  Abstraction Layer for it, exactly the way the reference ESP32-C6 support was built. This is
  the contribution we most want, and it is deliberately permissive: the firmware tree
  ([`sdk/firmware/`](sdk/firmware/)) is Apache-2.0. Start with
  **[Adding a board](docs/adding-a-board.md)**.
- **Content — device definitions.** Publish DDL device definitions (with their drivers, tests,
  and docs) through the [marketplace](marketplace/README.md). A definition you write is your
  own content; sharing one does not require changing the platform.

See [LICENSING.md](LICENSING.md) for how the two licenses divide the repository. Contributions
to `sdk/firmware/` are accepted under Apache-2.0.

## Development setup

```sh
pnpm install            # workspace tooling and packages
pnpm -r build           # build every package in dependency order
pnpm -r typecheck
pnpm -r test            # TypeScript test suites
make -C simulator test  # C unit tests for the SDK and twin
make -C tests test      # acceptance suites against the digital twin
```

A C11 compiler (`gcc`/`clang`) and `make` are needed for the firmware and twin. Board work
additionally needs ESP-IDF (or the toolchain for your chip); the twin and host compile checks
run without any hardware.

## What makes a good board contribution

A BSP is accepted when:

- it implements the HAL cleanly for the chip (sensors and actuators as capability drivers),
- it has a **host compile check** so CI can type-check it without the vendor toolchain (see
  `sdk/firmware/bsp/esp32/hostcheck`),
- the shared acceptance suite passes against it on the twin, and against real hardware over
  the serial HIL where applicable (`OPENHOME_HIL_PORT`), and
- it does not change shared SDK behavior; board specifics stay inside the BSP.

The full walkthrough is in **[docs/adding-a-board.md](docs/adding-a-board.md)**.

## Code conventions

- Comments are canonical: they state what the code does or why it exists and stay true over
  time. No status or process commentary.
- No emojis in source, comments, log strings, or identifiers.
- TypeScript is strict; avoid `any`. In C and everywhere else, match the naming, structure, and
  idioms of the surrounding code, and keep runtime dependencies minimal and justified.
- Keep the build and tests green; add or update tests alongside behavior changes.
- Commit messages use the imperative mood and explain the why.

## Submitting

Open a pull request describing the chip, how you tested it (twin and, if you have the board,
HIL), and any wiring notes. By submitting to `sdk/firmware/` you agree to license your
contribution under Apache-2.0. For a larger cross-cutting proposal, copy
[docs/rfcs/0000-template.md](docs/rfcs/0000-template.md) to a new numbered file and open it for
discussion first.
