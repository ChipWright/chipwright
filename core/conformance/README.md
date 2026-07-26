# @openhome/conformance

The conformance engine judges whether a device definition is a valid instance of the device
**class** it claims to be, and maps that class to its Matter device type. A capability is a
composable primitive; a class is a validated bundle of capabilities plus a mapping to a standard
the outside world recognizes. Conformance is what turns "I described a device" into "controllers
and ecosystems will recognize it as a thermostat."

This is conformance (the interop engineering), not certification (the CSA logo process).

## What it checks

Given a device (a manifest or a parsed IR) and a class profile:

- **Required clusters.** Every mandatory Matter cluster for the device type must be provided by
  some capability. Optional clusters are reported as gaps when absent.
- **Grounded mapping.** Capabilities are mapped to the Matter clusters the generated device will
  actually expose, so the check reflects what ships, not just what the manifest claims.
- **Semantic constraints.** Class-specific rules beyond cluster presence (for a thermostat: the
  hvac actuator must support an `off` mode; the temperature sensor should declare a range).

It produces a reproducible `ConformanceReport` with a verdict of `conformant`,
`conformant_with_gaps` (only optional clusters missing), or `nonconformant`, plus line-anchored
diagnostics.

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

## Scope

Profiles in this phase are authored by hand for the classes the platform supports (currently the
thermostat). A later phase derives them from the Matter Device Library so "conformant" tracks the
published standard rather than this package's own encoding of it, and adds a cross-check against
the generated cluster tables.
