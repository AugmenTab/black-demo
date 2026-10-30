# syntax=docker/dockerfile:1.7
# Experiment capsule image. Built by experiment/bin/build with
# .local/build/ as the build context (it holds white-src.tar, a `git archive`
# of the pinned White commit, and a copy of experiment/capsule/).

ARG NODE_BASE_IMAGE=node:22-bookworm-slim

# ---------------------------------------------------------------------------
# Stage 1: build White from the pinned commit and sanitize the output.
# Nothing from this stage reaches the final image except /out.
# ---------------------------------------------------------------------------
FROM ${NODE_BASE_IMAGE} AS white-build
ARG ESBUILD_VERSION
WORKDIR /src
ADD white-src.tar /src/
RUN npm ci --no-audit --no-fund
RUN npx tsc -p tsconfig.json --sourceMap false
# Re-emit every compiled module without comments, keeping the file layout so
# White's relative paths still resolve. Compiler/CLI modules are
# whitespace-minified (which removes all comments); the platform runtime
# modules, which White copies verbatim into every user build, stay readable
# and are covered by the scan below.
RUN npx -y esbuild@${ESBUILD_VERSION} $(find dist/src -name '*.js' -not -path 'dist/src/runtime/*') \
      --outbase=dist/src --outdir=/out/dist/src \
      --format=esm --platform=node --legal-comments=none --minify-whitespace --log-level=warning \
 && npx -y esbuild@${ESBUILD_VERSION} $(find dist/src/runtime -name '*.js') \
      --outbase=dist/src --outdir=/out/dist/src \
      --format=esm --platform=node --legal-comments=none --log-level=warning
RUN mkdir -p /out/std \
 && cp -R std/Platform /out/std/Platform \
 && node -e ' \
      const pkg = require("./package.json"); \
      const lock = require("./package-lock.json"); \
      const dep = "smol-toml"; \
      const ver = lock.packages["node_modules/" + dep].version; \
      require("fs").writeFileSync("/out/package.json", JSON.stringify({ \
        name: "white", version: pkg.version, private: true, type: "module", \
        dependencies: { [dep]: ver } }, null, 2) + "\n");' \
 && cd /out && npm install --omit=dev --no-audit --no-fund --no-package-lock \
 && rm -rf /root/.npm
# Fail the build if anything that is not runtime output slipped through.
RUN offenders="$(find /out -path /out/node_modules -prune -o \( -name '*.map' -o -name '*.ts' -o -type d -name test -o -type d -name reference -o -type d -name examples \) -print)"; \
    if [ -n "$offenders" ]; then echo "unexpected files: $offenders"; exit 1; fi; \
    if grep -rnoE '.{0,60}(phase-0[0-9]|\.md §).{0,60}' /out/dist /out/std; then echo "design-doc references remain"; exit 1; fi

# ---------------------------------------------------------------------------
# Stage 2: the capsule.
# ---------------------------------------------------------------------------
FROM ${NODE_BASE_IMAGE}
ARG CLAUDE_CODE_VERSION
ARG RAILWAY_CLI_VERSION
ARG PLAYWRIGHT_MCP_VERSION

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl git iptables iproute2 procps util-linux tmux ncurses-term \
      fonts-dejavu-core fonts-liberation fonts-noto-color-emoji \
 && rm -rf /var/lib/apt/lists/* \
 && userdel -r node

RUN npm install -g --no-audit --no-fund \
      @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} \
      @railway/cli@${RAILWAY_CLI_VERSION} \
      @playwright/mcp@${PLAYWRIGHT_MCP_VERSION} \
 && rm -rf /root/.npm

ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
RUN node /usr/local/lib/node_modules/@playwright/mcp/node_modules/playwright/cli.js install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/* \
 && chmod -R a+rX /opt/ms-playwright \
 && ln -s "$(find /opt/ms-playwright -path '*chrome-linux*/chrome' -type f | head -n 1)" /usr/local/bin/chromium

COPY --from=white-build /out /opt/white
COPY capsule/white-wrapper.sh /usr/local/bin/white
COPY capsule/ /opt/experiment/
RUN chmod 0755 /usr/local/bin/white /opt/experiment/*.sh \
 && chmod -R a+rX,go-w /opt/experiment /opt/white \
 && printf '[user]\n\tname = Experiment Agent\n\temail = agent@experiment.invalid\n[init]\n\tdefaultBranch = main\n[safe]\n\tdirectory = *\n' > /etc/gitconfig

WORKDIR /workspace
ENTRYPOINT ["/opt/experiment/entrypoint.sh"]
CMD ["agent"]
