// Webview UI script. It runs sandboxed in the panel with no Node or VS Code access, and
// talks to the extension host only through postMessage. The designer edits the device as a
// form and asks the host to recompile the manifest on every change; the twin view sends run
// controls and plots the telemetry the host streams from the twin binary. All real work
// (compiling, saving, running the twin) happens in the host via the studio core.

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

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    for (const key of Object.keys(attrs || {})) {
      if (key === "class") {
        node.className = attrs[key];
      } else if (key === "text") {
        node.textContent = attrs[key];
      } else {
        node.setAttribute(key, attrs[key]);
      }
    }
    for (const child of children || []) {
      node.appendChild(child);
    }
    return node;
  }

  // --- Designer -------------------------------------------------------------------------

  const designer = { form: null, protocols: [] };
  let applyTimer = null;

  function scheduleApply() {
    if (applyTimer !== null) {
      clearTimeout(applyTimer);
    }
    applyTimer = setTimeout(() => {
      vscode.postMessage({ type: "applyForm", form: designer.form });
    }, 200);
  }

  function field(labelText, input) {
    return el("label", { class: "field" }, [el("span", { text: labelText }), input]);
  }

  function textInput(value, onChange) {
    const input = el("input", { type: "text", value: value || "" });
    input.addEventListener("input", () => onChange(input.value));
    return input;
  }

  function numberInput(value, onChange) {
    const input = el("input", { type: "number", value: value === null ? "" : String(value) });
    input.addEventListener("input", () => {
      onChange(input.value === "" ? null : Number(input.value));
    });
    return input;
  }

  function renderCapabilities(container) {
    container.textContent = "";
    designer.form.capabilities.forEach((cap, index) => {
      const kindSelect = el("select", {}, [
        el("option", { value: "sensor", text: "sensor" }),
        el("option", { value: "actuator", text: "actuator" }),
      ]);
      kindSelect.value = cap.kind;
      kindSelect.addEventListener("change", () => {
        designer.form.capabilities[index] =
          kindSelect.value === "sensor"
            ? { key: cap.key, kind: "sensor", unit: "", min: null, max: null }
            : { key: cap.key, kind: "actuator", modes: [] };
        renderCapabilities(container);
        scheduleApply();
      });

      const detail =
        cap.kind === "sensor"
          ? [
              field("Unit", textInput(cap.unit, (v) => {
                cap.unit = v;
                scheduleApply();
              })),
              field("Min", numberInput(cap.min, (v) => {
                cap.min = v;
                scheduleApply();
              })),
              field("Max", numberInput(cap.max, (v) => {
                cap.max = v;
                scheduleApply();
              })),
            ]
          : [
              field(
                "Modes (comma separated)",
                textInput(cap.modes.join(", "), (v) => {
                  cap.modes = v
                    .split(",")
                    .map((m) => m.trim())
                    .filter((m) => m.length > 0);
                  scheduleApply();
                }),
              ),
            ];

      const remove = el("button", { class: "ghost", text: "Remove" }, []);
      remove.addEventListener("click", () => {
        designer.form.capabilities.splice(index, 1);
        renderCapabilities(container);
        scheduleApply();
      });

      const row = el("div", { class: "cap-row" }, [
        field("Key", textInput(cap.key, (v) => {
          cap.key = v;
          scheduleApply();
        })),
        field("Type", kindSelect),
        ...detail,
        remove,
      ]);
      container.appendChild(row);
    });
  }

  function renderDesigner() {
    const form = designer.form;
    const view = views.designer;
    view.textContent = "";

    // Device section.
    const devicePanel = el("div", { class: "panel" }, [
      el("h2", { text: "Device" }),
      el("div", { class: "grid" }, [
        field("Name", textInput(form.name, (v) => {
          form.name = v;
          scheduleApply();
        })),
        field("Category", textInput(form.category, (v) => {
          form.category = v;
          scheduleApply();
        })),
        field("Manufacturer", textInput(form.manufacturer, (v) => {
          form.manufacturer = v;
          scheduleApply();
        })),
      ]),
    ]);

    // Capabilities section.
    const capContainer = el("div", { class: "caps" }, []);
    renderCapabilities(capContainer);
    const addSensor = el("button", { class: "ghost", text: "Add sensor" }, []);
    addSensor.addEventListener("click", () => {
      form.capabilities.push({ key: "", kind: "sensor", unit: "", min: null, max: null });
      renderCapabilities(capContainer);
      scheduleApply();
    });
    const addActuator = el("button", { class: "ghost", text: "Add actuator" }, []);
    addActuator.addEventListener("click", () => {
      form.capabilities.push({ key: "", kind: "actuator", modes: [] });
      renderCapabilities(capContainer);
      scheduleApply();
    });
    const capPanel = el("div", { class: "panel" }, [
      el("h2", { text: "Capabilities" }),
      capContainer,
      el("div", { class: "controls" }, [addSensor, addActuator]),
    ]);

    // Connectivity section.
    const protoBoxes = designer.protocols.map((proto) => {
      const box = el("input", { type: "checkbox" });
      box.checked = form.protocols.includes(proto);
      box.addEventListener("change", () => {
        if (box.checked) {
          if (!form.protocols.includes(proto)) {
            form.protocols.push(proto);
          }
        } else {
          form.protocols = form.protocols.filter((p) => p !== proto);
        }
        scheduleApply();
      });
      return el("label", { class: "check" }, [box, el("span", { text: proto })]);
    });
    const connPanel = el("div", { class: "panel" }, [
      el("h2", { text: "Connectivity" }),
      el("div", { class: "checks" }, protoBoxes),
    ]);

    // Power and security section.
    const batteryBox = el("input", { type: "checkbox" });
    batteryBox.checked = form.battery.enabled;
    const rechargeBox = el("input", { type: "checkbox" });
    rechargeBox.checked = form.battery.rechargeable;
    rechargeBox.disabled = !form.battery.enabled;
    batteryBox.addEventListener("change", () => {
      form.battery.enabled = batteryBox.checked;
      rechargeBox.disabled = !batteryBox.checked;
      scheduleApply();
    });
    rechargeBox.addEventListener("change", () => {
      form.battery.rechargeable = rechargeBox.checked;
      scheduleApply();
    });
    const encryptionBox = el("input", { type: "checkbox" });
    encryptionBox.checked = form.encryption;
    encryptionBox.addEventListener("change", () => {
      form.encryption = encryptionBox.checked;
      scheduleApply();
    });
    const powerPanel = el("div", { class: "panel" }, [
      el("h2", { text: "Power and security" }),
      el("div", { class: "checks" }, [
        el("label", { class: "check" }, [batteryBox, el("span", { text: "Battery powered" })]),
        el("label", { class: "check" }, [rechargeBox, el("span", { text: "Rechargeable" })]),
        el("label", { class: "check" }, [encryptionBox, el("span", { text: "Encryption" })]),
      ]),
    ]);

    // Results section, updated in place on every recompile.
    const save = el("button", { class: "refresh", text: "Save to manifest" }, []);
    save.addEventListener("click", () => {
      vscode.postMessage({ type: "saveForm", form: designer.form });
    });
    const resultsPanel = el("div", { class: "panel" }, [
      el("div", { class: "panel-head" }, [
        el("h2", { text: "Compiled" }),
        el("span", { class: "badge", id: "d-badge", text: "..." }),
        save,
      ]),
      el("p", { class: "muted", id: "d-status" }, []),
      el("div", { id: "d-diagnostics" }, []),
      el("h3", { text: "Generated artifacts" }),
      el("ul", { class: "files", id: "d-files" }, []),
      el("h3", { text: "Manifest preview" }),
      el("pre", { class: "code" }, [el("code", { id: "d-yaml" }, [])]),
    ]);

    view.appendChild(devicePanel);
    view.appendChild(capPanel);
    view.appendChild(connPanel);
    view.appendChild(powerPanel);
    view.appendChild(resultsPanel);
  }

  function renderResults(data) {
    const badge = document.getElementById("d-badge");
    if (badge === null) {
      return;
    }
    badge.textContent = data.valid ? "valid" : "invalid";
    badge.className = `badge ${data.valid ? "ok" : "error"}`;

    const diagnostics = document.getElementById("d-diagnostics");
    diagnostics.innerHTML =
      data.diagnostics.length === 0
        ? '<p class="muted">No diagnostics.</p>'
        : '<ul class="diagnostics">' +
          data.diagnostics
            .map((d) => {
              const where = d.path ? escapeHtml(d.path) : "manifest";
              return `<li class="diag ${escapeHtml(d.severity)}"><code>${where}</code> ${escapeHtml(d.message)}</li>`;
            })
            .join("") +
          "</ul>";

    const files = document.getElementById("d-files");
    files.innerHTML =
      data.files.length === 0
        ? '<li class="muted">No artifacts.</li>'
        : data.files.map((f) => `<li><code>${escapeHtml(f)}</code></li>`).join("");

    document.getElementById("d-yaml").textContent = data.yaml;
  }

  function setStatus(text) {
    const status = document.getElementById("d-status");
    if (status !== null) {
      status.textContent = text;
    }
  }

  // --- Twin -----------------------------------------------------------------------------

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
  const twinBadge = document.getElementById("twin-badge");
  const twinStatus = document.getElementById("twin-status");
  const reading = document.getElementById("twin-reading");
  const canvas = document.getElementById("twin-chart");

  function setRunning(running) {
    twin.running = running;
    twinBadge.textContent = running ? "running" : "idle";
    twinBadge.classList.toggle("ok", running);
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

  // --- Messages -------------------------------------------------------------------------

  window.addEventListener("message", (event) => {
    const message = event.data;
    switch (message.type) {
      case "init":
        designer.form = message.form;
        designer.protocols = message.protocols;
        renderDesigner();
        renderResults(message);
        setStatus(`Source: ${message.source}`);
        break;
      case "update":
        renderResults(message);
        break;
      case "saved":
        setStatus(`Saved to ${message.source}`);
        break;
      case "saveError":
        setStatus(message.message);
        break;
      case "focus":
        showTab(message.tab);
        break;
      case "twinStarted":
        setRunning(true);
        twinStatus.textContent = "Streaming telemetry from the twin.";
        break;
      case "twinStatus":
        twinStatus.textContent = message.message;
        break;
      case "sample":
        twin.samples.push(message.value);
        reading.textContent = `${message.value.toFixed(2)} ${message.unit}`;
        drawChart();
        break;
      case "twinExit":
        setRunning(false);
        twinStatus.textContent = "Twin run complete.";
        break;
      case "twinError":
        setRunning(false);
        twinStatus.textContent = message.message;
        break;
    }
  });

  vscode.postMessage({ type: "ready" });
})();
