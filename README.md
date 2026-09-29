# black-demo

Disposable vertical-slice implementation of the Black language and White toolchain, built to support a single experiment: a coding agent with no prior Black knowledge implements N-Player Polygon Pong in ~60 minutes using only White.

**This is not the production Black compiler.** See [`docs/DEMO_PROFILE.md`](docs/DEMO_PROFILE.md) for the authoritative contract: what the demo compiler accepts, what it intentionally omits, what platform runtime is provided, and what this project is forbidden from turning into.

## Phase status

| Phase | Scope                                         | Status                                   |
| ----- | --------------------------------------------- | ---------------------------------------- |
| 0     | Demo contract                                 | complete                                 |
| 0.5   | Dockerised dev environment                    | complete                                 |
| 1     | White walking skeleton                        | complete                                 |
| 2     | Black lexer + parser                          | complete                                 |
| 3     | Module graph + name resolution                | complete                                 |
| 4     | Typechecker                                   | complete                                 |
| 5     | Real Black-to-JavaScript backend              | not yet implemented                      |

`white build` still emits a fixed placeholder ES module — genuine Black-to-JavaScript emission lands in Phase 5.

---

## Development environment (Phase 0.5)

The reproducible dev environment is a small Docker image running Node 22. It wraps the same `package.json` scripts that would run on a bare host — there is no Docker-specific build logic.

```bash
# Build the dev image.
docker compose build

# Install dependencies.
docker compose run --rm dev npm ci

# Build the TypeScript sources.
docker compose run --rm dev npm run build

# Run the full test suite.
docker compose run --rm dev npm test

# Open an interactive shell inside the container.
docker compose run --rm dev bash
```

Generated files (`node_modules/`, `dist/`, `package-lock.json`) land on the host as your normal user because the container runs under Docker's rootless userns mapping. If you're on rootful Docker and generated files come back root-owned, add a `docker-compose.override.yml` that sets `user: "${UID}:${GID}"` on the `dev` service.

## Running White

Once dependencies are installed and the sources are built, invoke `white` from an example project:

```bash
docker compose run --rm --workdir /workspace/examples/hello dev \
  npm exec --prefix /workspace -- white --help

docker compose run --rm --workdir /workspace/examples/hello dev \
  npm exec --prefix /workspace -- white check

docker compose run --rm --workdir /workspace/examples/hello dev \
  npm exec --prefix /workspace -- white run
# → Black preview pipeline alive.
```

For quick one-off invocations, `./scripts/white <project> <subcommand> [args…]` wraps the containerised CLI:

```bash
./scripts/white examples/hello check
./scripts/white examples/hello check --json
./scripts/white examples/multi-module check
```

Every White command supports `--json` for machine-readable output.

## Repository layout

```text
src/
  white/            CLI, project discovery, config, output/diagnostics, commands
  compiler/         Black lexer, parser, module graph + name resolver
                    (typechecker and real backend not yet implemented)
  runtime/          Reserved for Platform.* runtime modules (Phase 5)
std/                Reserved for the bundled prototype Prelude/std (Phase 5)
examples/
  hello/            Minimal fixture project used by the smoke test
  multi-module/     Multi-module fixture covering imports + qualification
reference/          Reserved for reference Polygon Pong (kept hidden from blind agents)
test/
  cli/              CLI dispatch, --help, --version, --json
  project/          Discovery + config unit tests
  compiler/         Lexer, parser, resolver contract tests
  integration/      End-to-end pipeline against example projects
  helpers/          Test-only helpers
docs/               DEMO_PROFILE.md (Phase 0 authority)
scripts/            Repository automation
```

## Current limitations

- The typechecker covers the preview subset only (Hindley–Milner inference, records, closed variants, exhaustiveness); no effects, classes, or open rows.
- `white build` runs a placeholder backend that emits a hard-coded ES module printing `Black preview pipeline alive.` — real Black-to-JavaScript emission belongs to Phase 5.
- `white docs`, `white query`, and `white test` are deliberate placeholders reporting `not_yet_implemented`.
- `white capabilities` truthfully reports the current `phase-4-typechecking` stage.
