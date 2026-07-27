// Webview host for the AI assistant. It owns a single chat panel and bridges its messages
// to the assistant core: the webview sends a prompt, the host runs the grounded agent
// against the configured provider, and streams the answer and any device proposals back.
// All agent logic lives in @chipwright/assistant; this host only supplies configuration, the
// workspace file reader, and the apply step. The provider API key is read from VS Code
// secret storage and never rendered into the webview.

import * as vscode from "vscode";
import {
  defaultModel,
  defaultTools,
  mergeManifestComments,
  providerFromConfig,
  renderDiff,
  runAgent,
  ConfigError,
  ProviderError,
  type DeviceProposal,
  type LlmConfig,
  type Message,
  type ProviderName,
} from "@chipwright/assistant";
import { StudioPanel } from "./studioPanel.js";

const SECRET_KEY = "chipwright.assistant.apiKey";

type InboundMessage =
  | { type: "ready" | "openSettings" }
  | { type: "ask"; text: string }
  | { type: "apply"; index: number }
  | { type: "openInDesigner"; index: number }
  | { type: "saveSettings"; provider: string; model: string; baseUrl: string; apiKey: string };

export class AssistantPanel {
  private static current: AssistantPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private activeUri: vscode.Uri | undefined;
  // Proposals accumulate across turns so a proposal's index stays valid even after later
  // questions; the webview references them by this stable index when applying.
  private readonly proposals: DeviceProposal[] = [];
  // The running conversation, so the assistant remembers earlier turns.
  private readonly history: Message[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.panel.webview.html = this.render();
    this.panel.webview.onDidReceiveMessage(
      (message: InboundMessage) => {
        switch (message.type) {
          case "ready":
            void this.sendContext();
            break;
          case "ask":
            void this.ask(message.text);
            break;
          case "apply":
            void this.apply(message.index);
            break;
          case "openInDesigner":
            this.openInDesigner(message.index);
            break;
          case "openSettings":
            void this.sendSettings();
            break;
          case "saveSettings":
            void this.saveSettings(message);
            break;
        }
      },
      null,
      this.disposables,
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  static show(context: vscode.ExtensionContext, uri?: vscode.Uri): void {
    const column = vscode.ViewColumn.Beside;
    if (AssistantPanel.current === undefined) {
      const panel = vscode.window.createWebviewPanel("chipwrightAssistant", "Chipwright Assistant", column, {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
      });
      AssistantPanel.current = new AssistantPanel(panel, context);
    } else {
      AssistantPanel.current.panel.reveal(column);
    }
    if (uri !== undefined) {
      AssistantPanel.current.activeUri = uri;
    }
    void AssistantPanel.current.sendContext();
  }

  // Resolves the device the assistant is working on: an explicitly opened manifest, or the
  // active editor when it is a YAML file. When neither exists the assistant still answers
  // general questions and can propose a new device.
  private deviceUri(): vscode.Uri | undefined {
    if (this.activeUri !== undefined) {
      return this.activeUri;
    }
    const editor = vscode.window.activeTextEditor;
    if (editor !== undefined && /\.ya?ml$/.test(editor.document.fileName)) {
      return editor.document.uri;
    }
    return undefined;
  }

  private config(): LlmConfig | { error: string } {
    const settings = vscode.workspace.getConfiguration("chipwright.assistant");
    const provider = (settings.get<string>("provider") ?? "anthropic") as ProviderName;
    const model = settings.get<string>("model");
    const baseUrl = settings.get<string>("baseUrl");
    const config: LlmConfig = {
      provider,
      apiKey: "",
      model: model !== undefined && model.length > 0 ? model : defaultModel(provider),
    };
    if (baseUrl !== undefined && baseUrl.length > 0) {
      config.baseUrl = baseUrl;
    }
    return config;
  }

  private async ask(text: string): Promise<void> {
    const base = this.config();
    if ("error" in base) {
      this.post({ type: "error", message: base.error });
      return;
    }
    const key = (await this.context.secrets.get(SECRET_KEY)) ?? "";
    const isLocal = base.baseUrl !== undefined && /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(base.baseUrl);
    if (key.length === 0 && !isLocal) {
      this.post({ type: "needKey", message: "Set an API key to use the assistant." });
      return;
    }
    const config: LlmConfig = { ...base, apiKey: key };

    const note = await this.deviceContextNote();

    this.post({ type: "thinking" });
    try {
      const provider = providerFromConfig(config);
      const result = await runAgent({
        provider,
        tools: defaultTools(),
        context: {
          proposals: [] as DeviceProposal[],
          readFile: async (path) => {
            const uri = this.resolvePath(path);
            return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
          },
        },
        // The full conversation is sent so the assistant has memory of earlier turns; the
        // device note is added only to the newest turn, not stored in history.
        messages: [...this.history, { role: "user", content: text + note }],
        model: config.model,
      });
      this.history.push({ role: "user", content: text }, { role: "assistant", content: result.answer });

      const startIndex = this.proposals.length;
      this.proposals.push(...result.proposals);
      const currentYaml = await this.currentDeviceYaml();
      this.post({
        type: "answer",
        text: result.answer,
        proposals: result.proposals.map((p, i) => {
          const merged = currentYaml.length > 0 ? mergeManifestComments(currentYaml, p.yaml) : p.yaml;
          return {
            index: startIndex + i,
            summary: p.summary,
            deviceName: p.deviceName,
            files: p.files.length,
            diff: currentYaml.length > 0 ? renderDiff(currentYaml, merged) : merged,
          };
        }),
      });
    } catch (error) {
      const message =
        error instanceof ConfigError || error instanceof ProviderError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      this.post({ type: "error", message });
    }
  }

  // The device the assistant should act on: the live designer device if one is open (even
  // unsaved or blank), otherwise the active manifest file. This is what lets a request like
  // "make this a thermostat" target whatever the developer is currently building.
  private liveOrFile(): { yaml: string; source: string; uri: vscode.Uri | undefined } | undefined {
    const live = StudioPanel.liveDevice();
    if (live !== undefined) {
      return live;
    }
    const uri = this.deviceUri();
    return uri !== undefined ? { yaml: "", source: vscode.workspace.asRelativePath(uri), uri } : undefined;
  }

  // Builds the note appended to a prompt so the assistant knows which device is in context,
  // including its current manifest. Covers the live (unsaved) designer device and a file.
  private async deviceContextNote(): Promise<string> {
    const context = this.liveOrFile();
    if (context === undefined) {
      return "";
    }
    const yaml = context.yaml.length > 0 ? context.yaml : await this.currentDeviceYaml();
    return `\n\nThe device the developer is working on ("${context.source}") is currently:\n\`\`\`yaml\n${yaml}\n\`\`\`\nUpdate this device unless the request is clearly about a different one.`;
  }

  // The current manifest text of the device in context: the live designer form when open,
  // otherwise the active file's content, otherwise empty.
  private async currentDeviceYaml(): Promise<string> {
    const live = StudioPanel.liveDevice();
    if (live !== undefined) {
      return live.yaml;
    }
    const uri = this.deviceUri();
    if (uri === undefined) {
      return "";
    }
    return vscode.workspace.fs.readFile(uri).then(
      (bytes) => new TextDecoder().decode(bytes),
      () => "",
    );
  }

  private targetUri(): vscode.Uri | undefined {
    return StudioPanel.liveDevice()?.uri ?? this.deviceUri();
  }

  // Opens the proposed manifest in the visual designer, populated and live, instead of
  // writing a file. If a designer is already open it fills that same window in; the
  // developer reviews and edits on the real controls and saves from there.
  private openInDesigner(index: number): void {
    const proposal = this.proposals[index];
    if (proposal === undefined) {
      return;
    }
    const uri = this.targetUri();
    const source = uri !== undefined ? vscode.workspace.asRelativePath(uri) : (proposal.deviceName ?? "proposed device");
    StudioPanel.showManifest(this.context, proposal.yaml, source, uri);
  }

  private async apply(index: number): Promise<void> {
    const proposal = this.proposals[index];
    if (proposal === undefined) {
      this.post({ type: "applyCancelled", index });
      return;
    }
    let target = this.targetUri();
    if (target === undefined) {
      target = (await this.promptSaveTarget(proposal)) ?? undefined;
      // The save dialog was dismissed; tell the webview so the Apply button resets rather
      // than staying stuck in its pending state.
      if (target === undefined) {
        this.post({ type: "applyCancelled", index });
        return;
      }
    }
    try {
      const current = await vscode.workspace.fs.readFile(target).then(
        (bytes) => new TextDecoder().decode(bytes),
        () => "",
      );
      const finalYaml = current.length > 0 ? mergeManifestComments(current, proposal.yaml) : proposal.yaml;
      await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(finalYaml));
      this.activeUri = target;
      this.post({ type: "applied", index, source: vscode.workspace.asRelativePath(target) });
      void vscode.commands.executeCommand("chipwright.revealDevice", target);
    } catch (error) {
      this.post({
        type: "applyError",
        index,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async promptSaveTarget(proposal: DeviceProposal): Promise<vscode.Uri | undefined> {
    const options: vscode.SaveDialogOptions = {
      filters: { "Device manifest": ["yaml", "yml"] },
      saveLabel: "Create device manifest",
    };
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder !== undefined) {
      options.defaultUri = vscode.Uri.joinPath(folder.uri, proposal.deviceName ?? "device", "device.yaml");
    }
    return (await vscode.window.showSaveDialog(options)) ?? undefined;
  }

  private resolvePath(path: string): vscode.Uri {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder !== undefined && !path.startsWith("/")) {
      return vscode.Uri.joinPath(folder.uri, path);
    }
    return vscode.Uri.file(path);
  }

  // Sends the current settings to the webview so it can populate the settings sheet. The
  // API key is included only here, on an explicit open, rather than in every context
  // message, so it is not kept in the webview beyond editing it.
  private async sendSettings(): Promise<void> {
    const settings = vscode.workspace.getConfiguration("chipwright.assistant");
    this.post({
      type: "settings",
      provider: settings.get<string>("provider") ?? "anthropic",
      model: settings.get<string>("model") ?? "",
      baseUrl: settings.get<string>("baseUrl") ?? "",
      apiKey: (await this.context.secrets.get(SECRET_KEY)) ?? "",
    });
  }

  private async saveSettings(msg: {
    provider: string;
    model: string;
    baseUrl: string;
    apiKey: string;
  }): Promise<void> {
    const settings = vscode.workspace.getConfiguration("chipwright.assistant");
    await settings.update("provider", msg.provider, vscode.ConfigurationTarget.Global);
    await settings.update("model", msg.model, vscode.ConfigurationTarget.Global);
    await settings.update("baseUrl", msg.baseUrl, vscode.ConfigurationTarget.Global);
    if (msg.apiKey.length > 0) {
      await this.context.secrets.store(SECRET_KEY, msg.apiKey);
    } else {
      await this.context.secrets.delete(SECRET_KEY);
    }
    this.post({ type: "settingsSaved" });
    await this.sendContext();
  }

  // Sends the device context and the model label. The label is shown only when an API key
  // is set, so an unconfigured assistant shows just the settings icon and nothing else.
  private async sendContext(): Promise<void> {
    const device = this.deviceUri();
    const settings = vscode.workspace.getConfiguration("chipwright.assistant");
    const provider = (settings.get<string>("provider") ?? "anthropic") as ProviderName;
    const model = settings.get<string>("model");
    const hasKey = ((await this.context.secrets.get(SECRET_KEY)) ?? "").length > 0;
    this.post({
      type: "context",
      device: device !== undefined ? vscode.workspace.asRelativePath(device) : null,
      provider,
      model: model !== undefined && model.length > 0 ? model : defaultModel(provider),
      hasKey,
    });
  }

  private post(message: unknown): void {
    void this.panel.webview.postMessage(message);
  }

  private render(): string {
    const webview = this.panel.webview;
    const mediaRoot = vscode.Uri.joinPath(this.context.extensionUri, "media");
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "assistant.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, "assistant.css"));
    const nonce = createNonce();
    const home =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M10 2v3m4-3v3m-4 14v3m4-3v3M2 10h3m-3 4h3m14-4h3m-3 4h3"/></svg>';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link href="${styleUri.toString()}" rel="stylesheet">
<title>Chipwright Assistant</title>
</head>
<body>
<header class="topbar">
  <div class="wordmark"><span class="glyph">${home}</span><b>Assistant</b></div>
  <div class="context"><span class="sep">/</span><span class="device" id="ctx-device">no device</span></div>
  <span class="spring"></span>
  <span class="model" id="ctx-model"></span>
  <button class="icon-btn" id="key-btn" title="Settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="12" r="3"/><path d="M10 12h10"/><path d="M17 12v3"/><path d="M20 12v2.5"/></svg></button>
</header>

<section class="chat" id="chat">
  <div class="empty" id="empty">
    <div class="glyph-lg">${home}</div>
    <p>Diagnose issues, or describe a change and get a proposed manifest, checked against the compiler before you see it.</p>
  </div>
  <div class="transcript" id="transcript"></div>
</section>

<footer class="composer">
  <textarea id="input" rows="1" placeholder="Ask away..." autocomplete="off"></textarea>
  <button class="btn primary" id="send" title="Send"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 20V4l19 8Zm2-3 11.85-5L5 7v3.5l6 1.5-6 1.5Z"/></svg></button>
</footer>

<div class="sheet" id="settings" hidden>
  <div class="sheet-card">
    <h2>Settings</h2>
    <label class="field">Provider
      <select id="set-provider">
        <option value="anthropic">Anthropic</option>
        <option value="gemini">Gemini</option>
        <option value="openai-compatible">OpenAI-compatible</option>
      </select>
    </label>
    <label class="field">Model
      <input id="set-model" autocomplete="off" spellcheck="false" placeholder="provider default">
    </label>
    <label class="field" id="baseurl-field">Base URL
      <input id="set-baseurl" autocomplete="off" spellcheck="false" placeholder="e.g. http://localhost:11434/v1">
    </label>
    <label class="field">API key
      <span class="key-field">
        <input id="set-key" type="password" autocomplete="off" spellcheck="false" placeholder="stored in VS Code secret storage">
        <button class="icon-btn" id="reveal" title="Show or hide"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button>
      </span>
    </label>
    <div class="sheet-actions">
      <button class="btn" id="set-cancel">Cancel</button>
      <button class="btn primary" id="set-save">Save</button>
    </div>
  </div>
</div>

<script nonce="${nonce}" src="${scriptUri.toString()}"></script>
</body>
</html>
`;
  }

  private dispose(): void {
    AssistantPanel.current = undefined;
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
    this.panel.dispose();
  }
}

function createNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
