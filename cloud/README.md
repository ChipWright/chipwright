# Cloud Infrastructure

Open-source IoT cloud (branch 8, Phase 4): device registry, telemetry ingest, device
shadow, and command dispatch. Built on the Node standard library with no runtime
dependencies.

## What works today

- Device registry (register, list, status, firmware version, last seen)
- Device shadow: the latest reported value per telemetry metric. The sample shape
  (`metric`, `value`, `unit`) matches the SDK's telemetry sink, so firmware and the twin
  forward samples without translation.
- Command queue: enqueue commands for a device, drained when the device polls
- Telemetry ingest that updates the shadow and marks the device online
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

- OTA service (firmware artifact store, signed staged rollout, rollback) and the security
  identity service (branch 9), which share this package
- Durable storage; state is currently in memory
- Authentication of devices and callers
