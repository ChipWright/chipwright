# Cloud Infrastructure

Open-source IoT cloud (branches 8 and 9, Phase 4): device registry, telemetry ingest,
device shadow, command dispatch, device identity, firmware signing, and staged OTA with
rollback. Built on the Node standard library with no runtime dependencies (real Ed25519
keys, signatures, and SHA-256 come from `node:crypto`).

## What works today

- Device registry (register, list, status, firmware version, last seen)
- Device shadow: the latest reported value per telemetry metric. The sample shape
  (`metric`, `value`, `unit`) matches the SDK's telemetry sink, so firmware and the twin
  forward samples without translation.
- Command queue: enqueue commands for a device, drained when the device polls
- Telemetry ingest that updates the shadow and marks the device online
- Device identity: a certificate authority issues each device an Ed25519 key pair and a
  signed certificate binding its id to its public key
- Firmware signing: signed build manifests over an artifact hash, verified for both
  integrity and authenticity before a device applies them
- OTA: a firmware store that only accepts verified signed builds, and a staged rollout
  campaign that advances in batches and rolls back to the previous version on failure
- A thin HTTP API over the standard library

## HTTP API

```
GET  /ca                            fetch the CA public key
POST /provision                     register a device and issue it a signed identity
POST /devices                       register a device
GET  /devices                       list devices
GET  /devices/:id                   fetch a device record
POST /devices/:id/telemetry         ingest telemetry samples
GET  /devices/:id/shadow            fetch the device shadow
POST /devices/:id/commands          queue a command
GET  /devices/:id/commands          drain queued commands
POST /firmware                      publish a signed build (verified before it is stored)
GET  /firmware/:deviceType/latest   fetch the newest build manifest for a device type
GET  /firmware/:deviceType/:version fetch a build manifest
GET  /firmware/:deviceType/:version/artifact  download the raw firmware bytes for OTA
POST /rollouts                      create a staged rollout campaign
GET  /rollouts/:id                  fetch rollout status
POST /rollouts/:id/next-batch       offer the next batch the update
POST /rollouts/:id/report           report a device outcome (applied or failed)
```

Firmware endpoints require a signing trust anchor, passed as the second argument to
`CloudService`. Without one, publishing reports that the trust anchor is not configured.

## Authentication and TLS

Routes fall into three scopes:

- **Public**: `GET /ca` needs no token.
- **Device**: telemetry ingest, command drain, and firmware download. Accepts the device
  token or the admin token.
- **Admin**: everything else, including registration, provisioning, sending commands,
  publishing firmware, and rollouts. Requires the admin token.

Configure tokens and TLS through the environment when serving:

```sh
OPENHOME_ADMIN_TOKEN=... OPENHOME_DEVICE_TOKEN=... \
OPENHOME_TLS_CERT=/path/fullchain.pem OPENHOME_TLS_KEY=/path/key.pem \
PORT=8443 pnpm --filter @openhome/cloud serve
```

Callers present the token as `Authorization: Bearer <token>`. Tokens are compared in
constant time. When a scope has no token configured it runs open, which keeps local
development frictionless; the server warns at startup if the admin token is unset. When a
TLS certificate and key are both provided the server listens over HTTPS, so OTA artifacts
and provisioning secrets travel encrypted in production. `createCloudServer(service,
options)` accepts the same `adminToken`, `deviceToken`, and `tls` fields directly.

## Running

```sh
pnpm --filter @openhome/cloud test
PORT=8080 pnpm --filter @openhome/cloud serve
```

State persists to a JSON file (`OPENHOME_CLOUD_STATE`, default
`~/.openhome/cloud-state.json`) so the server resumes across restarts: the device
registry, shadows, and command queue, plus the CA trust root and issued certificates,
published firmware with its artifact bytes, and in-flight rollout campaigns. Persisted
firmware is re-verified on load, so a tampered state file cannot inject an unsigned build.

## Not yet implemented

- Secure boot enforcement on the device side (needs hardware)
- Per-caller identities and revocation; tokens are currently shared secrets
