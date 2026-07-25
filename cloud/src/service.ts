// CloudService ties the registry, shadow, command queue, identity CA, firmware store, and
// rollout campaigns into one façade. It takes an injectable clock so time-dependent
// behavior is deterministic under test. Firmware operations require a trusted signing
// public key; when none is configured they report that clearly.

import { randomUUID } from "node:crypto";
import { CommandQueue, type Command } from "./commands.js";
import { IdentityService, type DeviceCertificate, type DeviceIdentity } from "./identity.js";
import { FirmwareStore, RolloutCampaign, type RolloutOptions, type RolloutStatus } from "./ota.js";
import { DeviceRegistry, type DeviceRecord, type RegisterDeviceInput } from "./registry.js";
import { DeviceShadow, type Shadow, type TelemetrySample } from "./shadow.js";
import type { CloudSnapshot, CloudStore } from "./persistence.js";
import type { SignedBuild } from "./signing.js";

export type Clock = () => number;

export interface ProvisionResult {
  device: DeviceRecord;
  identity: DeviceIdentity;
}

export class CloudService {
  readonly registry = new DeviceRegistry();
  readonly shadow = new DeviceShadow();
  readonly commands = new CommandQueue();
  readonly identity: IdentityService;
  private readonly firmwareStore: FirmwareStore | null;
  private readonly certificates = new Map<string, DeviceCertificate>();
  private readonly campaigns = new Map<string, RolloutCampaign>();
  private readonly clock: Clock;
  private readonly store: CloudStore | null;

  constructor(clock: Clock = () => Date.now(), signingPublicKeyPem?: string, store?: CloudStore) {
    this.clock = clock;
    this.identity = new IdentityService(clock);
    this.firmwareStore =
      signingPublicKeyPem !== undefined ? new FirmwareStore(signingPublicKeyPem) : null;
    this.store = store ?? null;
    const persisted = this.store?.load();
    if (persisted != null) {
      this.restore(persisted);
    }
  }

  // Serializes the core operational state (registry, shadows, command queue) for persistence.
  snapshot(): CloudSnapshot {
    return {
      registry: this.registry.snapshot(),
      shadow: this.shadow.snapshot(),
      commands: this.commands.snapshot(),
    };
  }

  private restore(snapshot: CloudSnapshot): void {
    this.registry.restore(snapshot.registry);
    this.shadow.restore(snapshot.shadow);
    this.commands.restore(snapshot.commands);
  }

  private persist(): void {
    this.store?.save(this.snapshot());
  }

  get caPublicKeyPem(): string {
    return this.identity.caPublicKeyPem;
  }

  registerDevice(input: RegisterDeviceInput): DeviceRecord {
    const record = this.registry.register(input);
    this.persist();
    return record;
  }

  // Registers a device and issues it a signed identity. The returned identity includes the
  // private key, delivered to the device once at provisioning; the cloud retains only the
  // certificate.
  provisionDevice(input: RegisterDeviceInput): ProvisionResult {
    const device = this.registry.register(input);
    const identity = this.identity.issue(input.deviceId);
    this.certificates.set(input.deviceId, identity.certificate);
    this.persist();
    return { device, identity };
  }

  getCertificate(deviceId: string): DeviceCertificate | undefined {
    return this.certificates.get(deviceId);
  }

  ingestTelemetry(deviceId: string, samples: readonly TelemetrySample[]): void {
    if (this.registry.get(deviceId) === undefined) {
      throw new Error(`unknown device: ${deviceId}`);
    }
    const now = this.clock();
    for (const sample of samples) {
      this.shadow.apply(deviceId, sample, now);
    }
    this.registry.markSeen(deviceId, now);
    this.registry.setStatus(deviceId, "online");
    this.persist();
  }

  getShadow(deviceId: string): Shadow | undefined {
    return this.shadow.get(deviceId);
  }

  sendCommand(deviceId: string, name: string, args: Record<string, unknown>): Command {
    if (this.registry.get(deviceId) === undefined) {
      throw new Error(`unknown device: ${deviceId}`);
    }
    const command = this.commands.enqueue(deviceId, name, args, this.clock());
    this.persist();
    return command;
  }

  drainCommands(deviceId: string): Command[] {
    const drained = this.commands.drain(deviceId);
    this.persist();
    return drained;
  }

  publishFirmware(build: SignedBuild, artifact: Uint8Array): void {
    if (this.firmwareStore === null) {
      throw new Error("firmware trust anchor is not configured");
    }
    this.firmwareStore.publish(build, artifact);
  }

  getFirmware(deviceType: string, version: string): SignedBuild | undefined {
    return this.firmwareStore?.get(deviceType, version);
  }

  createRollout(
    deviceIds: readonly string[],
    targetVersion: string,
    options: RolloutOptions = {},
  ): { id: string; status: RolloutStatus } {
    const id = randomUUID();
    const campaign = new RolloutCampaign(this.registry, deviceIds, targetVersion, options);
    this.campaigns.set(id, campaign);
    return { id, status: campaign.status() };
  }

  private campaign(id: string): RolloutCampaign {
    const campaign = this.campaigns.get(id);
    if (campaign === undefined) {
      throw new Error(`unknown rollout: ${id}`);
    }
    return campaign;
  }

  advanceRollout(id: string): { batch: string[]; status: RolloutStatus } {
    const campaign = this.campaign(id);
    const batch = campaign.nextBatch();
    return { batch, status: campaign.status() };
  }

  reportRollout(id: string, deviceId: string, outcome: "applied" | "failed"): RolloutStatus {
    const campaign = this.campaign(id);
    campaign.report(deviceId, outcome);
    return campaign.status();
  }

  rolloutStatus(id: string): RolloutStatus {
    return this.campaign(id).status();
  }
}
