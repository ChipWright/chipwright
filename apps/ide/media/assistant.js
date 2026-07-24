// Webview UI for the AI assistant. It renders the chat transcript and proposal cards and
// forwards user actions to the extension host, which runs the grounded agent. It holds no
// model logic: it sends a prompt, shows what comes back, and asks the host to apply a
// proposal. All host-supplied text is inserted with textContent to avoid HTML injection.

(function () {
  const vscode = acquireVsCodeApi();

  const chat = document.getElementById("chat");
  const empty = document.getElementById("empty");
  const transcript = document.getElementById("transcript");
  const input = document.getElementById("input");
  const send = document.getElementById("send");
  const ctxDevice = document.getElementById("ctx-device");
  const ctxModel = document.getElementById("ctx-model");
  let thinkingEl = null;

  function scrollToEnd() {
    chat.scrollTop = chat.scrollHeight;
  }

  // Renders a subset of inline markdown (bold, italic, inline code) into an element by
  // building text and element nodes, never raw HTML, so model output cannot inject markup.
  function appendInline(container, text) {
    const re = /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g;
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) {
        container.appendChild(document.createTextNode(text.slice(last, m.index)));
      }
      const tag = m[1] !== undefined ? "strong" : m[2] !== undefined ? "code" : "em";
      const node = document.createElement(tag);
      node.textContent = m[1] || m[2] || m[3];
      container.appendChild(node);
      last = m.index + m[0].length;
    }
    if (last < text.length) {
      container.appendChild(document.createTextNode(text.slice(last)));
    }
  }

  function addMessage(role, text) {
    empty.classList.add("is-hidden");
    const msg = document.createElement("div");
    msg.className = "msg " + role;
    const who = document.createElement("div");
    who.className = "who";
    who.textContent = role === "user" ? "You" : role === "error" ? "Error" : "Assistant";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    if (role === "assistant") {
      appendInline(bubble, text);
    } else {
      bubble.textContent = text;
    }
    msg.append(who, bubble);
    transcript.append(msg);
    scrollToEnd();
    return msg;
  }

  function clearThinking() {
    if (thinkingEl) {
      thinkingEl.remove();
      thinkingEl = null;
    }
  }

  function showThinking() {
    clearThinking();
    empty.classList.add("is-hidden");
    const wrap = document.createElement("div");
    wrap.className = "msg assistant";
    const bubble = document.createElement("div");
    bubble.className = "bubble thinking";
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("span");
      dot.className = "dot";
      bubble.append(dot);
    }
    wrap.append(bubble);
    transcript.append(wrap);
    thinkingEl = wrap;
    scrollToEnd();
  }

  function renderDiffInto(container, diff) {
    for (const raw of diff.split("\n")) {
      const line = document.createElement("div");
      const mark = raw.charAt(0);
      line.className = "line " + (mark === "+" ? "add" : mark === "-" ? "del" : "ctx");
      line.textContent = raw;
      container.append(line);
    }
  }

  function renderProposal(p) {
    const card = document.createElement("div");
    card.className = "proposal";

    const head = document.createElement("div");
    head.className = "head";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = p.deviceName || "device";
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = "compiles, " + p.files + " artifact(s)";
    head.append(name, meta);

    const summary = document.createElement("div");
    summary.className = "summary";
    summary.textContent = p.summary;

    const diff = document.createElement("pre");
    diff.className = "diff";
    renderDiffInto(diff, p.diff);

    const actions = document.createElement("div");
    actions.className = "actions";
    const open = document.createElement("button");
    open.className = "btn primary";
    open.textContent = "Open in Designer";
    open.addEventListener("click", () => {
      vscode.postMessage({ type: "openInDesigner", index: p.index });
    });
    const apply = document.createElement("button");
    apply.className = "btn apply-btn";
    apply.dataset.index = String(p.index);
    apply.textContent = "Apply to file";
    apply.addEventListener("click", () => {
      vscode.postMessage({ type: "apply", index: p.index });
      apply.disabled = true;
      apply.textContent = "Applying...";
    });
    const status = document.createElement("span");
    status.className = "applied";
    status.dataset.index = String(p.index);
    actions.append(open, apply, status);

    card.append(head, summary, diff, actions);
    return card;
  }

  function submit() {
    const text = input.value.trim();
    if (text.length === 0) {
      return;
    }
    addMessage("user", text);
    input.value = "";
    input.style.height = "auto";
    showThinking();
    vscode.postMessage({ type: "ask", text: text });
  }

  send.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 160) + "px";
  });

  // Settings sheet.
  const settings = document.getElementById("settings");
  const setProvider = document.getElementById("set-provider");
  const setModel = document.getElementById("set-model");
  const setBaseUrl = document.getElementById("set-baseurl");
  const setKey = document.getElementById("set-key");
  const baseUrlField = document.getElementById("baseurl-field");

  // A base URL only applies to the openai-compatible provider; hide it otherwise.
  function updateProviderFields() {
    baseUrlField.hidden = setProvider.value !== "openai-compatible";
  }
  setProvider.addEventListener("change", updateProviderFields);

  document.getElementById("key-btn").addEventListener("click", () => {
    vscode.postMessage({ type: "openSettings" });
  });
  document.getElementById("set-cancel").addEventListener("click", () => {
    settings.hidden = true;
  });
  settings.addEventListener("click", (e) => {
    if (e.target === settings) {
      settings.hidden = true;
    }
  });
  document.getElementById("reveal").addEventListener("click", () => {
    setKey.type = setKey.type === "password" ? "text" : "password";
  });
  document.getElementById("set-save").addEventListener("click", () => {
    vscode.postMessage({
      type: "saveSettings",
      provider: setProvider.value,
      model: setModel.value.trim(),
      baseUrl: setBaseUrl.value.trim(),
      apiKey: setKey.value,
    });
  });

  window.addEventListener("message", (event) => {
    const m = event.data;
    switch (m.type) {
      case "context":
        ctxDevice.textContent = m.device || "no device";
        ctxModel.textContent = m.hasKey ? m.provider + " / " + m.model : "";
        break;
      case "settings":
        setProvider.value = m.provider;
        setModel.value = m.model;
        setBaseUrl.value = m.baseUrl;
        setKey.value = m.apiKey;
        setKey.type = "password";
        updateProviderFields();
        settings.hidden = false;
        break;
      case "settingsSaved":
        settings.hidden = true;
        break;
      case "thinking":
        showThinking();
        break;
      case "answer": {
        clearThinking();
        const msg = addMessage("assistant", m.text);
        for (const p of m.proposals) {
          msg.append(renderProposal(p));
        }
        scrollToEnd();
        break;
      }
      case "error":
        clearThinking();
        addMessage("error", m.message);
        break;
      case "needKey":
        clearThinking();
        addMessage("error", m.message + " Open settings (top right) to add one.");
        break;
      case "applied": {
        const btn = transcript.querySelector('.apply-btn[data-index="' + m.index + '"]');
        if (btn) {
          btn.textContent = "Applied";
        }
        const status = transcript.querySelector('.applied[data-index="' + m.index + '"]');
        if (status) {
          status.textContent = "Applied to " + m.source;
        }
        break;
      }
      case "applyCancelled":
      case "applyError": {
        const btn = transcript.querySelector('.apply-btn[data-index="' + m.index + '"]');
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Apply to file";
        }
        if (m.type === "applyError") {
          const status = transcript.querySelector('.applied[data-index="' + m.index + '"]');
          if (status) {
            status.textContent = m.message;
          }
        }
        break;
      }
    }
  });

  vscode.postMessage({ type: "ready" });
})();
