// Over-the-air updates: a firmware store that only accepts signed, verified builds, and a
// staged rollout campaign with rollback. Staging happens in batches; if failures exceed a
// threshold the campaign halts and reverts already-updated devices to their prior version.

import type { DeviceRegistry } from "./registry.js";
import { verifyBuild, type SignedBuild } from "./signing.js";

// A published build with its artifact bytes as base64, for persisting the firmware store.
export interface FirmwareBuildSnapshot {
  build: SignedBuild;
  artifactBase64: string;
}

// Compares two dotted numeric versions (e.g. "1.10.0" vs "1.9.0"). Returns a positive number
// when a is newer, negative when older, zero when equal. Non-numeric components compare
// lexically, so it degrades gracefully for unconventional version strings.
export function compareVersions(a: string, b: string): number {
  const ap = a.split(".");
  const bp = b.split(".");
  const len = Math.max(ap.length, bp.length);
  for (let i = 0; i < len; i++) {
    const as = ap[i] ?? "0";
    const bs = bp[i] ?? "0";
    const an = Number(as);
    const bn = Number(bs);
    if (Number.isInteger(an) && Number.isInteger(bn)) {
      if (an !== bn) {
        return an - bn;
      }
    } else if (as !== bs) {
      return as < bs ? -1 : 1;
    }
  }
  return 0;
}

export class FirmwareStore {
  private readonly builds = new Map<string, SignedBuild>();
  private readonly artifacts = new Map<string, Uint8Array>();
  private readonly signingPublicKeyPem: string;

  constructor(signingPublicKeyPem: string) {
    this.signingPublicKeyPem = signingPublicKeyPem;
  }

  // Publishes a build only if its signature and artifact hash verify. Rejects tampered or
  // unsigned firmware. The artifact bytes are retained so devices can download them for OTA.
  publish(build: SignedBuild, artifact: Uint8Array): void {
    if (!verifyBuild(build, artifact, this.signingPublicKeyPem)) {
      throw new Error(`firmware verification failed: ${build.deviceType} ${build.version}`);
    }
    this.builds.set(this.key(build.deviceType, build.version), build);
    this.artifacts.set(this.key(build.deviceType, build.version), artifact);
  }

  get(deviceType: string, version: string): SignedBuild | undefined {
    return this.builds.get(this.key(deviceType, version));
  }

  // Returns the raw artifact bytes for a published build, for a device to download and apply.
  getArtifact(deviceType: string, version: string): Uint8Array | undefined {
    return this.artifacts.get(this.key(deviceType, version));
  }

  // Returns the highest-versioned published build for a device type, which a device polls to
  // discover whether an update is available.
  latest(deviceType: string): SignedBuild | undefined {
    let newest: SignedBuild | undefined;
    for (const build of this.builds.values()) {
      if (build.deviceType !== deviceType) {
        continue;
      }
      if (newest === undefined || compareVersions(build.version, newest.version) > 0) {
        newest = build;
      }
    }
    return newest;
  }

  // Serializes every published build and its artifact bytes for persistence.
  snapshot(): FirmwareBuildSnapshot[] {
    const entries: FirmwareBuildSnapshot[] = [];
    for (const [key, build] of this.builds) {
      const artifact = this.artifacts.get(key) ?? new Uint8Array();
      entries.push({ build, artifactBase64: Buffer.from(artifact).toString("base64") });
    }
    return entries;
  }

  // Reloads persisted builds, re-verifying each so a tampered state file cannot inject an
  // unsigned or altered artifact. A build that no longer verifies (for example under a
  // different signing key) is dropped rather than trusted.
  restore(entries: readonly FirmwareBuildSnapshot[]): void {
    for (const entry of entries) {
      const artifact = Buffer.from(entry.artifactBase64, "base64");
      if (!verifyBuild(entry.build, artifact, this.signingPublicKeyPem)) {
        continue;
      }
      const key = this.key(entry.build.deviceType, entry.build.version);
      this.builds.set(key, entry.build);
      this.artifacts.set(key, artifact);
    }
  }

  private key(deviceType: string, version: string): string {
    return `${deviceType}@${version}`;
  }
}

export type RolloutState = "pending" | "offered" | "applied" | "failed" | "rolledback";

export type RolloutPhase = "in_progress" | "completed" | "halted";

export interface RolloutStatus {
  version: string;
  batchSize: number;
  phase: RolloutPhase;
  devices: Record<string, RolloutState>;
}

export interface RolloutOptions {
  batchSize?: number;
  maxFailures?: number;
}

