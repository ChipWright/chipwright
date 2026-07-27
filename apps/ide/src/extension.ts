// VS Code extension entry point. This is the thin adapter layer: it registers the Devices
// view and the Chipwright commands, and hands every real operation to the studio core through
// the webview panel. No manifest handling or twin logic lives here.

import * as vscode from "vscode";
import { DeviceTreeProvider } from "./views/deviceTree.js";
import { StudioPanel } from "./panels/studioPanel.js";
import { AssistantPanel } from "./panels/assistantPanel.js";

export function activate(context: vscode.ExtensionContext): void {
  const devices = new DeviceTreeProvider(context.workspaceState);
  const devicesView = vscode.window.createTreeView("chipwright.devices", { treeDataProvider: devices });

  context.subscriptions.push(
    devicesView,
    vscode.commands.registerCommand("chipwright.newDevice", () => {
      StudioPanel.newDevice(context);
    }),
    vscode.commands.registerCommand("chipwright.openDesigner", (uri?: vscode.Uri) => {
      StudioPanel.show(context, "designer", uri);
    }),
    vscode.commands.registerCommand("chipwright.openManifest", async () => {
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        canSelectFiles: true,
        canSelectFolders: false,
        filters: { "Device manifest": ["yaml", "yml"] },
        openLabel: "Open device manifest",
      });
      const uri = picked?.[0];
      if (uri !== undefined) {
        StudioPanel.show(context, "designer", uri);
      }
    }),
    vscode.commands.registerCommand("chipwright.debugTwin", (uri?: vscode.Uri) => {
      StudioPanel.show(context, "twin", uri);
    }),
    vscode.commands.registerCommand("chipwright.openAssistant", (uri?: vscode.Uri) => {
      AssistantPanel.show(context, uri);
    }),
    vscode.commands.registerCommand("chipwright.refreshDevices", () => {
      devices.refresh();
    }),
    // Called after a device is saved (from the designer or the assistant) so it appears in
    // the Devices view immediately and is selected, even if its file name is unconventional.
    vscode.commands.registerCommand("chipwright.revealDevice", async (uri: vscode.Uri) => {
      devices.register(uri);
      try {
        const item = await devices.item(uri);
        await devicesView.reveal(item, { select: true, focus: false });
      } catch {
        // Reveal is best-effort; the device is already registered and shown by refresh.
      }
    }),
  );
}

export function deactivate(): void {}
