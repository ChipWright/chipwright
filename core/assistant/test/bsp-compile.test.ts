import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { compileBsp, type BspFile } from "../src/bsp-compile.js";

const SDK = resolve(fileURLToPath(new URL("../../../sdk/firmware", import.meta.url)));

// A minimal BSP that implements the HAL and needs no vendor headers, so it compiles on the
// host exactly as the native BSP does.
const GOOD_BSP: BspFile[] = [
  {
    path: "widget_bsp.h",
    content:
      '#ifndef WIDGET_BSP_H\n#define WIDGET_BSP_H\n#include "chipwright/sdk.h"\ncw_status_t cw_widget_bsp_register(void);\n#endif\n',
  },
  {
    path: "widget_bsp.c",
    content:
      '#include "widget_bsp.h"\n#include "chipwright/hal.h"\n' +
      "static cw_status_t widget_read(void *ctx, float *out) {\n  (void)ctx;\n  *out = 42.0f;\n  return CW_OK;\n}\n" +
      "cw_status_t cw_widget_bsp_register(void) {\n" +
      "  const cw_sensor_driver_t s = {.read = widget_read, .ctx = NULL};\n" +
      '  return cw_hal_register_sensor("temperature_sensor", "celsius", s);\n}\n',
  },
];

test("a well-formed BSP compiles against the real HAL", async () => {
  const result = await compileBsp(GOOD_BSP, { sdkFirmwareDir: SDK });
  assert.equal(result.ok, true, result.output);
});

test("a BSP that does not type-check fails the compile check", async () => {
  const broken: BspFile[] = [
    {
      path: "widget_bsp.c",
      content:
        '#include "chipwright/hal.h"\ncw_status_t cw_widget_bsp_register(void) {\n  return no_such_function();\n}\n',
    },
  ];
  const result = await compileBsp(broken, { sdkFirmwareDir: SDK });
  assert.equal(result.ok, false);
  assert.match(result.output, /no_such_function|implicit/);
});

test("a draft with no source file is rejected", async () => {
  const result = await compileBsp([{ path: "readme.txt", content: "hi" }], { sdkFirmwareDir: SDK });
  assert.equal(result.ok, false);
  assert.match(result.output, /no \.c source/);
});

test("an unsafe file path is rejected before compiling", async () => {
  const result = await compileBsp([{ path: "../escape.c", content: "int x;" }], { sdkFirmwareDir: SDK });
  assert.equal(result.ok, false);
  assert.match(result.output, /unsafe file path/);
});
