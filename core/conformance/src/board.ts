// Board conformance: evidence that a BSP actually ran the acceptance suite on real silicon, and a
// support tier derived from that evidence rather than asserted. This is the hardware analogue of
// device-class conformance: one says a definition is a valid thermostat, the other says a board
// truly runs it. The "supported boards" view is just the rendered set of these records.

export const BOARD_RECORD_SCHEMA = "openhome-board-conformance/1";

// One run of the acceptance suite against a real board. Committed alongside the BSP as its proof.
export interface BoardConformanceRecord {
  schema: string;
  chip: string;
  bsp: string;
  deviceClass: string;
  suite: string;
  checksPassed: number;
  checksTotal: number;
  commit: string;
  toolchain: string;
  date: string;
  submitter: string;
  // Set by a maintainer after review. A future step replaces this flag with a signed record so
  // the "verified" tier cannot be self-asserted.
  maintainerVerified?: boolean;
  notes?: string;
}

export type SupportTier = "experimental" | "community-verified" | "verified";

const TIER_ORDER: SupportTier[] = ["experimental", "community-verified", "verified"];

// A record passes when every check ran and none failed.
export function recordPassed(record: BoardConformanceRecord): boolean {
  return record.checksTotal > 0 && record.checksPassed === record.checksTotal;
}

// The tier a single record earns from its evidence: a passing community submission is
// community-verified, a passing record a maintainer has verified is verified, anything else
// (no run, or a failing run) is experimental.
export function tierForRecord(record: BoardConformanceRecord): SupportTier {
  if (!recordPassed(record)) {
    return "experimental";
  }
  return record.maintainerVerified === true ? "verified" : "community-verified";
}

// The best tier across several records for the same board.
export function tierForRecords(records: readonly BoardConformanceRecord[]): SupportTier {
  let best: SupportTier = "experimental";
  for (const record of records) {
    const tier = tierForRecord(record);
    if (TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(best)) {
      best = tier;
    }
  }
  return best;
}

// Validates the shape of a parsed record, returning error messages (empty when valid).
export function validateRecord(value: unknown): string[] {
  if (typeof value !== "object" || value === null) {
    return ["record must be an object"];
  }
  const record = value as Record<string, unknown>;
  const errors: string[] = [];
  if (record["schema"] !== BOARD_RECORD_SCHEMA) {
    errors.push(`schema must be "${BOARD_RECORD_SCHEMA}"`);
  }
  for (const field of ["chip", "bsp", "deviceClass", "suite", "commit", "toolchain", "date", "submitter"]) {
    if (typeof record[field] !== "string" || (record[field] as string).length === 0) {
      errors.push(`${field} is required and must be a non-empty string`);
    }
  }
  for (const field of ["checksPassed", "checksTotal"]) {
    if (typeof record[field] !== "number" || !Number.isInteger(record[field])) {
      errors.push(`${field} must be an integer`);
    }
  }
  return errors;
}

export interface SuiteResult {
  suite: string;
  checksTotal: number;
  checksPassed: number;
}

// Parses the acceptance runner's output for the hardware (HIL) suite result. The C runner prints
// "suite <name>: <N> checks, <M> failure(s)"; the hardware run's name contains "hil". This lets a
// contributor pipe a real HIL run straight into a record rather than transcribing numbers.
export function parseHilSuiteOutput(text: string): SuiteResult | null {
  const re = /suite\s+(\S.*?):\s+(\d+)\s+checks?,\s+(\d+)\s+failure/gi;
  for (let match = re.exec(text); match !== null; match = re.exec(text)) {
    const name = (match[1] ?? "").trim();
    if (!/hil/i.test(name)) {
      continue;
    }
    const total = Number(match[2] ?? "0");
    const failures = Number(match[3] ?? "0");
    return { suite: name, checksTotal: total, checksPassed: total - failures };
  }
  return null;
}

// Renders records as a supported-boards table, one row per chip at its best earned tier.
export function renderBoardTable(records: readonly BoardConformanceRecord[]): string {
  const byChip = new Map<string, BoardConformanceRecord[]>();
  for (const record of records) {
    const list = byChip.get(record.chip) ?? [];
    list.push(record);
    byChip.set(record.chip, list);
  }
  if (byChip.size === 0) {
    return "no board conformance records found";
  }
  const rows = [...byChip.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([chip, list]) => {
      const tier = tierForRecords(list);
      const latest = list.reduce((a, b) => (a.date >= b.date ? a : b));
      const checks = `${latest.checksPassed}/${latest.checksTotal}`;
      return `  ${chip.padEnd(12)} ${tier.padEnd(18)} ${latest.deviceClass.padEnd(12)} ${checks.padEnd(8)} ${latest.commit}`;
    });
  const header = `  ${"chip".padEnd(12)} ${"tier".padEnd(18)} ${"class".padEnd(12)} ${"checks".padEnd(8)} commit`;
  return ["supported boards:", header, ...rows].join("\n");
}
