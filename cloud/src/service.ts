// CloudService ties the registry, shadow, and command queue into one façade. It takes an
// injectable clock so time-dependent behavior is deterministic under test.

import { CommandQueue, type Command } from "./commands.js";
import { DeviceRegistry, type DeviceRecord, type RegisterDeviceInput } from "./registry.js";
import { DeviceShadow, type Shadow, type TelemetrySample } from "./shadow.js";

export type Clock = () => number;

export class CloudService {
  readonly registry = new DeviceRegistry();
  readonly shadow = new DeviceShadow();
  readonly commands = new CommandQueue();
  private readonly clock: Clock;

  constructor(clock: Clock = () => Date.now()) {
    this.clock = clock;
  }

  registerDevice(input: RegisterDeviceInput): DeviceRecord {
    return this.registry.register(input);
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
  }

  getShadow(deviceId: string): Shadow | undefined {
    return this.shadow.get(deviceId);
  }

  sendCommand(deviceId: string, name: string, args: Record<string, unknown>): Command {
    if (this.registry.get(deviceId) === undefined) {
      throw new Error(`unknown device: ${deviceId}`);
    }
    return this.commands.enqueue(deviceId, name, args, this.clock());
  }

  drainCommands(deviceId: string): Command[] {
    return this.commands.drain(deviceId);
  }
}
