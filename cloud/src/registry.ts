// Device registry: the record of every device the cloud knows about.

export type DeviceStatus = "provisioned" | "online" | "offline";

export interface DeviceRecord {
  deviceId: string;
  deviceType: string;
  firmwareVersion: string;
  status: DeviceStatus;
  lastSeen: number | null;
}

export interface RegisterDeviceInput {
  deviceId: string;
  deviceType: string;
  firmwareVersion?: string;
}

export class DeviceRegistry {
  private readonly devices = new Map<string, DeviceRecord>();

  register(input: RegisterDeviceInput): DeviceRecord {
    if (this.devices.has(input.deviceId)) {
      throw new Error(`device already registered: ${input.deviceId}`);
    }
    const record: DeviceRecord = {
      deviceId: input.deviceId,
      deviceType: input.deviceType,
      firmwareVersion: input.firmwareVersion ?? "0.0.0",
      status: "provisioned",
      lastSeen: null,
    };
    this.devices.set(record.deviceId, record);
    return record;
  }

  get(deviceId: string): DeviceRecord | undefined {
    return this.devices.get(deviceId);
  }

  list(): DeviceRecord[] {
    return [...this.devices.values()];
  }

  setStatus(deviceId: string, status: DeviceStatus): boolean {
    const record = this.devices.get(deviceId);
    if (record === undefined) {
      return false;
    }
    record.status = status;
    return true;
  }

  setFirmware(deviceId: string, firmwareVersion: string): boolean {
    const record = this.devices.get(deviceId);
    if (record === undefined) {
      return false;
    }
    record.firmwareVersion = firmwareVersion;
    return true;
  }

  markSeen(deviceId: string, at: number): boolean {
    const record = this.devices.get(deviceId);
    if (record === undefined) {
      return false;
    }
    record.lastSeen = at;
    return true;
  }
}
