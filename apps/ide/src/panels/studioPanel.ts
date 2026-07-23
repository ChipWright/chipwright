// Webview host for the studio UI. It owns a single panel, loads the branded webview, and
// bridges its messages to the studio core: the webview edits a device as a form and asks the
// host to compile, save, run the twin, or open the creation wizard. The rich designer, twin
// debugger, and wizard render inside the webview; this host stays a thin bridge to the core.

import * as vscode from "vscode";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  DESIGNER_PROTOCOLS,
  DEVICE_TEMPLATES,
  formToManifest,
  generate,
  manifestToForm,
  spawnTwin,
  TWIN_SOURCE_DIR,
  twinBinaryPath,
  validate,
} from "@openhome/studio-core";
import type { DeviceForm, TwinFault, TwinHandle } from "@openhome/studio-core";

type Tab = "designer" | "twin";

type InboundMessage =
  | { type: "ready" | "refresh" | "stopTwin" }
  | { type: "startTwin"; fault: TwinFault; faultAt: number; offset: number }
  | { type: "applyForm"; form: DeviceForm }
  | { type: "createDevice"; form: DeviceForm }
  | { type: "saveForm"; form: DeviceForm };

export class StudioPanel {
  private static current: StudioPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private activeUri: vscode.Uri | undefined;
  private twin: TwinHandle | undefined;
  private pendingWizard = false;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.panel.webview.html = this.render();
    this.panel.webview.onDidReceiveMessage(
      (message: InboundMessage) => {
        switch (message.type) {
          case "ready": {
            const pending = this.pendingWizard;
            this.pendingWizard = false;
            void this.sendInit().then(() => {
              if (pending) {
                this.post({ type: "openWizard" });
              }
            });
            break;
          }
          case "refresh":
            void this.sendInit();
            break;
          case "applyForm":
            this.applyForm(message.form);
            break;
          case "createDevice":
            this.createDevice(message.form);
            break;
          case "saveForm":
            void this.saveForm(message.form);
            break;
          case "startTwin":
            void this.startTwin(message.fault, message.faultAt, message.offset);
            break;
          case "stopTwin":
            this.stopTwin();
            break;
        }
      },
      null,
      this.disposables,
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  static show(context: vscode.ExtensionContext, tab: Tab, uri?: vscode.Uri): void {
    const column = vscode.ViewColumn.Beside;
    if (StudioPanel.current === undefined) {
      const panel = vscode.window.createWebviewPanel("openhomeStudio", "OpenHome Studio", column, {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
      });
      StudioPanel.current = new StudioPanel(panel, context);
    } else {
      StudioPanel.current.panel.reveal(column);
    }

    if (uri !== undefined) {
      StudioPanel.current.activeUri = uri;
    }
    StudioPanel.current.post({ type: "focus", tab });
    void StudioPanel.current.sendInit();
  }

  // Opens the panel and launches the creation wizard. On a fresh panel the wizard is deferred
  // until the webview signals it is ready; on an existing panel it opens immediately.
  static newDevice(context: vscode.ExtensionContext): void {
    const existed = StudioPanel.current !== undefined;
    StudioPanel.show(context, "designer");
    const panel = StudioPanel.current;
    if (panel === undefined) {
      return;
    }
    if (existed) {
      panel.post({ type: "openWizard" });
    } else {
      panel.pendingWizard = true;
    }
  }

  // Resolves the manifest to show. hasDevice is false when nothing is selected or open, which
  // the webview uses to present the creation screen instead of an empty editor. There is no
  // built-in fallback device, so a fresh panel never prefills a manifest.
  private async currentManifest(): Promise<{ yaml: string; source: string; hasDevice: boolean }> {
    if (this.activeUri !== undefined) {
      const bytes = await vscode.workspace.fs.readFile(this.activeUri);
      return {
        yaml: new TextDecoder().decode(bytes),
        source: vscode.workspace.asRelativePath(this.activeUri),
        hasDevice: true,
      };
    }
    const editor = vscode.window.activeTextEditor;
    if (editor !== undefined && /\.ya?ml$/.test(editor.document.fileName)) {
      return { yaml: editor.document.getText(), source: editor.document.fileName, hasDevice: true };
    }
    return { yaml: "", source: "", hasDevice: false };
  }

  // Sends the full designer state: the editable form, the protocol and template catalogs, and
  // the result of compiling the current manifest. Used on load and refresh.
  private async sendInit(): Promise<void> {
    const { yaml, source, hasDevice } = await this.currentManifest();
    this.post({
      type: "init",
      source,
      hasDevice,
      form: manifestToForm(yaml),
      protocols: DESIGNER_PROTOCOLS,
      templates: DEVICE_TEMPLATES,
      ...this.compile(yaml),
    });
  }

  // Recompiles from an edited form without touching the form the webview already holds, so
  // typing in the designer stays responsive. The manifest is not written to disk here.
  private applyForm(form: DeviceForm): void {
    this.post({ type: "update", ...this.compile(formToManifest(form)) });
  }

  // Loads a newly created device into the editor as an unsaved manifest. The next save prompts
  // for a location because there is no target file yet.
  private createDevice(form: DeviceForm): void {
    this.activeUri = undefined;
    this.post({ type: "update", ...this.compile(formToManifest(form)) });
  }

  private async saveForm(form: DeviceForm): Promise<void> {
    let target = this.saveTarget();
    if (target === null) {
      target = await this.promptSaveTarget(form);
      if (target === null) {
        this.post({ type: "saveError", message: "Save cancelled." });
        return;
      }
    }
    const yaml = formToManifest(form);
    await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(yaml));
    this.activeUri = target;
    this.post({ type: "saved", source: vscode.workspace.asRelativePath(target) });
    void vscode.commands.executeCommand("openhome.refreshDevices");
  }

