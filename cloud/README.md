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
POST /devices                  register a device
GET  /devices                  list devices
GET  /devices/:id              fetch a device record
POST /devices/:id/telemetry    ingest telemetry samples
GET  /devices/:id/shadow       fetch the device shadow
POST /devices/:id/commands     queue a command
GET  /devices/:id/commands     drain queued commands
```

## Running

```sh
pnpm --filter @openhome/cloud test
PORT=8080 pnpm --filter @openhome/cloud serve
```

## Not yet implemented

- HTTP endpoints for identity, firmware publishing, and OTA campaigns (currently a
  library API with tests)
- Secure boot enforcement on the device side (needs hardware)
- Durable storage; state is currently in memory
- Authentication of the HTTP callers themselves
