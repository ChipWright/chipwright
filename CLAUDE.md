# CLAUDE.md — OpenHome Studio

Guidance for Claude (and any AI coding agent) working in this repository. These rules
are binding and override default agent behavior.

## What this project is

OpenHome Studio is an open-source development platform for smart-home and IoT devices.
A single declarative source of truth, the Device Definition Language (DDL), generates
firmware interfaces, cloud APIs, tests, documentation, and certification artifacts.
The north-star test for any feature: does it make creating a smart device feel more
like creating a web application? If not, it is low priority.

Read `docs/ROADMAP.md` before starting non-trivial work. The critical path is
`DDL -> Simulator -> SDK`. Current focus is the Phase 1 MVP: a single device class
(thermostat) compiling end-to-end.

## Commit rules

- Do NOT add a `Co-Authored-By` trailer for Claude, Anthropic, or any AI attribution
  to commits. Commits are authored solely by the human developer.
- Do NOT add "Generated with Claude Code" or similar attribution to commit messages
  or pull request bodies.
- Commit messages describe what changed and why, in the imperative mood.
- Commit or push only when asked. Never mix unrelated changes in one commit.

## Comment rules

- Every comment must be canonical: it states what the code does or why it exists, and
  stays true over time.
- Never write process or status commentary. Banned examples: "implemented fix",
  "will fix this later", "TODO from before", "changed this", "as requested",
  "temporary hack". Genuinely deferred work belongs in a tracked issue, not a comment.
- Prefer no comment over a comment that merely restates the code.

## Code style

- No emojis anywhere in code: not in source, comments, log strings, or identifiers.
- TypeScript is strict. Do not introduce `any` without a written, canonical reason.
- Keep runtime dependencies minimal and justified.
- Match the naming, structure, and idioms of surrounding code.

## Workflow

- Prefer small, reviewable changes that keep the build and tests green.
- Add or update tests alongside behavior changes.
- Run `pnpm -r typecheck` and `pnpm -r test` before considering work done.
