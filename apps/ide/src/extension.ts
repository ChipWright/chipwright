// VS Code extension entry point. This is the thin adapter layer: it registers the Devices
// view and the OpenHome commands, and hands every real operation to the studio core through
// the webview panel. No manifest handling or twin logic lives here.

import * as vscode from "vscode";
import { DeviceTreeProvider } from "./views/deviceTree.js";
import { StudioPanel } from "./panels/studioPanel.js";

export function activate(context: vscode.ExtensionContext): void {
  const devices = new DeviceTreeProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("openhome.devices", devices),
    vscode.commands.registerCommand("openhome.openDesigner", (uri?: vscode.Uri) => {
      StudioPanel.show(context, "designer", uri);
    }),
    vscode.commands.registerCommand("openhome.debugTwin", (uri?: vscode.Uri) => {
      StudioPanel.show(context, "twin", uri);
    }),
    vscode.commands.registerCommand("openhome.refreshDevices", () => {
      devices.refresh();
    }),
  );
}

export function deactivate(): void {}
