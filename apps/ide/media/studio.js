// Webview UI script. It runs sandboxed in the panel with no Node or VS Code access, and
// talks to the extension host only through postMessage: it announces readiness, requests a
// refresh, and renders the manifest state the host sends back. All real work happens in the
// host via the studio core; this script only draws the result.

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

  function renderTwin() {
    views.twin.innerHTML = `
      <div class="panel">
        <h1>Twin debugger</h1>
        <p class="muted">The live telemetry chart and fault-injection controls attach to the
        twin here. The extension host streams samples from the twin binary through the studio
        core; this view will plot them next.</p>
      </div>`;
  }

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (message.type === "state") {
      renderDesigner(message);
      renderTwin();
    } else if (message.type === "focus") {
      showTab(message.tab);
    }
  });

  renderTwin();
  vscode.postMessage({ type: "ready" });
})();
