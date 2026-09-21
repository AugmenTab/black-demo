# Phase 0.5 development image.
# Not a production compiler or runtime container — just a reproducible
# Node/TypeScript toolchain for developing and demoing the disposable Black/White prototype.

FROM node:22-bookworm-slim

# Small tools that make the container pleasant for interactive dev use.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       bash \
       ca-certificates \
       git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Run as root inside the container. In rootless Docker (the primary dev environment
# here) container-root is transparently remapped to the invoking host user, so
# bind-mounted files stay owned by the developer on the host.
# On rootful Docker, override with `user: "${UID}:${GID}"` in a compose override
# file if root-owned generated files become a problem.

CMD ["bash"]
