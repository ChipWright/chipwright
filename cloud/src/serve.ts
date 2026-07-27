// Starts the cloud HTTP server. Port is configurable through the PORT environment variable
// (default 8080). State is persisted to a JSON file so the server resumes across restarts;
// the path is OPENHOME_CLOUD_STATE, defaulting to ~/.openhome/cloud-state.json.
//
// Production hardening is configured through the environment:
//   OPENHOME_ADMIN_TOKEN   bearer token required for management routes
//   OPENHOME_DEVICE_TOKEN  bearer token accepted for device routes (telemetry, OTA)
//   OPENHOME_TLS_CERT      path to a PEM certificate chain; enables HTTPS when set with the key
//   OPENHOME_TLS_KEY       path to the matching PEM private key
// When a token is unset the corresponding scope runs open, which suits local development.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createCloudServer, type CloudServerOptions } from "./http.js";
import { FileCloudStore } from "./persistence.js";
import { CloudService } from "./service.js";

const port = Number(process.env["PORT"] ?? 8080);
const statePath =
  process.env["OPENHOME_CLOUD_STATE"] ?? join(homedir(), ".openhome", "cloud-state.json");
const service = new CloudService(
  () => Date.now(),
  process.env["OPENHOME_SIGNING_KEY"],
  new FileCloudStore(statePath),
);

const options: CloudServerOptions = {};
const adminToken = process.env["OPENHOME_ADMIN_TOKEN"];
const deviceToken = process.env["OPENHOME_DEVICE_TOKEN"];
if (adminToken !== undefined) {
  options.adminToken = adminToken;
}
if (deviceToken !== undefined) {
  options.deviceToken = deviceToken;
}

const tlsCertPath = process.env["OPENHOME_TLS_CERT"];
const tlsKeyPath = process.env["OPENHOME_TLS_KEY"];
if (tlsCertPath !== undefined && tlsKeyPath !== undefined) {
  options.tls = { cert: readFileSync(tlsCertPath), key: readFileSync(tlsKeyPath) };
}

if (adminToken === undefined) {
  process.stderr.write(
    "warning: OPENHOME_ADMIN_TOKEN is unset; management routes are open. Set it in production.\n",
  );
}

const scheme = options.tls !== undefined ? "https" : "http";
const server = createCloudServer(service, options);

server.listen(port, () => {
  process.stdout.write(
    `openhome cloud listening on ${scheme} port ${port}, state ${statePath}\n`,
  );
});