// The full internal state of a campaign, for persisting an in-flight rollout across a
// restart. The registry is not part of the snapshot; it is supplied again on restore.
export interface RolloutSnapshot {
  targetVersion: string;
  batchSize: number;
  maxFailures: number;
  order: string[];
  deviceState: Record<string, RolloutState>;
  previousVersion: Record<string, string>;
  cursor: number;
  phase: RolloutPhase;
}

export class RolloutCampaign {
  private readonly registry: DeviceRegistry;
  readonly targetVersion: string;
  private readonly batchSize: number;
  private readonly maxFailures: number;
  private readonly order: string[];
  private readonly deviceState = new Map<string, RolloutState>();
  private readonly previousVersion = new Map<string, string>();
  private cursor = 0;
  private phase: RolloutPhase = "in_progress";

  constructor(
    registry: DeviceRegistry,
    deviceIds: readonly string[],
    targetVersion: string,
    options: RolloutOptions = {},
  ) {
    this.registry = registry;
    this.order = [...deviceIds];
    this.targetVersion = targetVersion;
    this.batchSize = options.batchSize ?? 1;
    this.maxFailures = options.maxFailures ?? 0;
    for (const deviceId of this.order) {
      this.deviceState.set(deviceId, "pending");
    }
  }

  // Offers the next batch of devices the update, returning their ids.
  nextBatch(): string[] {
    if (this.phase !== "in_progress") {
      return [];
    }
    const batch: string[] = [];
    while (this.cursor < this.order.length && batch.length < this.batchSize) {
      const deviceId = this.order[this.cursor] as string;
      this.cursor++;
      this.deviceState.set(deviceId, "offered");
      batch.push(deviceId);
    }
    return batch;
  }

  // Records a device's outcome. On success the registry firmware version is advanced; if
  // total failures exceed the threshold the campaign halts and rolls back.
  report(deviceId: string, outcome: "applied" | "failed"): void {
    if (!this.deviceState.has(deviceId)) {
      throw new Error(`device not part of campaign: ${deviceId}`);
    }
    if (this.phase !== "in_progress") {
      return;
    }

    if (outcome === "applied") {
      if (!this.previousVersion.has(deviceId)) {
        this.previousVersion.set(deviceId, this.registry.get(deviceId)?.firmwareVersion ?? "0.0.0");
      }
      this.registry.setFirmware(deviceId, this.targetVersion);
      this.deviceState.set(deviceId, "applied");
    } else {
      this.deviceState.set(deviceId, "failed");
    }

    const failures = [...this.deviceState.values()].filter((state) => state === "failed").length;
    if (failures > this.maxFailures) {
      this.rollback();
      return;
    }

    const settled = [...this.deviceState.values()].every(
      (state) => state === "applied" || state === "failed" || state === "rolledback",
    );
    if (settled) {
      this.phase = "completed";
    }
  }

  // Reverts every applied device to its previous firmware version and halts the campaign.
  rollback(): void {
    for (const [deviceId, state] of this.deviceState) {
      if (state === "applied") {
        const previous = this.previousVersion.get(deviceId);
        if (previous !== undefined) {
          this.registry.setFirmware(deviceId, previous);
        }
        this.deviceState.set(deviceId, "rolledback");
      }
    }
    this.phase = "halted";
  }

  status(): RolloutStatus {
    const devices: Record<string, RolloutState> = {};
    for (const [deviceId, state] of this.deviceState) {
      devices[deviceId] = state;
    }
    return { version: this.targetVersion, batchSize: this.batchSize, phase: this.phase, devices };
  }

  // Serializes the campaign's in-flight state for persistence.
  toSnapshot(): RolloutSnapshot {
    return {
      targetVersion: this.targetVersion,
      batchSize: this.batchSize,
      maxFailures: this.maxFailures,
      order: [...this.order],
      deviceState: Object.fromEntries(this.deviceState),
      previousVersion: Object.fromEntries(this.previousVersion),
      cursor: this.cursor,
      phase: this.phase,
    };
  }

  // Rebuilds a campaign against a (freshly loaded) registry from a persisted snapshot.
  static fromSnapshot(registry: DeviceRegistry, snapshot: RolloutSnapshot): RolloutCampaign {
    const campaign = new RolloutCampaign(registry, snapshot.order, snapshot.targetVersion, {
      batchSize: snapshot.batchSize,
      maxFailures: snapshot.maxFailures,
    });
    campaign.cursor = snapshot.cursor;
    campaign.phase = snapshot.phase;
    campaign.deviceState.clear();
    for (const [deviceId, state] of Object.entries(snapshot.deviceState)) {
      campaign.deviceState.set(deviceId, state);
    }
    for (const [deviceId, version] of Object.entries(snapshot.previousVersion)) {
      campaign.previousVersion.set(deviceId, version);
    }
    return campaign;
  }
}
