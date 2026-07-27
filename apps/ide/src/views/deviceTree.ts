// Devices view for the OpenHome activity bar. Devices are discovered two ways and merged:
// by convention (device.yaml or *.device.yaml anywhere in the workspace) and by explicit
// registration when one is saved through the IDE. Registration means a device shows up the
// moment it is saved, even under a non-conventional name or outside the workspace, and it
// survives a reload because the set is persisted. Each device is read through the studio
// core so the view shows the real device name and validity rather than a filename.

import * as vscode from "vscode";
import * as path from "node:path";
import { validate } from "@chipwright/studio-core";

const KNOWN_KEY = "openhome.knownDevices";

export class DeviceTreeProvider implements vscode.TreeDataProvider<DeviceItem> {
  private readonly changed = new vscode.EventEmitter<DeviceItem | undefined | void>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly known: Set<string>;

  constructor(private readonly memento: vscode.Memento) {
    this.known = new Set(memento.get<string[]>(KNOWN_KEY, []));
  }

  refresh(): void {
    this.changed.fire();
  }

  // Records a device saved through the IDE so it appears in the view regardless of its file
  // name or location, and persists the set for future sessions.
  register(uri: vscode.Uri): void {
    if (!this.known.has(uri.fsPath)) {
      this.known.add(uri.fsPath);
      void this.memento.update(KNOWN_KEY, [...this.known]);
    }
    this.refresh();
  }

  getTreeItem(element: DeviceItem): vscode.TreeItem {
    return element;
  }

  // The view is flat, so every device is a root with no parent. Implemented so the tree
  // view can reveal a device after it is saved.
  getParent(): vscode.ProviderResult<DeviceItem> {
    return undefined;
  }

  async getChildren(): Promise<DeviceItem[]> {
    const found = await vscode.workspace.findFiles("**/{device.yaml,*.device.yaml}", "**/node_modules/**");
    const paths = new Map<string, vscode.Uri>();
    for (const uri of found) {
      paths.set(uri.fsPath, uri);
    }
    for (const fsPath of this.known) {
      if (paths.has(fsPath)) {
        continue;
      }
      const uri = vscode.Uri.file(fsPath);
      if (await exists(uri)) {
        paths.set(fsPath, uri);
      } else {
        this.forget(fsPath);
      }
    }
    const uris = [...paths.values()].sort((a, b) => a.fsPath.localeCompare(b.fsPath));
    return Promise.all(uris.map((uri) => this.describe(uri)));
  }

  // Builds the tree item for a single device, used to reveal a device after saving it.
  item(uri: vscode.Uri): Promise<DeviceItem> {
    return this.describe(uri);
  }

  private forget(fsPath: string): void {
    if (this.known.delete(fsPath)) {
      void this.memento.update(KNOWN_KEY, [...this.known]);
    }
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

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

class DeviceItem extends vscode.TreeItem {
  constructor(uri: vscode.Uri, label: string, valid: boolean, errors: number) {
    super(label, vscode.TreeItemCollapsibleState.None);
    const relative = vscode.workspace.asRelativePath(uri);
    // A stable id lets the tree view reveal and select this device after it is saved.
    this.id = uri.fsPath;
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
