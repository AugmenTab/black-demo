# black-demo

Disposable vertical-slice implementation of the Black language and White toolchain, built to support a single experiment: a coding agent with no prior Black knowledge implements N-Player Polygon Pong in ~60 minutes using only White.

**This is not the production Black compiler.** See [`docs/DEMO_PROFILE.md`](docs/DEMO_PROFILE.md) for the authoritative contract: what the demo compiler accepts, what it intentionally omits, what platform runtime is provided, and what this project is forbidden from turning into.

Phase status: **Phase 1 (walking skeleton)** complete. White CLI, project discovery, placeholder compiler, and end-to-end `check/build/run` pipeline are in place. Black syntax is **not** parsed or compiled yet — that lands in Phase 2.

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

Every White command supports `--json` for machine-readable output.

## Repository layout

```text
src/
  white/            CLI, project discovery, config, output/diagnostics, commands
  compiler/         Placeholder compiler boundary (Phase 2 replaces this)
  runtime/          Reserved for Platform.* runtime modules
std/                Reserved for the bundled prototype Prelude/std
examples/
  hello/            Minimal fixture project used by the smoke test
reference/          Reserved for reference Polygon Pong (kept hidden from blind agents)
test/
  cli/              CLI dispatch, --help, --json
  project/          Discovery + config unit tests
  integration/      End-to-end pipeline against examples/hello
  helpers/          Test-only helpers
docs/               DEMO_PROFILE.md (Phase 0 authority)
scripts/            Repository automation
```

## Phase 1 limitations

- No Black lexer, parser, AST, or typechecker.
- `white check` validates project infrastructure only.
- `white build` runs a placeholder compiler that reads the `.blk` entry but ignores its contents; it emits a hard-coded ES module printing `Black preview pipeline alive.`
- `white docs`, `white query`, and `white test` are deliberate placeholders reporting `not_yet_implemented`.
- `white capabilities` truthfully reports the walking-skeleton stage.
