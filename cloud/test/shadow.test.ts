import assert from "node:assert/strict";
import { test } from "node:test";
import { DeviceShadow } from "../src/shadow.js";

test("stores the latest sample per metric", () => {
  const shadow = new DeviceShadow();
  shadow.apply("a", { metric: "temperature_sensor", value: 20, unit: "celsius" }, 1);
  shadow.apply("a", { metric: "temperature_sensor", value: 22, unit: "celsius" }, 2);
  shadow.apply("a", { metric: "battery", value: 90, unit: "percent" }, 2);

  const state = shadow.get("a");
  assert.ok(state);
  assert.equal(state.temperature_sensor?.value, 22);
  assert.equal(state.temperature_sensor?.updatedAt, 2);
  assert.equal(state.battery?.value, 90);
});

test("returns undefined for an unknown device", () => {
  const shadow = new DeviceShadow();
  assert.equal(shadow.get("nope"), undefined);
});
