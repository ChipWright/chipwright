// Device shadow: the latest reported value of each telemetry metric per device. The
// TelemetrySample shape matches the SDK's cw_telemetry_sample_t so firmware and twin can
// forward samples directly.

export interface TelemetrySample {
  metric: string;
  value: number;
  unit: string;
}

export interface ShadowEntry {
  value: number;
  unit: string;
  updatedAt: number;
}

export type Shadow = Record<string, ShadowEntry>;

export class DeviceShadow {
  private readonly byDevice = new Map<string, Map<string, ShadowEntry>>();

  apply(deviceId: string, sample: TelemetrySample, at: number): void {
    let metrics = this.byDevice.get(deviceId);
    if (metrics === undefined) {
      metrics = new Map<string, ShadowEntry>();
      this.byDevice.set(deviceId, metrics);
    }
    metrics.set(sample.metric, { value: sample.value, unit: sample.unit, updatedAt: at });
  }

  get(deviceId: string): Shadow | undefined {
    const metrics = this.byDevice.get(deviceId);
    if (metrics === undefined) {
      return undefined;
    }
    const shadow: Shadow = {};
    for (const [metric, entry] of metrics) {
      shadow[metric] = entry;
    }
    return shadow;
  }

  // Serializes every device's shadow for persistence.
  snapshot(): Record<string, Shadow> {
    const out: Record<string, Shadow> = {};
    for (const [deviceId, metrics] of this.byDevice) {
      const shadow: Shadow = {};
      for (const [metric, entry] of metrics) {
        shadow[metric] = entry;
      }
      out[deviceId] = shadow;
    }
    return out;
  }

  // Replaces the shadow contents from a persisted snapshot.
  restore(data: Record<string, Shadow>): void {
    this.byDevice.clear();
    for (const [deviceId, shadow] of Object.entries(data)) {
      const metrics = new Map<string, ShadowEntry>();
      for (const [metric, entry] of Object.entries(shadow)) {
        metrics.set(metric, entry);
      }
      this.byDevice.set(deviceId, metrics);
    }
  }
}
