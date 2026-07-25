# ESP32-C6 Matter target

The `smart_thermostat` as a real **Matter-over-Wi-Fi** device on the ESP32-C6. It exposes a
Matter Temperature Measurement endpoint whose value is fed from the OpenHome HAL (the chip's
on-die temperature sensor), so the Matter device runs the same
`manifest -> generated interface -> SDK + HAL` path as the twin and the plain telemetry
firmware. Verified end to end: the device commissions onto a Matter fabric and answers
attribute reads from a controller.

## Prerequisites

This target needs **esp-matter** and its pinned **ESP-IDF v5.5.x** (separate from the plain
telemetry target's ESP-IDF). One-time setup:

```sh
git clone -b v5.5.4 --recursive https://github.com/espressif/esp-idf.git ~/esp/esp-idf-v5.5.4
~/esp/esp-idf-v5.5.4/install.sh esp32c6
git clone --depth 1 https://github.com/espressif/esp-matter.git ~/esp/esp-matter
cd ~/esp/esp-matter && git submodule update --init --depth 1 connectedhomeip/connectedhomeip
cd connectedhomeip/connectedhomeip && ./scripts/checkout_submodules.py --platform esp32 --shallow
cd ~/esp/esp-matter && ./install.sh
```

Activate the toolchain in each shell (sets IDF v5.5.4 and `ESP_MATTER_PATH`):

```sh
. ~/esp/idf-matter.sh
```

## Recommended: commission on-network (avoids BLE/coexistence)

On a single-radio chip like the C6, keeping BLE up *while* joining Wi-Fi during commissioning
(the concurrent path) starves the Wi-Fi scan and fails to associate. The reliable path is to
have the device join Wi-Fi at boot **with BLE idle**, then commission **over IP** — no BLE, no
coexistence.

Put your Wi-Fi credentials in the local, gitignored `sdkconfig` (never commit them):

```sh
idf.py -C sdk/firmware/targets/esp32c6-matter set-target esp32c6
sed -i '' 's|^CONFIG_DEFAULT_WIFI_SSID=.*|CONFIG_DEFAULT_WIFI_SSID="<SSID>"|; \
           s|^CONFIG_DEFAULT_WIFI_PASSWORD=.*|CONFIG_DEFAULT_WIFI_PASSWORD="<PASSWORD>"|' \
    sdk/firmware/targets/esp32c6-matter/sdkconfig
idf.py -C sdk/firmware/targets/esp32c6-matter build flash monitor
```

The device joins Wi-Fi on boot and advertises as a commissionable Matter node over IP. From a
host on the **same network**, commission it with chip-tool (built with esp-matter):

```sh
chip-tool pairing onnetwork 1 20202021
chip-tool temperaturemeasurement read measured-value 1 1
```

To add other ecosystems afterwards (multi-admin), open a window and use the printed code:

```sh
chip-tool pairing open-commissioning-window 1 1 600 1000 3840
```

## BLE commissioning (alternative)

`chip-tool pairing ble-wifi 1 "<SSID>" "<PASSWORD>" 20202021 3840` also works, but on macOS it
requires Apple's "Bluetooth Central Matter Client Developer Mode" configuration profile
(otherwise the OS blocks the GATT write), and it is subject to the C6 coexistence issue above.
On Linux, BLE commissioning is more reliable.

## Known issues

- **Consumer ecosystems (Apple Home / Google Home / Alexa) require a hub** (HomePod/Apple TV,
  Nest hub, or a Matter-capable Echo). Apple additionally requires the developer profile above
  to accept this test-certificate device. chip-tool needs no hub.
- Uses esp-matter **test** attestation certificates; production devices provision per-device
  certificates into the `esp_secure_cert` / `fctry` partitions.

## Notes

- Built by the ESP-IDF/esp-matter toolchain, not the repository's `make`/`pnpm` CI.
- `CONFIG_ENABLE_CONCURRENT_CONNECTION=n` in `sdkconfig.defaults` selects non-concurrent
  commissioning (BLE torn down before the Wi-Fi join).
- `MeasuredValue` is set through the code-driven `TemperatureMeasurementCluster` obtained from
  the data model provider registry, not `attribute::update()`. In esp-matter's new data model,
  reads of this cluster are served from the cluster's own storage; `attribute::update()` writes
  only the legacy attribute store and its value would never reach a controller. esp-matter
  ships a `SetMeasuredValue` helper for the pressure/humidity/flow clusters but not for
  temperature, so this app reaches the cluster through the registry directly.
