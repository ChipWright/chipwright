// Webview host for the studio UI. It owns a single panel, loads the branded webview, and
// bridges its messages to the studio core: the webview asks for the current manifest state,
// the host validates and generates it through the core and posts the result back. The rich
// designer and live twin debugger render inside the webview; this host stays a thin bridge.

import * as vscode from "vscode";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  generate,
  spawnTwin,
  TWIN_SOURCE_DIR,
  twinBinaryPath,
  validate,
} from "@openhome/studio-core";
import type { TwinFault, TwinHandle } from "@openhome/studio-core";

type Tab = "designer" | "twin";

type InboundMessage =
  | { type: "ready" | "refresh" | "stopTwin" }
  | { type: "startTwin"; fault: TwinFault; faultAt: number; offset: number };

// A fallback manifest so the panel is useful even before a device.yaml is open. It mirrors
// the reference thermostat and is only used when no manifest is selected or active.
const EXAMPLE_MANIFEST = `device:
  name: smart_thermostat
  category: thermostat
capabilities:
  temperature_sensor:
    type: sensor
    unit: celsius
    range: { min: -20, max: 50 }
  hvac:
    type: actuator
    modes: [heating, cooling, off]
connectivity:
  protocols: [matter, thread]
`;

export class StudioPanel {
  private static current: StudioPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private activeUri: vscode.Uri | undefined;
  private twin: TwinHandle | undefined;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.panel.webview.html = this.render();
    this.panel.webview.onDidReceiveMessage(
      (message: InboundMessage) => {
        switch (message.type) {
          case "ready":
          case "refresh":
            void this.sendState();
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
      const panel = vscode.window.createWebviewPanel(
        "openhomeStudio",
        "OpenHome Studio",
        column,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
        },
      );
      StudioPanel.current = new StudioPanel(panel, context);
    } else {
      StudioPanel.current.panel.reveal(column);
    }

    if (uri !== undefined) {
      StudioPanel.current.activeUri = uri;
    }
    StudioPanel.current.post({ type: "focus", tab });
    void StudioPanel.current.sendState();
  }

  private async manifestText(): Promise<{ yaml: string; source: string }> {
    if (this.activeUri !== undefined) {
      const bytes = await vscode.workspace.fs.readFile(this.activeUri);
      return {
        yaml: new TextDecoder().decode(bytes),
        source: vscode.workspace.asRelativePath(this.activeUri),
      };
    }
    const editor = vscode.window.activeTextEditor;
    if (editor !== undefined && /\.ya?ml$/.test(editor.document.fileName)) {
      return { yaml: editor.document.getText(), source: editor.document.fileName };
    }
    return { yaml: EXAMPLE_MANIFEST, source: "built-in example" };
  }

  private async sendState(): Promise<void> {
    const { yaml, source } = await this.manifestText();
    const validation = validate(yaml);
    const generation = generate(yaml);
    this.post({
      type: "state",
      source,
      valid: validation.valid,
      deviceName: validation.deviceName,
      diagnostics: validation.diagnostics,
      files: generation.files.map((file) => file.path),
    });
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
  <span class="brand">OpenHome Studio</span>
  <nav class="tabs">
    <button class="tab" data-tab="designer" aria-current="true">Designer</button>
    <button class="tab" data-tab="twin">Twin</button>
  </nav>
  <button class="refresh" id="refresh">Refresh</button>
</header>
<main>
  <section class="view" id="view-designer"></section>
  <section class="view" id="view-twin" hidden></section>
</main>
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
