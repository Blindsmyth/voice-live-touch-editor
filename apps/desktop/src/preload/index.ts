import { contextBridge, ipcRenderer } from "electron";

export interface BackupInfo {
  id: string;
  label: string;
  created: string;
  count: number;
}

export interface PresetLibraryApi {
  getPaths: () => Promise<{ root: string; backups: string }>;
  ensureDirs: () => Promise<string>;
  listBackups: () => Promise<BackupInfo[]>;
  backupWorkspace: (
    files: { name: string; content: string }[],
    meta?: { label?: string; count?: number }
  ) => Promise<string>;
  renameBackup: (backupId: string, label: string) => Promise<void>;
  deleteBackup: (backupId: string) => Promise<void>;
  readBackupFile: (backupId: string, fileName: string) => Promise<string>;
  saveExportFile: (
    defaultName: string,
    content: string,
    binary?: boolean
  ) => Promise<string | null>;
  openImportFile: () => Promise<
    | { kind: "json"; text: string }
    | { kind: "syx"; base64: string }
    | null
  >;
}

contextBridge.exposeInMainWorld("presetLibrary", {
  getPaths: () => ipcRenderer.invoke("preset-library:getPaths"),
  ensureDirs: () => ipcRenderer.invoke("preset-library:ensureDirs"),
  listBackups: () => ipcRenderer.invoke("preset-library:listBackups"),
  backupWorkspace: (
    files: { name: string; content: string }[],
    meta?: { label?: string; count?: number }
  ) => ipcRenderer.invoke("preset-library:backupWorkspace", files, meta),
  renameBackup: (backupId: string, label: string) =>
    ipcRenderer.invoke("preset-library:renameBackup", backupId, label),
  deleteBackup: (backupId: string) =>
    ipcRenderer.invoke("preset-library:deleteBackup", backupId),
  readBackupFile: (backupId: string, fileName: string) =>
    ipcRenderer.invoke("preset-library:readBackupFile", backupId, fileName),
  saveExportFile: (defaultName: string, content: string, binary?: boolean) =>
    ipcRenderer.invoke("preset-library:saveExportFile", defaultName, content, binary),
  openImportFile: () => ipcRenderer.invoke("preset-library:openImportFile"),
} satisfies PresetLibraryApi);
