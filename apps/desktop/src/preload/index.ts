import { contextBridge, ipcRenderer } from "electron";

export interface PresetLibraryApi {
  getPaths: () => Promise<{ root: string; backups: string }>;
  ensureDirs: () => Promise<string>;
  listBackups: () => Promise<string[]>;
  backupWorkspace: (files: { name: string; content: string }[]) => Promise<string>;
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
  backupWorkspace: (files: { name: string; content: string }[]) =>
    ipcRenderer.invoke("preset-library:backupWorkspace", files),
  readBackupFile: (backupId: string, fileName: string) =>
    ipcRenderer.invoke("preset-library:readBackupFile", backupId, fileName),
  saveExportFile: (defaultName: string, content: string, binary?: boolean) =>
    ipcRenderer.invoke("preset-library:saveExportFile", defaultName, content, binary),
  openImportFile: () => ipcRenderer.invoke("preset-library:openImportFile"),
} satisfies PresetLibraryApi);
