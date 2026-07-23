# Contributing to OpenHome Studio

## Ground rules

- Build one thing well. Follow the phased plan in [docs/ROADMAP.md](docs/ROADMAP.md)
  rather than starting work on a later phase.
- Keep changes small and reviewable, with tests alongside behavior.
- Every feature should serve the north-star test: does it make creating a smart
  device feel more like creating a web application?

## Proposing larger changes

Significant or cross-cutting changes go through an RFC. Copy
[docs/rfcs/0000-template.md](docs/rfcs/0000-template.md) to a new numbered file and
open a pull request for discussion before implementation.

## Local development

```sh
pnpm install
pnpm -r typecheck
pnpm -r test
```

## Code conventions

- TypeScript strict mode; avoid `any`.
- Comments state what code does or why, and stay true over time. No status or process
  commentary in comments.
- No emojis in code.
- Commit messages use the imperative mood and explain the why.
