import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BOARD_RECORD_SCHEMA,
  parseHilSuiteOutput,
  recordPassed,
  renderBoardTable,
  tierForRecord,
  tierForRecords,
  validateRecord,
  type BoardConformanceRecord,
} from "../src/board.js";

function record(overrides: Partial<BoardConformanceRecord> = {}): BoardConformanceRecord {
  return {
    schema: BOARD_RECORD_SCHEMA,
    chip: "esp32-c6",
    bsp: "esp32",
    deviceClass: "thermostat",
    suite: "thermostat/hil (hardware)",
    checksPassed: 5,
    checksTotal: 5,
    commit: "abc1234",
    toolchain: "esp-idf-5.3.1",
    date: "2026-07-26",
    submitter: "tester",
    ...overrides,
  };
}

test("a passing community record is community-verified", () => {
  const r = record();
  assert.equal(recordPassed(r), true);
  assert.equal(tierForRecord(r), "community-verified");
});

test("a maintainer-verified passing record is verified", () => {
  assert.equal(tierForRecord(record({ maintainerVerified: true })), "verified");
});

test("a failing record is experimental regardless of who submitted it", () => {
  assert.equal(tierForRecord(record({ checksPassed: 4, checksTotal: 5, maintainerVerified: true })), "experimental");
});

test("tierForRecords takes the best available tier", () => {
  const records = [record(), record({ maintainerVerified: true }), record({ checksPassed: 0 })];
  assert.equal(tierForRecords(records), "verified");
});

test("parseHilSuiteOutput reads the hardware suite result", () => {
  const log = [
    "running suite: thermostat/twin",
    "suite thermostat/twin: 5 checks, 0 failure(s)",
    "running suite: thermostat/hil (hardware)",
    "suite thermostat/hil (hardware): 5 checks, 0 failure(s)",
  ].join("\n");
  const result = parseHilSuiteOutput(log);
  assert.equal(result?.checksTotal, 5);
  assert.equal(result?.checksPassed, 5);
  assert.ok(result?.suite.includes("hil"));
});

test("parseHilSuiteOutput counts failures and ignores the twin line", () => {
  const log = "suite thermostat/hil (hardware): 5 checks, 2 failure(s)";
  const result = parseHilSuiteOutput(log);
  assert.equal(result?.checksPassed, 3);
});

test("parseHilSuiteOutput returns null when no hardware run is present", () => {
  assert.equal(parseHilSuiteOutput("suite thermostat/twin: 5 checks, 0 failure(s)"), null);
});

test("validateRecord accepts a good record and flags a bad one", () => {
  assert.deepEqual(validateRecord(record()), []);
  const errors = validateRecord({ schema: "wrong", chip: "" });
  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => e.includes("schema")));
});

test("renderBoardTable summarizes one row per chip at its best tier", () => {
  const table = renderBoardTable([record(), record({ maintainerVerified: true })]);
  assert.ok(table.includes("esp32-c6"));
  assert.ok(table.includes("verified"));
});
