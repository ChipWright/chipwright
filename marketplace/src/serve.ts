// Starts the marketplace registry HTTP server over a filesystem-backed store, so a
// running service persists published packages. Port comes from PORT (default 8080) and
// the registry directory from OPENHOME_REGISTRY (default ~/.openhome/registry).

import { homedir } from "node:os";
import { join } from "node:path";
import { createRegistryServer } from "./http.js";
import { PackageRegistry } from "./registry.js";
import { FileSystemStore } from "./store.js";

const port = Number(process.env["PORT"] ?? 8080);
const root = process.env["OPENHOME_REGISTRY"] ?? join(homedir(), ".openhome", "registry");
const registry = new PackageRegistry(new FileSystemStore(root));
const server = createRegistryServer(registry);

server.listen(port, () => {
  process.stdout.write(`openhome registry listening on port ${port}, store ${root}\n`);
});
