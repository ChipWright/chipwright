# @openhome/conformance

The conformance engine judges whether a device definition is a valid instance of the device
**class** it claims to be, and maps that class to its Matter device type. A capability is a
composable primitive; a class is a validated bundle of capabilities plus a mapping to a standard
the outside world recognizes. Conformance is what turns "I described a device" into "controllers
and ecosystems will recognize it as a thermostat."

This is conformance (the interop engineering), not certification (the CSA logo process).

## What it checks

Given a device (a manifest or a parsed IR) and a class profile:

- **Required clusters, from the standard.** The device type's server clusters come from the
  Matter Device Library (see below), not from hand-authored guesses. Every mandatory application
  cluster must be provided by a capability; infrastructure clusters (Identify, Groups, Descriptor,
  Binding) are satisfied by the platform; optional clusters are recorded but not required.
- **Attribute mapping.** Under the one-device-type-per-endpoint model, a capability can fill an
  attribute of a cluster rather than adding a cluster. A thermostat's temperature reading maps to
  the Thermostat cluster's `LocalTemperature` attribute.
- **Semantic constraints.** Class-specific rules the spec does not encode (for a thermostat: the
  hvac actuator must support an `off` mode; there should be a local temperature source).

It produces a reproducible `ConformanceReport` with a verdict of `conformant`,
`conformant_with_gaps` (satisfied but with warnings), or `nonconformant`, plus line-anchored
diagnostics.

## Where the requirements come from

`src/matter-device-types.generated.ts` is generated from the Matter Device Library (the
connectedhomeip `data_model` device type XML), so "conformant" tracks what ecosystems actually
recognize. Regenerate it from a local checkout and commit the result:

```sh
pnpm --filter @openhome/conformance generate:device-types \
  ~/esp/esp-matter/connectedhomeip/connectedhomeip/data_model/1.4/device_types 1.4 \
  > core/conformance/src/matter-device-types.generated.ts
```

Only server-side clusters are captured (what a device implements). Conditional-mandatory clusters
are recorded as optional, which is lenient by design and never wrongly fails a device.

## CLI

```sh
openhome-conform <device.yaml> [--class <class>] [--json]
```

```
$ openhome-conform examples/thermostat/device.yaml
class:              thermostat
matter device type: Thermostat (0x0301)
verdict:            conformant
clusters:
  [ok] Thermostat (0x0201) <- hvac
  [ok] TemperatureMeasurement (0x0402) <- temperature_sensor
spec:               openhome-conformance-0.1
```

`--class` overrides the profile chosen from the device's category. `--json` prints the raw
report. The process exits non-zero when the device is nonconformant, so it can gate a build or a
marketplace publish.

## Library

```ts
import { conform, conformManifest } from "@openhome/conformance";

const report = conformManifest(yamlSource);       // parse + judge
// or conform(ir) against an already-parsed DeviceIR
```

## Board conformance

The same evidence-over-assertion idea applies to hardware. A **board conformance record** captures
one run of the acceptance suite against a real chip (checks passed, commit, toolchain, date,
submitter), and the support tier is derived from it rather than typed into a list:

- `experimental`: no passing run recorded.
- `community-verified`: a passing HIL run submitted by anyone.
- `verified`: a passing run a maintainer has reviewed.

```sh
# mint a record by piping a HIL acceptance run
OPENHOME_HIL_PORT=/dev/tty.usbmodemXXXX make -C tests/suites/thermostat run | \
  openhome-board record --chip esp32-c6 --bsp esp32 --class thermostat \
    --commit "$(git rev-parse --short HEAD)" --toolchain esp-idf-5.3.1 --submitter "you" \
    > sdk/firmware/bsp/esp32/conformance/thermostat-esp32c6.json

# render the supported-boards table from committed records
openhome-board list sdk/firmware/bsp
```

Records live next to the BSP they prove (`sdk/firmware/bsp/<chip>/conformance/`, Apache-2.0). The
`verified` tier currently uses a maintainer flag set on review; a later step replaces it with a
signed record so it cannot be self-asserted.

## Scope

Cluster requirements are derived from the Matter Device Library. A profile still binds a class to
its device type and declares which capability provides each cluster or fills each attribute, plus
semantic constraints; currently the thermostat is profiled. A later step adds a grounded
cross-check against the firmware's generated cluster tables once a Matter cluster generator exists,
and profiles for more classes as the capability vocabulary grows.

This is conformance (interop), not certification (the CSA logo process).
