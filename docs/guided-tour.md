# Guided tour

A walkthrough of the whole platform, from a device definition to a signed package. Run
`pnpm -r build` at least once first. All commands are run from the repository root.

For the quick version (describe, generate, twin, IDE), see the "Using Chipwright" section of
the [README](../README.md).

## 1. Describe a device

A device is a single YAML manifest. See the full reference in
[`examples/thermostat/device.yaml`](../examples/thermostat/device.yaml). Validate it any time:

```sh
node core/device-engine/dist/cli.js validate examples/thermostat/device.yaml
```

## 2. Generate everything from it

```sh
node core/device-engine/dist/cli.js compile examples/thermostat/device.yaml --out build/generated
```

From that one manifest you get, under `build/generated`:

```
firmware/smart_thermostat_interface.h        # firmware interface (C header)
cloud/smart_thermostat.openapi.json          # cloud API contract (OpenAPI)
tests/smart_thermostat_generated.c           # target-agnostic acceptance tests
docs/smart_thermostat.md                     # reference documentation
docs/site/smart_thermostat/index.html        # self-contained static docs site
```

Change the manifest and re-run: every output changes with it.

## 3. Run it as a digital twin

The twin runs the actual SDK build as a simulated device and streams telemetry as
newline-delimited JSON, with fault injection so you can see how it behaves when a sensor
sticks, fails, or drifts:

```sh
make -C simulator/examples/twin_studio
./simulator/examples/twin_studio/build/twin_studio \
  --ticks 10 --interval-ms 200 --fault stuck --fault-at 5
```

## 4. Design and debug in the IDE

The developer IDE is a VS Code extension: a visual designer that reads and writes the device
definition, and a live twin debugger with a telemetry chart and fault controls.

1. Open this repository in VS Code.
2. Create `.vscode/launch.json` (intentionally not committed, so each person points it at their
   own checkout):

   ```json
   {
     "version": "0.2.0",
     "configurations": [
       {
         "name": "Run Chipwright",
         "type": "extensionHost",
         "request": "launch",
         "args": [
           "--extensionDevelopmentPath=${workspaceFolder}/apps/ide",
           "${workspaceFolder}"
         ]
       }
     ]
   }
   ```

3. Press **F5**, then open the **Chipwright** view in the activity bar to design a device
   and debug its twin.

## 5. Operate a fleet with the cloud

```sh
PORT=8080 pnpm --filter @chipwright/cloud serve
```

A dependency-free registry, telemetry shadow, command queue, identity authority, firmware
signer, and staged-rollout controller over a small HTTP API. See
[`cloud/README.md`](../cloud/README.md) for the routes.

## 6. Ship a signed update to a device

The cloud signs firmware; the device verifies and applies it, and rolls back a bad image
automatically. Establish a signing identity, publish a build, and the device self-updates:

```sh
pnpm --filter @chipwright/cloud firmware keygen ~/.chipwright/firmware-signing.key
pnpm --filter @chipwright/cloud firmware publish ~/.chipwright/firmware-signing.key \
  smart_thermostat 1.0.1 path/to/firmware.bin http://<host-ip>:8091
```

The on-device flow (verification, partition switch, rollback) lives in
[`sdk/firmware/targets/esp32c6-ota`](../sdk/firmware/targets/esp32c6-ota).

## 7. Share it through the marketplace

The marketplace is the app store for device definitions. A package bundles the manifest with
its drivers, tests, and docs, is signed by its publisher, and is re-verified on install:

```sh
node marketplace/dist/cli.js publish /path/to/mydev
node marketplace/dist/cli.js search hvac
node marketplace/dist/cli.js install my.thermostat --dir /tmp/installed
```

Installing re-verifies the signature and re-validates the manifest before writing a single
file, so trust never depends on the transport. See [`marketplace/README.md`](../marketplace/README.md).

## 8. Work with the AI assistant

Bring your own key. Proposals are grounded, checked against the real compiler before you see
them, and applying one is an explicit step:

```sh
export CHIPWRIGHT_LLM_PROVIDER=anthropic       # or gemini, or openai-compatible
export CHIPWRIGHT_LLM_API_KEY=sk-...
node core/assistant/dist/cli.js ask \
  "add a humidity sensor and make it battery powered" \
  --device examples/thermostat/device.yaml
# review the printed diff, then re-run with --apply to write it
```

Point the OpenAI-compatible provider at a local model (such as Ollama) for a fully keyless
setup. The same assistant runs inside the IDE as a chat panel. Your prompt and manifest are
sent only to the endpoint you configure. See [`core/assistant/README.md`](../core/assistant/README.md).
