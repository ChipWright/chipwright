# Per-device identity on the ESP32-C6

This target brings the cloud's security framework onto real silicon. On first boot the device
asks the OpenHome cloud to provision it: the cloud's certificate authority registers the
device, mints it an Ed25519 key pair, and returns a certificate binding the device id to its
public key, signed by the CA. The device stores that identity in NVS so it survives a reboot,
and the private key never leaves the chip.

On every boot the device proves, entirely on-chip, that it holds a genuine CA-issued identity:

1. **Its private key matches its certificate.** The public key derived from the stored private
   key equals the certified public key.
2. **The certificate was signed by the CA.** The device reconstructs the exact payload the
   cloud signs and verifies the CA signature against the CA public key.
3. **It can produce valid signatures.** It signs a fresh nonce and verifies it against its
   certified public key.

mbedTLS has no EdDSA, so all Ed25519 work uses libsodium, as in the OTA target. Base64 decoding
of the PEM key material uses mbedTLS.

## What it reuses

- The cloud's `IdentityService` (CA), `/provision`, and `/ca` endpoints, unchanged.
- The Wi-Fi station and `esp_http_client` patterns from the OTA target.
- libsodium for raw Ed25519, matching the OTA signature check.

## Running the demo

Start the cloud in open mode (no auth tokens) on your LAN so the device can provision:

```sh
PORT=8091 node cloud/dist/serve.js
```

Configure Wi-Fi and the cloud URL (these live only in the gitignored `sdkconfig`):

```sh
idf.py -C sdk/firmware/targets/esp32c6-identity set-target esp32c6
idf.py -C sdk/firmware/targets/esp32c6-identity menuconfig   # set OpenHome Identity options
idf.py -C sdk/firmware/targets/esp32c6-identity -p <port> flash
```

The device id is derived from the chip's MAC (`esp32c6-<mac>`), so each board provisions as a
distinct identity. On first boot the log shows provisioning; on later boots it shows the
identity loaded from NVS and the three checks passing:

```
device id esp32c6-48f6eec4e2d4
loaded existing identity from NVS
[ok] private key matches certificate: yes
[ok] certificate signed by CA: yes
[ok] produces valid signatures: yes
identity esp32c6-48f6eec4e2d4: VERIFIED (CA-issued, key on device, persisted)
```

`GET /devices` on the cloud then shows the device registered with status `provisioned`.

## Notes

- Built by the ESP-IDF toolchain, not the repository's `make`/`pnpm` CI (which has no ESP-IDF
  toolchain). The cloud half (identity issuance and certificate verification) is covered by the
  cloud package's tests.
- Provisioning uses HTTP for the LAN demo. Production provisioning should use HTTPS, which the
  cloud serves when `OPENHOME_TLS_CERT` and `OPENHOME_TLS_KEY` are set (see `cloud/README.md`).
- This is the identity layer only. Secure boot and flash encryption (which burn one-way eFuses)
  are deliberately not enabled here so the board stays reusable for the other targets.
