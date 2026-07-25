// Starts the cloud HTTP server. Port is configurable through the PORT environment variable
// (default 8080). State is persisted to a JSON file so the server resumes across restarts;
// the path is OPENHOME_CLOUD_STATE, defaulting to ~/.openhome/cloud-state.json.

import { homedir } from "node:os";
import { join } from "node:path";
import { createCloudServer } from "./http.js";
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
const server = createCloudServer(service);

server.listen(port, () => {
  process.stdout.write(`openhome cloud listening on port ${port}, state ${statePath}\n`);
});
