# Uplink telemetry receiver (Fly.io)

Runs Tesla's official `fleet-telemetry` server (image `tesla/fleet-telemetry:v0.9.5`) under a small Bun
worker (`worker.ts`). The server terminates mTLS itself and logs decoded records; the worker reads
those lines and batches rows into Supabase `telemetry_readings` every ~10 s.

- App `uplink-telemetry`, region `sin`, one always-on `shared-cpu-1x` machine.
- Fly maps external 443 to internal 8443 over raw TCP (no handlers), so the TLS handshake and the
  car's client certificate reach the server untouched.
- Cars are verified against Tesla's CA, which is embedded in the server. Our own CA only exists so the
  car can verify us: it is sent to the car in the streaming config (`ca`).

## 1. Certificates (once)

Keep `ca.key` offline (not on Fly, not in the repo). Do this in a scratch folder.

```sh
mkdir telemetry-certs && cd telemetry-certs

# CA, EC P-256, 10 years
openssl ecparam -name prime256v1 -genkey -noout -out ca.key
openssl req -x509 -new -key ca.key -sha256 -days 3650 -subj "/CN=Uplink Telemetry CA" -out ca.crt

# Server key + CSR for telemetry.getuplink.in
openssl ecparam -name prime256v1 -genkey -noout -out server.key
openssl req -new -key server.key -subj "/CN=telemetry.getuplink.in" -out server.csr

# Sign it, 1 year
cat > server.ext <<'EOF'
subjectAltName = DNS:telemetry.getuplink.in
basicConstraints = CA:FALSE
keyUsage = digitalSignature
extendedKeyUsage = serverAuth
EOF
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -sha256 -days 365 -extfile server.ext -out server.crt

openssl verify -CAfile ca.crt server.crt
```

## 2. DNS and IP

Raw TCP needs a dedicated IPv4:

```sh
~/.fly/bin/flyctl apps create uplink-telemetry --org personal   # skip if it exists
~/.fly/bin/flyctl ips allocate-v4 -a uplink-telemetry
~/.fly/bin/flyctl ips allocate-v6 -a uplink-telemetry
~/.fly/bin/flyctl ips list -a uplink-telemetry
```

Add `A` (and `AAAA`) records for `telemetry.getuplink.in` pointing at those addresses. DNS only, no proxy.

## 3. Secrets

```sh
cd /path/to/repo/fly/telemetry
~/.fly/bin/flyctl secrets set -a uplink-telemetry \
  TLS_SERVER_CERT="$(cat /path/to/telemetry-certs/server.crt)" \
  TLS_SERVER_KEY="$(cat /path/to/telemetry-certs/server.key)" \
  SUPABASE_URL="https://fhoqjkriyqwoblfaahpk.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="<service role key>"
```

Apply the `supabase/migrations/*_telemetry.sql` migration before the first car connects.

## 4. Deploy

```sh
cd fly/telemetry
~/.fly/bin/flyctl deploy
```

## 5. Check it

```sh
~/.fly/bin/flyctl logs -a uplink-telemetry
~/.fly/bin/flyctl status -a uplink-telemetry
# TLS is up (expect a handshake with our cert; the car-side mTLS check will fail without a client cert):
openssl s_client -connect telemetry.getuplink.in:443 -servername telemetry.getuplink.in -CAfile ca.crt </dev/null
```

The worker prints `stats ...` every 10 s while records flow: lines, rows accepted/written/dropped, bad
lines, buffered rows, vehicle count. Payloads are never logged and VINs show as last 4 characters.

## 6. Point the car at it

See `scripts/telemetry-config.mjs` (dry run by default, `--send`, `--status`, `--errors`).

## Rotating the server cert

Reissue a leaf from the same CA (step 1, server part, then `openssl verify`) and set the two secrets
again; Fly restarts the machine:

```sh
~/.fly/bin/flyctl secrets set -a uplink-telemetry \
  TLS_SERVER_CERT="$(cat server.crt)" TLS_SERVER_KEY="$(cat server.key)"
```

Cars keep trusting the CA, so no config push is needed while the CA stays the same. Replacing the CA
itself means pushing the streaming config again with the new `ca`. Renew the leaf before the 365 days
are up.
