// Build-time generator: parses the Matter Device Library (the connectedhomeip data_model device
// type XML) into a committed TypeScript data file, so the conformance engine derives its cluster
// requirements from the published standard rather than hand-authored guesses, with zero runtime
// dependencies. Run it against a local connectedhomeip checkout and commit the output:
//
//   tsx scripts/generate-matter-device-types.ts \
//     ~/esp/esp-matter/connectedhomeip/connectedhomeip/data_model/1.4/device_types 1.4 \
//     > src/matter-device-types.generated.ts
//
// Only server-side clusters are captured (what a device implements). Conditional-mandatory
// clusters are recorded as optional, since their requirement depends on features this model does
// not evaluate; that is lenient by design and never wrongly fails a device.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

interface Cluster {
  id: number;
  name: string;
  conformance: "mandatory" | "optional";
}
interface DeviceType {
  id: number;
  name: string;
  revision: number;
  serverClusters: Cluster[];
}

function attr(source: string, name: string): string | null {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(source);
  return match ? (match[1] ?? null) : null;
}

function parseDeviceType(xml: string): DeviceType | null {
  const open = /<deviceType\b([^>]*)>/.exec(xml);
  if (open === null) {
    return null;
  }
  const idText = attr(open[1] ?? "", "id");
  const name = attr(open[1] ?? "", "name");
  if (idText === null || name === null) {
    return null;
  }
  const revisionText = attr(open[1] ?? "", "revision");
  const serverClusters: Cluster[] = [];

  const clusterRe = /<cluster\b([^>]*?)(?:\/>|>([\s\S]*?)<\/cluster>)/g;
  for (let m = clusterRe.exec(xml); m !== null; m = clusterRe.exec(xml)) {
    const attrs = m[1] ?? "";
    const inner = m[2] ?? "";
    const cid = attr(attrs, "id");
    const cname = attr(attrs, "name");
    const side = attr(attrs, "side");
    if (cid === null || cname === null) {
      continue;
    }
    // A device implements its server clusters; client entries are things it consumes elsewhere.
    if (side !== null && side !== "server") {
      continue;
    }
    // The cluster's own conformance is stated before any nested features/attributes/commands,
    // whose conformance tags must not be mistaken for the cluster's.
    const head = inner.split(/<(?:features|attributes|commands|events)\b/)[0] ?? "";
    let conformance: "mandatory" | "optional" | "skip";
    if (/<mandatoryConform\s*\/>/.test(head)) {
      conformance = "mandatory";
    } else if (/<disallowConform|<deprecateConform/.test(head)) {
      conformance = "skip";
    } else {
      conformance = "optional";
    }
    if (conformance === "skip") {
      continue;
    }
    serverClusters.push({ id: parseInt(cid, 16), name: cname, conformance });
  }

  return {
    id: parseInt(idText, 16),
    name,
    revision: revisionText !== null ? parseInt(revisionText, 10) : 1,
    serverClusters,
  };
}

function main(): void {
  const dir = process.argv[2];
  const version = process.argv[3] ?? "unknown";
  if (dir === undefined) {
    process.stderr.write(
      "usage: tsx scripts/generate-matter-device-types.ts <data_model/<ver>/device_types> <version>\n",
    );
    process.exit(2);
  }

  const types: DeviceType[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".xml")) {
      continue;
    }
    const parsed = parseDeviceType(readFileSync(join(dir, file), "utf8"));
    if (parsed !== null) {
      types.push(parsed);
    }
  }
  types.sort((a, b) => a.id - b.id);

  const hex = (n: number): string => `0x${n.toString(16).padStart(4, "0")}`;
  const entries = types
    .map((t) => {
      const clusters = t.serverClusters
        .map((c) => `      { id: ${hex(c.id)}, name: ${JSON.stringify(c.name)}, conformance: "${c.conformance}" },`)
        .join("\n");
      return `  ${hex(t.id)}: {\n    id: ${hex(t.id)},\n    name: ${JSON.stringify(t.name)},\n    revision: ${t.revision},\n    serverClusters: [\n${clusters}\n    ],\n  },`;
    })
    .join("\n");

  const out = `// GENERATED FILE - do not edit by hand.
// Produced by scripts/generate-matter-device-types.ts from the Matter Device Library
// (connectedhomeip data_model ${version}). Regenerate rather than editing.

export type ClusterConformance = "mandatory" | "optional";

export interface MatterDeviceTypeCluster {
  id: number;
  name: string;
  conformance: ClusterConformance;
}

export interface MatterDeviceType {
  id: number;
  name: string;
  revision: number;
  serverClusters: MatterDeviceTypeCluster[];
}

export const MATTER_DATA_MODEL_VERSION = ${JSON.stringify(version)};

export const MATTER_DEVICE_TYPES: Record<number, MatterDeviceType> = {
${entries}
};
`;
  process.stdout.write(out);
}

main();
