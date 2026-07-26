// CLI for board conformance records:
//
//   openhome-board record --chip <c> --bsp <b> --class <cls> --commit <sha> \
//     --toolchain <t> --submitter <name> [--maintainer] [--notes <text>] < hil-run.log
//   openhome-board list <dir>
//
// `record` reads an acceptance HIL run on stdin, parses its pass/fail counts, and emits a record
// JSON. `list` reads committed records under a directory and prints the supported-boards table.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  BOARD_RECORD_SCHEMA,
  renderBoardTable,
  validateRecord,
  type BoardConformanceRecord,
} from "./board.js";
import { parseHilSuiteOutput } from "./board.js";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function readStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function recordCommand(args: string[]): void {
  const required = ["chip", "bsp", "class", "commit", "toolchain", "submitter"] as const;
  const values: Record<string, string> = {};
  for (const name of required) {
    const value = flag(args, name);
    if (value === undefined) {
      process.stderr.write(`missing --${name}\n`);
      process.exit(2);
    }
    values[name] = value;
  }

  const suiteOutput = readStdin();
  const result = parseHilSuiteOutput(suiteOutput);
  if (result === null) {
    process.stderr.write(
      "could not find a HIL suite result on stdin; pipe the acceptance run, e.g.\n" +
        "  OPENHOME_HIL_PORT=/dev/tty.usbmodemXXXX make -C tests/suites/thermostat run | openhome-board record ...\n",
    );
    process.exit(2);
  }

  const record: BoardConformanceRecord = {
    schema: BOARD_RECORD_SCHEMA,
    chip: values["chip"] as string,
    bsp: values["bsp"] as string,
    deviceClass: values["class"] as string,
    suite: result.suite,
    checksPassed: result.checksPassed,
    checksTotal: result.checksTotal,
    commit: values["commit"] as string,
    toolchain: values["toolchain"] as string,
    date: flag(args, "date") ?? new Date().toISOString().slice(0, 10),
    submitter: values["submitter"] as string,
    ...(args.includes("--maintainer") ? { maintainerVerified: true } : {}),
    ...(flag(args, "notes") !== undefined ? { notes: flag(args, "notes") as string } : {}),
  };
  process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
}

function collectRecords(dir: string): BoardConformanceRecord[] {
  const records: BoardConformanceRecord[] = [];
  const walk = (path: string): void => {
    for (const entry of readdirSync(path)) {
      const full = join(path, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith(".json")) {
        const parsed: unknown = JSON.parse(readFileSync(full, "utf8"));
        const errors = validateRecord(parsed);
        if (errors.length === 0) {
          records.push(parsed as BoardConformanceRecord);
        } else {
          process.stderr.write(`skipping invalid record ${full}: ${errors.join("; ")}\n`);
        }
      }
    }
  };
  walk(dir);
  return records;
}

function listCommand(args: string[]): void {
  const dir = args[0];
  if (dir === undefined) {
    process.stderr.write("usage: openhome-board list <dir>\n");
    process.exit(2);
  }
  process.stdout.write(`${renderBoardTable(collectRecords(dir))}\n`);
}

function main(): void {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "record") {
    recordCommand(rest);
  } else if (command === "list") {
    listCommand(rest);
  } else {
    process.stderr.write("usage: openhome-board <record|list> ...\n");
    process.exit(2);
  }
}

main();
