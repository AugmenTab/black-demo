# scripts

Repository automation. Everything here is a thin shell wrapper around the Phase 0.5 Docker dev environment; no phase should embed non-trivial logic in these scripts.

- `build` — compile the TypeScript sources inside Docker (`npm run build`).
- `test`  — run the full test suite inside Docker (`npm test`).
- `white` — invoke the compiled White CLI against a project directory inside Docker. Every invocation rebuilds the TypeScript sources first so the CLI always reflects the current tree — never a stale `dist/` left over from an earlier run. Usage: `./scripts/white <project-dir> <subcommand> [args…]`.
