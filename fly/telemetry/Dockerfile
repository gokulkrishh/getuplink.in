# Tesla's official server (distroless, glibc) copied next to a small Bun worker that supervises it.
FROM tesla/fleet-telemetry:v0.9.5 AS tesla

FROM oven/bun:1-debian
RUN apt-get update \
  && apt-get install -y --no-install-recommends libstdc++6 ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=tesla /fleet-telemetry /usr/local/bin/fleet-telemetry
# Fail the build if the copied binary needs a shared library this image lacks.
RUN ldd /usr/local/bin/fleet-telemetry && ! ldd /usr/local/bin/fleet-telemetry | grep -q 'not found'
WORKDIR /app
COPY config.json worker.ts split.ts ./
USER bun
# Listens on 8443 (unprivileged); fly.toml maps external 443 -> 8443 over raw TCP.
EXPOSE 8443
CMD ["bun", "run", "worker.ts"]
