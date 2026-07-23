// Over-the-air updates: a firmware store that only accepts signed, verified builds, and a
// staged rollout campaign with rollback. Staging happens in batches; if failures exceed a
// threshold the campaign halts and reverts already-updated devices to their prior version.

import type { DeviceRegistry } from "./registry.js";
import { verifyBuild, type SignedBuild } from "./signing.js";

export class FirmwareStore {
  private readonly builds = new Map<string, SignedBuild>();
  private readonly signingPublicKeyPem: string;

  constructor(signingPublicKeyPem: string) {
    this.signingPublicKeyPem = signingPublicKeyPem;
  }

  // Publishes a build only if its signature and artifact hash verify. Rejects tampered or
  // unsigned firmware.
  publish(build: SignedBuild, artifact: Uint8Array): void {
    if (!verifyBuild(build, artifact, this.signingPublicKeyPem)) {
      throw new Error(`firmware verification failed: ${build.deviceType} ${build.version}`);
    }
    this.builds.set(this.key(build.deviceType, build.version), build);
  }

  get(deviceType: string, version: string): SignedBuild | undefined {
    return this.builds.get(this.key(deviceType, version));
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
}
