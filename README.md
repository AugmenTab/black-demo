# black-demo

Disposable vertical-slice implementation of the Black language and White toolchain, built to support a single experiment: a coding agent with no prior Black knowledge implements N-Player Polygon Pong in ~60 minutes using only White.

**This is not the production Black compiler.** See [`docs/DEMO_PROFILE.md`](docs/DEMO_PROFILE.md) for the authoritative contract: what the demo compiler accepts, what it intentionally omits, what platform runtime is provided, and what this project is forbidden from turning into.

Phase status: Phase 0 (demo contract) complete. Phase 0.5 (Docker development environment) complete. Phase 1 (implementation) not started.

---

## Development environment (Phase 0.5)

The reproducible dev environment is a small Docker image running Node 22. Once Phase 1 lands, the same container will run its `npm` scripts unchanged.

```bash
# Build the dev image.
docker compose build

# Open an interactive shell inside the container.
docker compose run --rm dev bash

# Sanity-check the toolchain.
docker compose run --rm dev node --version
docker compose run --rm dev npm --version
```

Generated files land on the host as your normal user because the container runs under Docker's rootless userns mapping. If you're on rootful Docker and generated files come back root-owned, add a `docker-compose.override.yml` that sets `user: "${UID}:${GID}"` on the `dev` service.
