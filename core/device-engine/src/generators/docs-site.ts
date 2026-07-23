// Emits a self-contained static documentation site from the manifest. Where the Markdown
// generator produces a single reference file, this backend produces a browsable multi-page
// site (overview, capabilities, telemetry schema) so a device's docs are a generated,
// publishable artifact that opens in any browser with no external assets or network access.

import type { Capability, DeviceIR, SensorCapability } from "../schema.js";
import type { GeneratedFile, Generator } from "./index.js";

interface Page {
  slug: string;
  title: string;
  body: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sensors(ir: DeviceIR): SensorCapability[] {
  return ir.capabilities.filter((cap): cap is SensorCapability => cap.kind === "sensor");
}

function layout(deviceName: string, page: Page, pages: Page[]): string {
  const nav = pages
    .map((p) => {
      const current = p.slug === page.slug ? ' aria-current="page"' : "";
      const href = p.slug === "index" ? "index.html" : `${p.slug}.html`;
      return `      <a href="${href}"${current}>${escapeHtml(p.title)}</a>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(deviceName)} - ${escapeHtml(page.title)}</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<header class="site-header">
  <div class="site-wordmark">
    <span class="site-mark">OpenHome</span>
    <span class="site-device">${escapeHtml(deviceName)}</span>
  </div>
  <nav class="site-nav">
${nav}
  </nav>
</header>
<main class="site-main">
${page.body}
</main>
<footer class="site-footer">
  <p>Generated from the device manifest by OpenHome Studio. Do not edit by hand.</p>
</footer>
</body>
</html>
`;
}

function overviewPage(ir: DeviceIR): Page {
  const { device } = ir;
  const power =
    ir.power.battery !== null
      ? `battery (${ir.power.battery.rechargeable ? "rechargeable" : "non-rechargeable"})`
      : "mains or unspecified";
  const protocols =
    ir.connectivity.protocols.length > 0
      ? ir.connectivity.protocols.map((p) => `<li>${escapeHtml(p)}</li>`).join("")
      : "<li>none declared</li>";

  const facts = [
    ["Category", escapeHtml(device.category)],
    ["Manufacturer", escapeHtml(device.manufacturer ?? "unspecified")],
    ["Capabilities", String(ir.capabilities.length)],
    ["Power", escapeHtml(power)],
    ["Encryption", ir.security.encryption.enabled ? "enabled" : "disabled"],
  ]
    .map(([term, value]) => `    <div class="fact"><dt>${term}</dt><dd>${value}</dd></div>`)
    .join("\n");

  const body = `  <section class="hero">
    <p class="eyebrow">Device documentation</p>
    <h1>${escapeHtml(device.name)}</h1>
    <p class="lede">Everything on this site is derived from a single device manifest. The
    firmware interface, cloud API, tests, and these pages all share one source of truth.</p>
  </section>
  <section class="panel">
    <h2>At a glance</h2>
    <dl class="facts">
${facts}
    </dl>
  </section>
  <section class="panel">
    <h2>Connectivity</h2>
    <ul class="tags">${protocols}</ul>
  </section>`;

  return { slug: "index", title: "Overview", body };
}

function capabilitiesPage(ir: DeviceIR): Page {
  let rows: string;
  if (ir.capabilities.length === 0) {
    rows = '      <tr><td colspan="4">This device declares no capabilities.</td></tr>';
  } else {
    rows = ir.capabilities
      .map((cap: Capability) => {
        if (cap.kind === "sensor") {
          const unit = escapeHtml(cap.unit ?? "-");
          const range = cap.range !== null ? `${cap.range.min} to ${cap.range.max}` : "-";
          return `      <tr><td><code>${escapeHtml(cap.key)}</code></td><td><span class="chip chip-sensor">sensor</span></td><td>${unit}</td><td>${escapeHtml(range)}</td></tr>`;
        }
        return `      <tr><td><code>${escapeHtml(cap.key)}</code></td><td><span class="chip chip-actuator">actuator</span></td><td>-</td><td>${escapeHtml(cap.modes.join(", "))}</td></tr>`;
      })
      .join("\n");
  }

  const body = `  <section class="panel">
    <h1>Capabilities</h1>
    <p class="lede">Each capability resolves to a driver through the hardware abstraction
    layer and generates a matching firmware function and cloud contract.</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Capability</th><th>Type</th><th>Unit</th><th>Range or modes</th></tr>
        </thead>
        <tbody>
${rows}
        </tbody>
      </table>
    </div>
  </section>`;

  return { slug: "capabilities", title: "Capabilities", body };
}

function telemetryPage(ir: DeviceIR): Page {
  const sensorList = sensors(ir);
  const first = sensorList[0];
  let body: string;
  if (first === undefined) {
    body = `  <section class="panel">
    <h1>Telemetry</h1>
    <p class="lede">This device declares no sensors, so it reports no telemetry.</p>
  </section>`;
  } else {
    const rows = sensorList
      .map((cap) => {
        const unit = escapeHtml(cap.unit ?? "-");
        return `      <tr><td><code>${escapeHtml(cap.key)}</code></td><td>number</td><td>${unit}</td></tr>`;
      })
      .join("\n");
    const example = JSON.stringify(
      { metric: first.key, value: first.range !== null ? first.range.min : 0, unit: first.unit ?? null },
      null,
      2,
    );

    body = `  <section class="panel">
    <h1>Telemetry</h1>
    <p class="lede">Sensors report samples in a single shape shared by the firmware sink,
    the telemetry bridge, and the cloud device shadow.</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Metric</th><th>Value type</th><th>Unit</th></tr>
        </thead>
        <tbody>
${rows}
        </tbody>
      </table>
    </div>
    <h2>Sample</h2>
    <pre class="code"><code>${escapeHtml(example)}</code></pre>
  </section>`;
  }

  return { slug: "telemetry", title: "Telemetry", body };
}

const STYLES = `:root {
  color-scheme: light dark;
  --bg: #f6f7f9;
  --surface: #ffffff;
  --border: #dfe3ea;
  --ink: #1a2230;
  --muted: #5a6675;
  --accent: #0d8f9c;
  --accent-soft: #e2f4f5;
  --sensor: #0d8f9c;
  --actuator: #b4640e;
  --radius: 10px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f141b;
    --surface: #171e28;
    --border: #2a3542;
    --ink: #e7ecf2;
    --muted: #9aa7b6;
    --accent: #35c2cf;
    --accent-soft: #123138;
    --sensor: #35c2cf;
    --actuator: #e0a35a;
  }
}
:root[data-theme="light"] {
  --bg: #f6f7f9;
  --surface: #ffffff;
  --border: #dfe3ea;
  --ink: #1a2230;
  --muted: #5a6675;
  --accent: #0d8f9c;
  --accent-soft: #e2f4f5;
  --sensor: #0d8f9c;
  --actuator: #b4640e;
}
:root[data-theme="dark"] {
  --bg: #0f141b;
  --surface: #171e28;
  --border: #2a3542;
  --ink: #e7ecf2;
  --muted: #9aa7b6;
  --accent: #35c2cf;
  --accent-soft: #123138;
  --sensor: #35c2cf;
  --actuator: #e0a35a;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 16px/1.6 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}
.site-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem clamp(1rem, 4vw, 3rem);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.site-wordmark { display: flex; align-items: baseline; gap: 0.6rem; }
.site-mark { font-weight: 700; letter-spacing: 0.02em; color: var(--accent); }
.site-device { color: var(--muted); font-variant-numeric: tabular-nums; }
.site-nav { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.site-nav a {
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  color: var(--muted);
  text-decoration: none;
}
.site-nav a:hover { color: var(--ink); }
.site-nav a[aria-current="page"] { background: var(--accent-soft); color: var(--accent); }
.site-main {
  max-width: 60rem;
  margin: 0 auto;
  padding: clamp(1.5rem, 4vw, 3rem);
  display: grid;
  gap: 1.5rem;
}
.hero { padding: 1rem 0; }
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.75rem;
  color: var(--accent);
  margin: 0 0 0.5rem;
}
.hero h1 { font-size: clamp(2rem, 6vw, 3rem); margin: 0; text-wrap: balance; }
.lede { color: var(--muted); max-width: 40rem; }
.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: clamp(1rem, 3vw, 1.75rem);
}
.panel h1 { margin-top: 0; }
.panel h2 { margin-top: 0; font-size: 1.1rem; }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 1rem; margin: 0; }
.fact dt { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.fact dd { margin: 0.2rem 0 0; font-size: 1.15rem; font-weight: 600; }
.tags { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 0.5rem; }
.tags li {
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg);
  font-size: 0.9rem;
}
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--border); }
th { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
.chip { padding: 0.15rem 0.55rem; border-radius: 999px; font-size: 0.8rem; font-weight: 600; }
.chip-sensor { background: var(--accent-soft); color: var(--sensor); }
.chip-actuator { background: var(--accent-soft); color: var(--actuator); }
.code {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
  overflow-x: auto;
}
.site-footer {
  max-width: 60rem;
  margin: 0 auto;
  padding: 1.5rem clamp(1rem, 4vw, 3rem) 3rem;
  color: var(--muted);
  font-size: 0.85rem;
}
`;

export const docsSiteGenerator: Generator = {
  name: "docs-site",
  generate(ir: DeviceIR): GeneratedFile[] {
    const pages = [overviewPage(ir), capabilitiesPage(ir), telemetryPage(ir)];
    const base = `docs/site/${ir.device.name}`;
    const files: GeneratedFile[] = pages.map((page) => ({
      path: `${base}/${page.slug}.html`,
      contents: layout(ir.device.name, page, pages),
    }));
    files.push({ path: `${base}/styles.css`, contents: STYLES });
    return files;
  },
};
