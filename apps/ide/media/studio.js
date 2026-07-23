// Webview UI script. It runs sandboxed in the panel with no Node or VS Code access, and talks
// to the extension host only through postMessage. The designer edits a device as a form and
// asks the host to recompile through the studio core; the twin view sends run controls and
// plots the telemetry the host streams from the twin binary; the wizard creates a device from
// a host-provided template. All real work happens in the host; this script only draws intent.

(function () {
  "use strict";
  const vscode = acquireVsCodeApi();
  const $ = (s, r) => (r || document).querySelector(s);

  const state = { form: null, protocols: [], templates: [], source: "", hasDevice: false };

  const ICON = {
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4"/></svg>',
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 3h11l3 3v15H5zM8 3v5h7"/></svg>',
  };
  const TICON = {
    thermostat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 14V5a2 2 0 0 0-4 0v9a4 4 0 1 0 4 0z"/></svg>',
    environment_sensor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/></svg>',
    smart_plug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5"/></svg>',
    smart_light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10c1 1 1 2 1 3h6c0-1 0-2 1-3a6 6 0 0 0-4-10z"/></svg>',
    motion_sensor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 12a7 7 0 0 1 7-7m0 14a7 7 0 0 0 7-7M8.5 12a3.5 3.5 0 0 1 3.5-3.5"/></svg>',
    __blank__: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 5v14M5 12h14"/></svg>',
  };

  function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function emptyForm() { return { name: "", category: "", manufacturer: "", capabilities: [], protocols: [], battery: { enabled: false, rechargeable: false }, encryption: false }; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function toast(msg) { const t = $("#toast"); $("#toast-text").textContent = msg; t.classList.add("show"); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 2200); }

  // ---- Tabs --------------------------------------------------------------
  function selectTab(name) {
    document.querySelectorAll('[role="tab"]').forEach((x) => x.setAttribute("aria-selected", String(x.dataset.tab === name)));
    $("#tab-designer").hidden = name !== "designer";
    $("#tab-twin").hidden = name !== "twin";
    if (name === "twin") requestAnimationFrame(draw);
  }
  document.querySelectorAll('[role="tab"]').forEach((t) => t.addEventListener("click", () => selectTab(t.dataset.tab)));

  // ---- Designer inputs ---------------------------------------------------
  const inspector = $("#inspector");
  let applyTimer = null;
  function scheduleApply() {
    if (applyTimer !== null) clearTimeout(applyTimer);
    applyTimer = setTimeout(() => vscode.postMessage({ type: "applyForm", form: state.form }), 200);
  }

  function renderInspector() {
    const f = state.form;
    const caps = f.capabilities.map((c, i) => {
      const detail = c.kind === "sensor"
        ? '<div class="field"><label>Unit</label><input type="text" spellcheck="false" autocomplete="off" data-cap="' + i + '" data-field="unit" value="' + esc(c.unit) + '" placeholder="e.g. celsius"></div>'
          + '<div class="field-row"><div class="field"><label>Min</label><input type="number" data-cap="' + i + '" data-field="min" value="' + (c.min == null ? "" : c.min) + '"></div>'
          + '<div class="field"><label>Max</label><input type="number" data-cap="' + i + '" data-field="max" value="' + (c.max == null ? "" : c.max) + '"></div></div>'
        : '<div class="field"><label>Modes (comma separated)</label><input type="text" spellcheck="false" autocomplete="off" data-cap="' + i + '" data-field="modes" value="' + esc(c.modes.join(", ")) + '" placeholder="on, off"></div>';
      return '<div class="cap"><div class="cap-top">'
        + '<div class="field cap-key"><input type="text" spellcheck="false" autocomplete="off" data-cap="' + i + '" data-field="key" value="' + esc(c.key) + '" placeholder="capability_key"></div>'
        + '<div class="seg mini"><button data-captype="' + i + '" data-kind="sensor" aria-selected="' + (c.kind === "sensor") + '">sensor</button>'
        + '<button data-captype="' + i + '" data-kind="actuator" aria-selected="' + (c.kind === "actuator") + '">actuator</button></div>'
        + '<button class="icon-btn trash" data-remove="' + i + '" title="Remove">' + ICON.trash + '</button>'
        + '</div><div class="cap-detail">' + detail + '</div></div>';
    }).join("");

    const chips = state.protocols.map((p) =>
      '<button class="chip" data-proto="' + p + '" aria-pressed="' + f.protocols.includes(p) + '">' + p + '</button>').join("");

    inspector.innerHTML =
      '<div class="group"><div class="group-head"><h3>Device</h3></div>'
      + '<div class="field"><label>Name</label><input type="text" spellcheck="false" autocomplete="off" autocapitalize="off" data-bind="name" value="' + esc(f.name) + '"></div>'
      + '<div class="field-row"><div class="field"><label>Category</label><input type="text" spellcheck="false" autocomplete="off" data-bind="category" value="' + esc(f.category) + '"></div>'
      + '<div class="field"><label>Manufacturer</label><input type="text" spellcheck="false" autocomplete="off" data-bind="manufacturer" value="' + esc(f.manufacturer) + '"></div></div></div>'
      + '<div class="group"><div class="group-head"><h3>Capabilities</h3></div>' + caps
      + '<div class="add-row"><button class="btn ghost small" data-add="sensor">' + ICON.plus + 'Sensor</button>'
      + '<button class="btn ghost small" data-add="actuator">' + ICON.plus + 'Actuator</button></div></div>'
      + '<div class="group"><div class="group-head"><h3>Connectivity</h3></div><div class="chips">' + chips + '</div></div>'
      + '<div class="group"><div class="group-head"><h3>Power &amp; Security</h3></div>'
      + toggleRow("battery", "Battery powered", "This device runs on battery", f.battery.enabled, false)
      + (f.battery.enabled ? toggleRow("recharge", "Rechargeable", "The battery can be recharged", f.battery.rechargeable, true) : "")
      + toggleRow("encryption", "Encryption", "Encrypt device communications", f.encryption, false)
      + '</div>';
  }

  // Rechargeable is a property of a battery, so it renders as a nested row and only appears
  // while Battery powered is on.
  function toggleRow(key, title, sub, on, nested) {
    return '<div class="toggle-row' + (nested ? " nested" : "") + '"><div class="label"><span>' + title + '</span><small>' + sub + '</small></div>'
      + '<label class="switch"><input type="checkbox" data-toggle="' + key + '"' + (on ? " checked" : "") + '><span class="track"></span></label></div>';
  }

  inspector.addEventListener("input", (e) => {
    const t = e.target, f = state.form;
    if (t.dataset.bind) f[t.dataset.bind] = t.value;
    else if (t.dataset.cap !== undefined) {
      const c = f.capabilities[+t.dataset.cap], field = t.dataset.field;
      if (field === "modes") c.modes = t.value.split(",").map((s) => s.trim()).filter(Boolean);
      else if (field === "min" || field === "max") c[field] = t.value === "" ? null : Number(t.value);
      else c[field] = t.value;
    } else return;
    scheduleApply();
  });

  inspector.addEventListener("change", (e) => {
    const t = e.target, f = state.form;
    if (!t.dataset.toggle) return;
    if (t.dataset.toggle === "battery") { f.battery.enabled = t.checked; if (!f.battery.enabled) f.battery.rechargeable = false; renderInspector(); }
    else if (t.dataset.toggle === "recharge") f.battery.rechargeable = t.checked;
    else if (t.dataset.toggle === "encryption") f.encryption = t.checked;
    scheduleApply();
  });

  inspector.addEventListener("click", (e) => {
    const f = state.form;
    const proto = e.target.closest("[data-proto]");
    const add = e.target.closest("[data-add]");
    const rm = e.target.closest("[data-remove]");
    const ct = e.target.closest("[data-captype]");
    if (proto) {
      const p = proto.dataset.proto;
      f.protocols = f.protocols.includes(p) ? f.protocols.filter((x) => x !== p) : f.protocols.concat(p);
      proto.setAttribute("aria-pressed", f.protocols.includes(p));
      scheduleApply(); return;
    }
    if (add) { f.capabilities.push(add.dataset.add === "sensor" ? { key: "", kind: "sensor", unit: "", min: null, max: null } : { key: "", kind: "actuator", modes: [] }); renderInspector(); scheduleApply(); return; }
    if (rm) { f.capabilities.splice(+rm.dataset.remove, 1); renderInspector(); scheduleApply(); return; }
    if (ct) { const c = f.capabilities[+ct.dataset.captype]; if (c.kind === ct.dataset.kind) return; f.capabilities[+ct.dataset.captype] = ct.dataset.kind === "sensor" ? { key: c.key, kind: "sensor", unit: "", min: null, max: null } : { key: c.key, kind: "actuator", modes: [] }; renderInspector(); scheduleApply(); }
  });

  // ---- Output (rendered from host compile results) -----------------------
  function highlightYaml(yaml) {
    return esc(yaml).split("\n").map((line) =>
      line.replace(/^(\s*)([A-Za-z0-9_]+)(:)/, '$1<span class="k">$2</span>$3')
        .replace(/(:\s*)(-?\d+(?:\.\d+)?|true|false)\b/g, '$1<span class="n">$2</span>')).join("\n");
  }

  function renderOutput(data) {
    const errors = (data.diagnostics || []).filter((d) => d.severity === "error").length;
    const valid = data.valid;
    $("#ctx-device").textContent = data.deviceName || state.form.name || "device";
    const pill = $("#ctx-pill");
    pill.className = "pill " + (valid ? "ok" : "bad");
    $("#ctx-pill-text").textContent = valid ? "valid" : errors + (errors === 1 ? " error" : " errors");

    const diags = data.diagnostics || [];
    const diagHtml = diags.length === 0
      ? '<div class="empty-note">No diagnostics.</div>'
      : diags.map((d) => '<div class="diag ' + esc(d.severity) + '"><code>' + esc(d.path || "manifest") + '</code><span>' + esc(d.message) + '</span></div>').join("");
    const files = data.files || [];
    const fileHtml = files.length === 0
      ? '<div class="empty-note">Fix the errors above to generate artifacts.</div>'
      : '<div class="filelist">' + files.map((f) => '<div class="filerow">' + ICON.file + '<code>' + esc(f) + '</code></div>').join("") + '</div>';

    $("#output").innerHTML =
      '<div class="out-status"><span class="pill ' + (valid ? "ok" : "bad") + '"><span class="dot"></span>' + (valid ? "Valid" : "Invalid") + '</span>'
      + '<span class="counts">' + state.form.capabilities.length + ' capabilities &middot; ' + state.form.protocols.length + ' protocols</span>'
      + '<button class="btn primary small push-right" id="save-btn">' + ICON.save + 'Save</button></div>'
      + '<div class="out-section"><h4>Source</h4><div class="empty-note">' + esc(state.source) + '</div></div>'
      + '<div class="out-section"><h4>Diagnostics ' + (diags.length ? "(" + diags.length + ")" : "") + '</h4>' + diagHtml + '</div>'
      + '<div class="out-section"><h4>Generated artifacts ' + (files.length ? "(" + files.length + ")" : "") + '</h4>' + fileHtml + '</div>'
      + '<div class="out-section"><h4>device.yaml</h4><pre class="code"><code>' + highlightYaml(data.yaml || "") + '</code></pre></div>';

    $("#save-btn").addEventListener("click", () => vscode.postMessage({ type: "saveForm", form: state.form }));
  }

  // ---- Creation screen ---------------------------------------------------
  const wizardScreen = $("#wizard"), gallery = $("#gallery"), wizClose = $("#wiz-close");

  function tile(id, icon, title, desc) {
    return '<button class="tile" data-tpl="' + esc(id) + '"><span class="ticon">' + icon + '</span><h4>' + esc(title) + '</h4><p>' + esc(desc) + '</p></button>';
  }
  function renderGallery() {
    gallery.innerHTML = tile("__blank__", TICON.__blank__, "No template", "Start from scratch in the full editor.")
      + state.templates.map((t) => tile(t.id, TICON[t.id] || ICON.plus, t.title, t.description)).join("");
  }
  function showWizard() { renderGallery(); wizClose.hidden = !state.hasDevice; wizardScreen.hidden = false; }
  function hideWizard() { wizardScreen.hidden = true; }
  function closeWizard() { if (state.hasDevice) hideWizard(); }

  // Selecting any tile creates the device immediately and opens the editor; templates fill in
  // their preset, "No template" starts empty.
  function createFromForm(form) {
    state.form = form;
    state.hasDevice = true;
    hideWizard();
    renderInspector();
    selectTab("designer");
    vscode.postMessage({ type: "createDevice", form: form });
    toast("Created " + (form.name || "device"));
  }

  wizardScreen.addEventListener("click", (e) => {
    const tpl = e.target.closest("[data-tpl]");
    if (tpl) {
      const id = tpl.dataset.tpl;
      if (id === "__blank__") createFromForm(emptyForm());
      else { const t = state.templates.find((x) => x.id === id); if (t) createFromForm(clone(t.form)); }
    } else if (e.target.closest('[data-wiz="cancel"]')) {
      closeWizard();
    }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !wizardScreen.hidden) closeWizard(); });

  // ---- Twin --------------------------------------------------------------
  const twin = { running: false, samples: [], tick: 0, timer: null, fault: "none", faultIndex: -1 };
  const canvas = $("#chart"), ctx = canvas.getContext("2d");
  const faultSeg = $("#fault-seg"), faultAt = $("#fault-at"), faultOff = $("#fault-off"), offsetCtl = $("#offset-ctl");

  faultSeg.addEventListener("click", (e) => {
    const b = e.target.closest("[data-fault]"); if (!b) return;
    faultSeg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    twin.fault = b.dataset.fault;
    offsetCtl.classList.toggle("is-hidden", twin.fault !== "offset");
  });
  document.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => {
    const input = b.dataset.step === "at" ? faultAt : faultOff;
    input.value = Math.max(0, (parseInt(input.value, 10) || 0) + Number(b.dataset.d));
  }));

  $("#twin-run").addEventListener("click", () => twin.running ? vscode.postMessage({ type: "stopTwin" }) : startTwin());

  function setStatus(cls, text) { const p = $("#twin-status"); p.className = "pill " + cls; $("#twin-status-text").textContent = text; }
  function setRunning(running) {
    twin.running = running;
    $("#twin-run-label").textContent = running ? "Stop" : "Start";
    $("#twin-run").querySelector("svg").innerHTML = running ? '<rect x="6" y="6" width="12" height="12" rx="1.5"/>' : '<path d="M8 5v14l11-7z"/>';
  }

  function startTwin() {
    twin.samples = []; twin.tick = 0;
    twin.faultIndex = twin.fault === "none" ? -1 : (parseInt(faultAt.value, 10) || 0);
    $("#twin-val").textContent = "--"; $("#twin-count").textContent = "0";
    $("#chart-empty").classList.add("is-hidden");
    draw();
    vscode.postMessage({ type: "startTwin", fault: twin.fault, faultAt: parseInt(faultAt.value, 10) || 0, offset: parseFloat(faultOff.value) || 0 });
  }

  function cvar(n) { return getComputedStyle(document.body).getPropertyValue(n).trim(); }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const padL = 38, padR = 12, padT = 12, padB = 22;
    const grid = cvar("--border-soft") || "rgba(128,128,128,.3)", ink = cvar("--fg-muted"), accent = cvar("--accent"), err = cvar("--error");
    const vals = twin.samples;

    let min = 18, max = 26;
    if (vals.length) { min = Math.min.apply(null, vals); max = Math.max.apply(null, vals); if (max - min < 2) { const m = (max + min) / 2; min = m - 1; max = m + 1; } const pad = (max - min) * 0.1; min -= pad; max += pad; }
    const X = (i) => padL + (vals.length <= 1 ? 0 : (i / (vals.length - 1)) * (w - padL - padR));
    const Y = (v) => padT + (h - padT - padB) * (1 - (v - min) / (max - min));

    ctx.font = "10px " + cvar("--mono");
    ctx.textBaseline = "middle"; ctx.fillStyle = ink;
    for (let g = 0; g <= 4; g++) {
      const y = padT + (h - padT - padB) * (g / 4), val = max - (max - min) * (g / 4);
      ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.fillText(val.toFixed(1), 4, y);
    }
    if (!vals.length) return;

    if (twin.faultIndex >= 0 && twin.faultIndex < vals.length) {
      const fx = X(twin.faultIndex);
      ctx.strokeStyle = err; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(fx, padT); ctx.lineTo(fx, h - padB); ctx.stroke(); ctx.setLineDash([]);
    }

    const grad = ctx.createLinearGradient(0, padT, 0, h - padB);
    grad.addColorStop(0, accent + "44"); grad.addColorStop(1, accent + "00");
    ctx.beginPath(); ctx.moveTo(X(0), Y(vals[0]));
    vals.forEach((v, i) => ctx.lineTo(X(i), Y(v)));
    ctx.lineTo(X(vals.length - 1), h - padB); ctx.lineTo(X(0), h - padB); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    ctx.beginPath(); ctx.moveTo(X(0), Y(vals[0]));
    vals.forEach((v, i) => ctx.lineTo(X(i), Y(v)));
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();

    const lx = X(vals.length - 1), ly = Y(vals[vals.length - 1]);
    ctx.fillStyle = accent + "33"; ctx.beginPath(); ctx.arc(lx, ly, 6, 0, 7); ctx.fill();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(lx, ly, 3.2, 0, 7); ctx.fill();
  }

  // ---- Messages ----------------------------------------------------------
  window.addEventListener("message", (event) => {
    const m = event.data;
    switch (m.type) {
      case "init":
        state.form = m.form; state.protocols = m.protocols; state.templates = m.templates || []; state.source = m.source || ""; state.hasDevice = !!m.hasDevice;
        renderInspector(); renderOutput(m);
        if (!state.hasDevice) showWizard();
        break;
      case "update":
        renderOutput(m); break;
      case "saved":
        state.source = m.source; toast("Saved to " + m.source); vscode.postMessage({ type: "refresh" }); break;
      case "saveError":
        toast(m.message); break;
      case "openWizard":
        showWizard(); break;
      case "focus":
        selectTab(m.tab); break;
      case "twinStarted":
        setRunning(true); setStatus("run", "running"); break;
      case "twinStatus":
        setStatus("run", m.message); break;
      case "sample":
        twin.samples.push(m.value); $("#twin-val").textContent = m.value.toFixed(2); $("#twin-unit").textContent = m.unit; $("#twin-count").textContent = twin.samples.length; draw(); break;
      case "twinExit":
        setRunning(false); setStatus("idle", "complete"); break;
      case "twinError":
        setRunning(false); setStatus("bad", m.message); break;
    }
  });

  setRunning(false);
  window.addEventListener("resize", () => { if (!$("#tab-twin").hidden) draw(); });
  vscode.postMessage({ type: "ready" });
})();
