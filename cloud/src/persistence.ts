// Durable storage for the cloud's operational state: the device registry, device shadows,
// the pending command queue, the CA trust root, issued certificates, published firmware, and
// in-flight OTA campaigns. State is serialized as a single JSON document so a restarted
// server resumes where it left off. Backed by the Node standard library, keeping the cloud
// free of runtime dependencies.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Command } from "./commands.js";
import type { CaSnapshot, DeviceCertificate } from "./identity.js";
import type { FirmwareBuildSnapshot, RolloutSnapshot } from "./ota.js";
import type { DeviceRecord } from "./registry.js";
import type { Shadow } from "./shadow.js";

// A persisted rollout carries its campaign id alongside the campaign's internal state.
export type PersistedRollout = RolloutSnapshot & { id: string };

export interface CloudSnapshot {
  registry: DeviceRecord[];
  shadow: Record<string, Shadow>;
  commands: Record<string, Command[]>;
  // The fields below were added when identity, firmware, and rollouts became durable; they
  // are optional so a state file written by an earlier version still loads.
  ca?: CaSnapshot;
  certificates?: DeviceCertificate[];
  firmware?: FirmwareBuildSnapshot[];
  rollouts?: PersistedRollout[];
}

// A place the cloud can persist and reload its state. The in-process default keeps state in
// memory; FileCloudStore persists it to disk.
export interface CloudStore {
  load(): CloudSnapshot | null;
  save(snapshot: CloudSnapshot): void;
}

export class FileCloudStore implements CloudStore {
  constructor(private readonly path: string) {}

  load(): CloudSnapshot | null {
    if (!existsSync(this.path)) {
      return null;
    }
    try {
      return JSON.parse(readFileSync(this.path, "utf8")) as CloudSnapshot;
    } catch {
      // A corrupt or unreadable state file starts the cloud empty rather than crashing it.
      return null;
    }
  }

  save(snapshot: CloudSnapshot): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(snapshot, null, 2), "utf8");
  }
}
