// Devices view for the OpenHome activity bar. It discovers device manifests by convention
// (device.yaml or *.device.yaml), then reads each through the studio core to show the real
// device name and validity status, so the view is a status-aware device list rather than a
// list of filenames. Discovery and presentation are all the adapter does; the manifest is
// only ever interpreted by the studio core.

import * as vscode from "vscode";
import * as path from "node:path";
import { validate } from "@openhome/studio-core";

export class DeviceTreeProvider implements vscode.TreeDataProvider<DeviceItem> {
  private readonly changed = new vscode.EventEmitter<DeviceItem | undefined | void>();
  readonly onDidChangeTreeData = this.changed.event;

  refresh(): void {
    this.changed.fire();
  }

  getTreeItem(element: DeviceItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<DeviceItem[]> {
    const found = await vscode.workspace.findFiles("**/{device.yaml,*.device.yaml}", "**/node_modules/**");
    const seen = new Set<string>();
    const unique = found.filter((uri) => (seen.has(uri.fsPath) ? false : (seen.add(uri.fsPath), true)));
    unique.sort((a, b) => a.fsPath.localeCompare(b.fsPath));
    return Promise.all(unique.map((uri) => this.describe(uri)));
  }

  private async describe(uri: vscode.Uri): Promise<DeviceItem> {
    let label = path.basename(path.dirname(uri.fsPath));
    let valid = false;
    let errors = 1;
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const result = validate(new TextDecoder().decode(bytes));
      valid = result.valid;
      errors = result.diagnostics.filter((d) => d.severity === "error").length;
      if (result.deviceName !== null) {
        label = result.deviceName;
      }
    } catch {
      // An unreadable candidate is shown by folder name and marked invalid.
    }
    return new DeviceItem(uri, label, valid, errors);
  }
}

class DeviceItem extends vscode.TreeItem {
  constructor(uri: vscode.Uri, label: string, valid: boolean, errors: number) {
    super(label, vscode.TreeItemCollapsibleState.None);
    const relative = vscode.workspace.asRelativePath(uri);
    this.description = valid ? relative : `${relative} · ${errors} error${errors === 1 ? "" : "s"}`;
    this.tooltip = uri.fsPath;
    this.resourceUri = uri;
    this.iconPath = valid
      ? new vscode.ThemeIcon("pass", new vscode.ThemeColor("testing.iconPassed"))
      : new vscode.ThemeIcon("warning", new vscode.ThemeColor("list.warningForeground"));
    this.command = {
      command: "openhome.openDesigner",
      title: "Open Device Designer",
      arguments: [uri],
    };
  }
}
