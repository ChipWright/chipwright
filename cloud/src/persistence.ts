// Durable storage for the cloud's core operational state: the device registry, the device
// shadows, and the pending command queue. State is serialized as a single JSON document so a
// restarted server resumes where it left off. Backed by the Node standard library, keeping
// the cloud free of runtime dependencies.
//
// Identity certificates and OTA rollout campaigns are not yet persisted; they are rebuilt at
// runtime. The device records themselves survive, which is the state a restart must not lose.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Command } from "./commands.js";
import type { DeviceRecord } from "./registry.js";
import type { Shadow } from "./shadow.js";

export interface CloudSnapshot {
  registry: DeviceRecord[];
  shadow: Record<string, Shadow>;
  commands: Record<string, Command[]>;
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
