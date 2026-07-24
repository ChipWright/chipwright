import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultTools, type ToolContext, type DeviceProposal } from "../src/tools.js";
import { VALID_MANIFEST, INVALID_MANIFEST } from "./fixture.js";

function tool(name: string) {
  const found = defaultTools().find((t) => t.schema.name === name);
  assert.ok(found, `tool ${name} exists`);
  return found;
}

function newContext(files: Record<string, string> = {}): ToolContext {
  return {
    proposals: [] as DeviceProposal[],
    readFile: (path) =>
      path in files ? Promise.resolve(files[path] as string) : Promise.reject(new Error("not found")),
  };
}

test("validate_manifest reports validity against the real DDL", async () => {
  const ok = JSON.parse(await tool("validate_manifest").handler({ yaml: VALID_MANIFEST }, newContext()));
  assert.equal(ok.valid, true);
  assert.equal(ok.deviceName, "smart_thermostat");

  const bad = JSON.parse(await tool("validate_manifest").handler({ yaml: INVALID_MANIFEST }, newContext()));
  assert.equal(bad.valid, false);
  assert.ok(bad.diagnostics.length > 0);
});

test("compile_manifest lists the generated artifacts", async () => {
  const result = JSON.parse(await tool("compile_manifest").handler({ yaml: VALID_MANIFEST }, newContext()));
  assert.equal(result.valid, true);
  assert.ok(result.files.length >= 4);
  assert.ok(result.files.some((f: string) => f.endsWith(".h")));
});

test("propose_device records a valid manifest and rejects an invalid one", async () => {
  const context = newContext();
  const accepted = await tool("propose_device").handler(
    { yaml: VALID_MANIFEST, summary: "add thermostat" },
    context,
  );
  assert.match(accepted, /accepted/);
  assert.equal(context.proposals.length, 1);
  assert.equal(context.proposals[0]?.deviceName, "smart_thermostat");

  const rejected = await tool("propose_device").handler(
    { yaml: INVALID_MANIFEST, summary: "broken" },
    context,
  );
  assert.match(rejected, /rejected/);
  assert.equal(context.proposals.length, 1, "an invalid proposal is never recorded");
});

test("read_device returns file contents through the injected reader", async () => {
  const context = newContext({ "device.yaml": VALID_MANIFEST });
  assert.equal(await tool("read_device").handler({ path: "device.yaml" }, context), VALID_MANIFEST);
  assert.match(await tool("read_device").handler({ path: "missing.yaml" }, context), /error/);
});

test("list_templates returns built-in templates with manifests", async () => {
  const templates = JSON.parse(await tool("list_templates").handler({}, newContext()));
  assert.ok(templates.length > 0);
  assert.ok(templates[0].id && templates[0].yaml);
});
