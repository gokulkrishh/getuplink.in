#!/usr/bin/env bash
# Local HTTPS for getuplink.localhost, app.getuplink.localhost and status.getuplink.localhost (plus plain
# localhost, Tesla's local redirect URI). Makes a certificate your browser trusts with mkcert, once; then
# `bun run dev:https` serves https://app.getuplink.localhost:3000.
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v mkcert >/dev/null; then
  echo "Needs mkcert: brew install mkcert, then run this again." >&2
  exit 1
fi
mkcert -install
mkdir -p certificates
mkcert -key-file certificates/getuplink.localhost-key.pem -cert-file certificates/getuplink.localhost.pem \
  getuplink.localhost app.getuplink.localhost status.getuplink.localhost localhost 127.0.0.1 ::1
echo "Done. Start with: bun run dev:https"
