// Webview UI script. It runs sandboxed in the panel with no Node or VS Code access, and
// talks to the extension host only through postMessage. The designer view renders the
// manifest state the host validates and generates; the twin view sends run controls to the
// host and plots the telemetry samples the host streams back from the twin binary. All real
// work happens in the host via the studio core; this script only draws and forwards intent.

(function () {
  const vscode = acquireVsCodeApi();

  const tabs = document.querySelectorAll(".tab");
  const views = {
    designer: document.getElementById("view-designer"),
    twin: document.getElementById("view-twin"),
  };

  function showTab(name) {
    for (const tab of tabs) {
      tab.setAttribute("aria-current", String(tab.dataset.tab === name));
    }
    for (const key of Object.keys(views)) {
      views[key].hidden = key !== name;
    }
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => showTab(tab.dataset.tab));
  }

  document.getElementById("refresh").addEventListener("click", () => {
    vscode.postMessage({ type: "refresh" });
  });

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Designer view: rendered fresh from each state the host sends.

  function renderDesigner(state) {
    const badge = state.valid
      ? '<span class="badge ok">valid</span>'
      : '<span class="badge error">invalid</span>';
    const name = state.deviceName ? escapeHtml(state.deviceName) : "unknown device";

    const diagnostics =
      state.diagnostics.length === 0
        ? '<p class="muted">No diagnostics.</p>'
        : '<ul class="diagnostics">' +
          state.diagnostics
            .map((d) => {
              const where = d.path ? escapeHtml(d.path) : "manifest";
              return `<li class="diag ${escapeHtml(d.severity)}"><code>${where}</code> ${escapeHtml(d.message)}</li>`;
            })
            .join("") +
          "</ul>";

    const files =
      state.files.length === 0
        ? '<p class="muted">No artifacts generated.</p>'
        : '<ul class="files">' +
          state.files.map((f) => `<li><code>${escapeHtml(f)}</code></li>`).join("") +
          "</ul>";

    views.designer.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <h1>${name}</h1>
          ${badge}
        </div>
        <p class="muted">Source: <code>${escapeHtml(state.source)}</code></p>
      </div>
      <div class="panel">
        <h2>Diagnostics</h2>
        ${diagnostics}
      </div>
      <div class="panel">
        <h2>Generated artifacts <span class="count">${state.files.length}</span></h2>
        ${files}
      </div>`;
  }

  // Twin view: built once so the canvas and control state persist across samples.

  const twin = { samples: [], faultAt: -1, running: false };

  views.twin.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h1>Twin debugger</h1>
        <span class="badge" id="twin-badge">idle</span>
      </div>
      <div class="controls">
        <label>Fault
          <select id="twin-fault">
            <option value="none">none</option>
            <option value="stuck">stuck</option>
            <option value="fail">fail</option>
            <option value="offset">offset</option>
          </select>
        </label>
        <label>At tick <input id="twin-fault-at" type="number" min="0" value="6" /></label>
        <label>Offset <input id="twin-offset" type="number" step="0.5" value="5" /></label>
        <button class="refresh" id="twin-start">Start</button>
        <button class="ghost" id="twin-stop">Stop</button>
      </div>
      <p class="muted" id="twin-status">Start the twin to stream live telemetry.</p>
    </div>
    <div class="panel">
      <div class="panel-head">
        <h2>Temperature</h2>
        <span class="reading" id="twin-reading">--</span>
      </div>
      <canvas id="twin-chart" width="640" height="240"></canvas>
    </div>`;

  const faultSelect = document.getElementById("twin-fault");
  const faultAtInput = document.getElementById("twin-fault-at");
  const offsetInput = document.getElementById("twin-offset");
  const badge = document.getElementById("twin-badge");
  const status = document.getElementById("twin-status");
  const reading = document.getElementById("twin-reading");
  const canvas = document.getElementById("twin-chart");

  function setRunning(running) {
    twin.running = running;
    badge.textContent = running ? "running" : "idle";
    badge.classList.toggle("ok", running);
    document.getElementById("twin-start").disabled = running;
    document.getElementById("twin-stop").disabled = !running;
  }

  document.getElementById("twin-start").addEventListener("click", () => {
    twin.samples = [];
    const fault = faultSelect.value;
    twin.faultAt = fault === "none" ? -1 : Number(faultAtInput.value);
    reading.textContent = "--";
    drawChart();
    vscode.postMessage({
      type: "startTwin",
      fault,
      faultAt: Number(faultAtInput.value),
      offset: Number(offsetInput.value),
    });
  });

  document.getElementById("twin-stop").addEventListener("click", () => {
    vscode.postMessage({ type: "stopTwin" });
  });

  function cssVar(name, fallback) {
    const value = getComputedStyle(document.body).getPropertyValue(name).trim();
    return value.length > 0 ? value : fallback;
  }

  function drawChart() {
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const pad = 28;
    ctx.clearRect(0, 0, width, height);

    const grid = cssVar("--vscode-panel-border", "rgba(128,128,128,0.35)");
    const accent = "#0d8f9c";
    const ink = cssVar("--vscode-foreground", "#ccc");

    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.strokeRect(pad, pad / 2, width - pad * 1.5, height - pad * 1.5);

    const values = twin.samples;
    if (values.length === 0) {
      return;
    }

    let min = Math.min.apply(null, values);
    let max = Math.max.apply(null, values);
    if (max - min < 1) {
      const mid = (max + min) / 2;
      min = mid - 0.5;
      max = mid + 0.5;
    }

    const plotW = width - pad * 1.5 - pad;
    const plotH = height - pad * 1.5 - pad / 2;
    const x = (i) => pad + (values.length === 1 ? 0 : (i / (values.length - 1)) * plotW);
    const y = (v) => pad / 2 + plotH - ((v - min) / (max - min)) * plotH;

    // Fault marker.
    if (twin.faultAt >= 0 && twin.faultAt < values.length) {
      ctx.strokeStyle = cssVar("--vscode-errorForeground", "#f14c4c");
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x(twin.faultAt), pad / 2);
      ctx.lineTo(x(twin.faultAt), pad / 2 + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((v, i) => {
      const px = x(i);
      const py = y(v);
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    });
    ctx.stroke();

    ctx.fillStyle = ink;
    ctx.font = "11px sans-serif";
    ctx.fillText(max.toFixed(1), 2, pad / 2 + 4);
    ctx.fillText(min.toFixed(1), 2, pad / 2 + plotH);
  }

  setRunning(false);
  drawChart();

  window.addEventListener("message", (event) => {
    const message = event.data;
    switch (message.type) {
      case "state":
        renderDesigner(message);
        break;
      case "focus":
        showTab(message.tab);
        break;
      case "twinStarted":
        setRunning(true);
        status.textContent = "Streaming telemetry from the twin.";
        break;
      case "twinStatus":
        status.textContent = message.message;
        break;
      case "sample":
        twin.samples.push(message.value);
        reading.textContent = `${message.value.toFixed(2)} ${message.unit}`;
        drawChart();
        break;
      case "twinExit":
        setRunning(false);
        status.textContent = "Twin run complete.";
        break;
      case "twinError":
        setRunning(false);
        status.textContent = message.message;
        break;
    }
  });

  vscode.postMessage({ type: "ready" });
})();
