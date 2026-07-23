// Devices view for the OpenHome activity bar. It lists every device manifest in the
// workspace and opens the designer for one when selected. Discovery is all the adapter
// does; the manifest itself is only ever interpreted by the studio core.

import * as vscode from "vscode";
import * as path from "node:path";

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
    const files = await vscode.workspace.findFiles("**/device.yaml", "**/node_modules/**");
    files.sort((a, b) => a.fsPath.localeCompare(b.fsPath));
    return files.map((uri) => new DeviceItem(uri));
  }
}

class DeviceItem extends vscode.TreeItem {
  constructor(public readonly uri: vscode.Uri) {
    super(path.basename(path.dirname(uri.fsPath)), vscode.TreeItemCollapsibleState.None);
    this.description = vscode.workspace.asRelativePath(uri);
    this.resourceUri = uri;
    this.iconPath = new vscode.ThemeIcon("circuit-board");
    this.command = {
      command: "openhome.openDesigner",
      title: "Open Device Designer",
      arguments: [uri],
    };
  }
}
