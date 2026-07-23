// Starts the cloud HTTP server. Port is configurable through the PORT environment
// variable and defaults to 8080.

import { createCloudServer } from "./http.js";
import { CloudService } from "./service.js";

const port = Number(process.env["PORT"] ?? 8080);
const service = new CloudService();
const server = createCloudServer(service);

server.listen(port, () => {
  process.stdout.write(`openhome cloud listening on port ${port}\n`);
});
