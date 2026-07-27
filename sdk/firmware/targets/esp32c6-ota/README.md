# ESP32-C6 OTA target

On-device over-the-air updates for the `smart_thermostat`, delivered by the OpenHome cloud's
own signed-build pipeline. The device polls the cloud for the newest firmware, downloads it
into the inactive OTA slot, verifies the artifact's SHA-256 and the cloud's Ed25519 signature
against a baked-in public key, and only then switches to it. A freshly applied image must pass
a self-test on first boot to become permanent; otherwise the bootloader rolls back to the
previous working image.

This closes the platform's update loop on real silicon: the same signed-build pipeline proven
in the cloud tests (`FirmwareStore` + signing + `RolloutCampaign`) now delivers to a chip.

## How it works

- Two app partitions (`ota_0`, `ota_1`, see `partitions.csv`) so the running image is never
  overwritten while a new one downloads.
- `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE`: a new image boots as pending-verify and must call
  `esp_ota_mark_app_valid_cancel_rollback()` (after its self-test) to become permanent. If it
  fails the self-test or crashes first, the bootloader reverts on the next reboot.
- The device trusts exactly one signing key, baked in as `main/signing_public_key.h`. An image
  whose SHA-256 or Ed25519 signature does not verify is rejected before the boot partition is
  switched. mbedTLS has no EdDSA, so verification uses libsodium (a managed component).
- The signed payload is the exact JSON the cloud signs:
  `{"deviceType":...,"version":...,"artifactSha256":...}`.

## Prerequisites

Install ESP-IDF (v5.1 or newer) as for the other targets and load it:

```sh
. ~/esp/esp-idf/export.sh
```

Configure Wi-Fi and the cloud URL (kept out of git in `sdkconfig`):

```sh
idf.py -C sdk/firmware/targets/esp32c6-ota set-target esp32c6
idf.py -C sdk/firmware/targets/esp32c6-ota menuconfig   # OpenHome OTA menu
```

Set `OH_WIFI_SSID`, `OH_WIFI_PASSWORD`, and `OH_OTA_CLOUD_URL` (e.g.
`http://<host-ip>:8091`, the address of the running cloud on your LAN).

## Establish the signing identity

Generate the signing key once and bake its public half into the firmware:

```sh
pnpm --filter @openhome/cloud firmware keygen ~/.openhome/firmware-signing.key
pnpm --filter @openhome/cloud firmware pubkey-c ~/.openhome/firmware-signing.key \
  > sdk/firmware/targets/esp32c6-ota/main/signing_public_key.h
```

## Prove it end to end

1. Start the cloud with the matching public key so it verifies published builds:

   ```sh
   export OPENHOME_SIGNING_KEY="$(...public key PEM...)"
   PORT=8091 pnpm --filter @openhome/cloud serve
   ```

2. Flash the base image (version `1.0.0`) and watch it report its version:

   ```sh
   idf.py -C sdk/firmware/targets/esp32c6-ota -B build flash monitor
   ```

3. Build a newer image and publish it (the version is embedded in the image, so build it into
   its own directory):

   ```sh
   idf.py -C sdk/firmware/targets/esp32c6-ota -B build-101 -DPROJECT_VER=1.0.1 build
   pnpm --filter @openhome/cloud firmware publish ~/.openhome/firmware-signing.key \
     smart_thermostat 1.0.1 sdk/firmware/targets/esp32c6-ota/build-101/openhome_thermostat_ota.bin \
     http://<host-ip>:8091
   ```

   On its next boot the device finds `1.0.1`, downloads and verifies it, reboots into it from
   the other partition, passes its self-test, and reports "up to date".

4. To see safe rollback, build a version whose self-test fails and publish it as a newer
   version:

   ```sh
   idf.py -C sdk/firmware/targets/esp32c6-ota -B build-102 -DPROJECT_VER=1.0.2 \
     -DCONFIG_OH_OTA_SELFTEST_FAIL=y build
   # publish 1.0.2 as above
   ```

   The device applies `1.0.2`, fails the self-test on first boot, and the bootloader reverts to
   the last working image.

## Notes

- Built by the ESP-IDF toolchain, not the repository's `make`/`pnpm` CI (which has no ESP-IDF
  toolchain). The cloud half of OTA (signing, artifact serving, rollout, rollback) is covered
  by the cloud package's tests.
- `PROJECT_VER` is embedded in the image; build each version in its own `-B` directory so a
  stale CMake cache does not carry a version across builds.
- A persistently failing "latest" produces an update/rollback loop on a lone device; a fleet
  rollout halts after the failure threshold (`RolloutCampaign`), which is the cloud's role.
- Uses HTTP on the local network for the demo. Production delivery should use HTTPS, which
  the cloud serves when `OPENHOME_TLS_CERT` and `OPENHOME_TLS_KEY` are set (see
  `cloud/README.md`); the signature check makes the image itself tamper-evident regardless
  of transport.