  private async promptSaveTarget(form: DeviceForm): Promise<vscode.Uri | null> {
    const options: vscode.SaveDialogOptions = {
      filters: { "Device manifest": ["yaml", "yml"] },
      saveLabel: "Create device manifest",
    };
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder !== undefined) {
      const name = validate(formToManifest(form)).deviceName ?? "device";
      options.defaultUri = vscode.Uri.joinPath(folder.uri, name, "device.yaml");
    }
    const picked = await vscode.window.showSaveDialog(options);
    return picked ?? null;
  }

  private compile(yaml: string): {
    valid: boolean;
    deviceName: string | null;
    diagnostics: unknown;
    files: string[];
    yaml: string;
  } {
    const validation = validate(yaml);
    const generation = generate(yaml);
    return {
      valid: validation.valid,
      deviceName: validation.deviceName,
      diagnostics: validation.diagnostics,
      files: generation.files.map((file) => file.path),
      yaml,
    };
  }

  private saveTarget(): vscode.Uri | null {
    if (this.activeUri !== undefined) {
      return this.activeUri;
    }
    const editor = vscode.window.activeTextEditor;
    if (editor !== undefined && /\.ya?ml$/.test(editor.document.fileName)) {
      return editor.document.uri;
    }
    return null;
  }

  private async startTwin(fault: TwinFault, faultAt: number, offset: number): Promise<void> {
    this.stopTwin();
    const binPath = await this.ensureTwinBinary();
    if (binPath === null) {
      return;
    }
    this.post({ type: "twinStarted" });
    this.twin = spawnTwin(
      { binPath, ticks: 60, intervalMs: 250, initial: 21, step: 0.5, fault, faultAt, offset },
      {
        onSample: (sample) => {
          this.post({ type: "sample", value: sample.value, unit: sample.unit });
        },
        onExit: () => {
          this.twin = undefined;
          this.post({ type: "twinExit" });
        },
        onError: (error) => {
          this.twin = undefined;
          this.post({ type: "twinError", message: error.message });
        },
      },
    );
  }

  private stopTwin(): void {
    if (this.twin !== undefined) {
      this.twin.stop();
      this.twin = undefined;
    }
  }

  // Resolves the twin binary, building it on demand if it has not been compiled yet, so the
  // debugger works from a fresh checkout given a C toolchain. Returns null and reports the
  // reason to the webview when no binary can be produced.
  private async ensureTwinBinary(): Promise<string | null> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder === undefined) {
      this.post({ type: "twinError", message: "Open the OpenHome Studio workspace to run the twin." });
      return null;
    }
    const root = folder.uri.fsPath;
    const binPath = twinBinaryPath(root);
    if (existsSync(binPath)) {
      return binPath;
    }
    this.post({ type: "twinStatus", message: "Building the twin binary..." });
    try {
      await buildTwin(join(root, TWIN_SOURCE_DIR));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.post({ type: "twinError", message: `Could not build the twin: ${message}` });
      return null;
    }
    if (!existsSync(binPath)) {
      this.post({ type: "twinError", message: "The twin build produced no binary." });
      return null;
    }
    return binPath;
  }

  private post(message: unknown): void {
    void this.panel.webview.postMessage(message);
  }

  private render(): string {
    const webview = this.panel.webview;
    const mediaRoot = vscode.Uri.joinPath(this.context.extensionUri, "media");
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "studio.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "studio.css"));
    const nonce = createNonce();
    const home =
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 2.5 11.2l1.3 1.5L5 11.7V21h5.5v-5.5h3V21H19v-9.3l1.2 1 1.3-1.5zM7 19v-9l5-4.3 5 4.3v9h-1.5v-5.5h-7V19z"/></svg>';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link href="${styleUri.toString()}" rel="stylesheet">
<title>OpenHome Studio</title>
</head>
<body>
<header class="topbar">
  <div class="wordmark"><span class="glyph">${home}</span><b>OpenHome Studio</b></div>
  <div class="context"><span class="sep">/</span><span class="device" id="ctx-device">device</span><span class="pill idle" id="ctx-pill"><span class="dot"></span><span id="ctx-pill-text">...</span></span></div>
  <div class="seg" role="tablist">
    <button role="tab" aria-selected="true" data-tab="designer">Designer</button>
    <button role="tab" aria-selected="false" data-tab="twin">Twin</button>
  </div>
</header>

<section class="tabview" id="tab-designer">
  <div class="split"><div class="inspector" id="inspector"></div><div class="output" id="output"></div></div>
</section>

<section class="tabview" id="tab-twin" hidden>
  <div class="twin">
    <div class="card">
      <div class="toolbar">
        <button class="btn primary" id="twin-run"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg><span id="twin-run-label">Start</span></button>
        <div class="ctl">Fault
          <div class="seg mini" id="fault-seg">
            <button aria-selected="true" data-fault="none">none</button>
            <button aria-selected="false" data-fault="stuck">stuck</button>
            <button aria-selected="false" data-fault="fail">fail</button>
            <button aria-selected="false" data-fault="offset">offset</button>
          </div>
        </div>
        <div class="ctl">at tick
          <div class="stepper"><button data-step="at" data-d="-1">-</button><input id="fault-at" value="6"><button data-step="at" data-d="1">+</button></div>
        </div>
        <div class="ctl is-hidden" id="offset-ctl">offset
          <div class="stepper"><button data-step="off" data-d="-1">-</button><input id="fault-off" value="5"><button data-step="off" data-d="1">+</button></div>
        </div>
        <span class="spring"></span>
        <span class="pill idle" id="twin-status"><span class="dot"></span><span id="twin-status-text">idle</span></span>
      </div>
    </div>
    <div class="card">
      <div class="readout"><span class="val" id="twin-val">--</span><span class="unit" id="twin-unit">celsius</span><span class="meta"><span id="twin-count">0</span> samples</span></div>
      <div class="chart-wrap"><canvas id="chart"></canvas><div class="chart-empty" id="chart-empty">Start the twin to stream live telemetry</div></div>
      <div class="chart-legend"><span class="k"><span class="swatch temp"></span>temperature</span><span class="k"><span class="swatch fault"></span>fault injected</span></div>
    </div>
  </div>
</section>

<div class="wizard-screen" id="wizard" hidden role="dialog" aria-modal="true" aria-label="Create a device">
  <header>
    <div class="wordmark"><span class="glyph">${home}</span><b>OpenHome Studio</b></div>
    <button class="icon-btn" id="wiz-close" data-wiz="cancel" title="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
  </header>
  <div class="wiz-body"><div class="wiz-inner">
    <h1 class="wiz-title">Create a device</h1>
    <p class="wiz-sub">Choose a template to start with, or build from scratch.</p>
    <div class="gallery" id="gallery"></div>
  </div></div>
</div>

<div class="toast" id="toast"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 13 4 4L19 7"/></svg><span id="toast-text"></span></div>

<script nonce="${nonce}" src="${scriptUri.toString()}"></script>
</body>
</html>
`;
  }

  private dispose(): void {
    this.stopTwin();
    StudioPanel.current = undefined;
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
    this.panel.dispose();
  }
}

// Compiles the twin binary by invoking its Makefile. Resolves on a clean build and rejects
// when make is unavailable or exits non-zero.
function buildTwin(dir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const make = spawn("make", ["-C", dir], { stdio: "ignore" });
    make.on("error", reject);
    make.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`make exited with code ${String(code)}`));
      }
    });
  });
}

function createNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
