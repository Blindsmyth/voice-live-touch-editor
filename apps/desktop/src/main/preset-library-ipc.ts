import { app, ipcMain, dialog } from "electron";
import {
  mkdir,
  readdir,
  readFile,
  writeFile,
  cp,
} from "node:fs/promises";
import { join } from "node:path";

function userDataRoot(): string {
  return join(app.getPath("userData"), "preset-library");
}

function backupsRoot(): string {
  return join(userDataRoot(), "backups");
}

export function registerPresetLibraryIpc(): void {
  ipcMain.handle("preset-library:getPaths", () => ({
    root: userDataRoot(),
    backups: backupsRoot(),
  }));

  ipcMain.handle("preset-library:ensureDirs", async () => {
    await mkdir(backupsRoot(), { recursive: true });
    return backupsRoot();
  });

  ipcMain.handle("preset-library:listBackups", async () => {
    await mkdir(backupsRoot(), { recursive: true });
    const entries = await readdir(backupsRoot(), { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort().reverse();
  });

  ipcMain.handle(
    "preset-library:backupWorkspace",
    async (_e, files: { name: string; content: string }[]) => {
      await mkdir(backupsRoot(), { recursive: true });
      const id = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const dir = join(backupsRoot(), id);
      await mkdir(dir, { recursive: true });
      for (const f of files) {
        await writeFile(join(dir, f.name), f.content, "utf8");
      }
      return dir;
    }
  );

  ipcMain.handle("preset-library:readBackupFile", async (_e, backupId: string, fileName: string) => {
    const path = join(backupsRoot(), backupId, fileName);
    return readFile(path, "utf8");
  });

  ipcMain.handle("preset-library:saveExportFile", async (_e, defaultName: string, content: string, binary?: boolean) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: binary
        ? [{ name: "SysEx", extensions: ["syx"] }]
        : [{ name: "Voice Live Touch Preset", extensions: ["vltpreset.json", "json"] }],
    });
    if (canceled || !filePath) return null;
    if (binary) {
      const buf = Buffer.from(content, "base64");
      await writeFile(filePath, buf);
    } else {
      await writeFile(filePath, content, "utf8");
    }
    return filePath;
  });

  ipcMain.handle("preset-library:openImportFile", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      filters: [
        { name: "Preset files", extensions: ["vltpreset.json", "json", "syx"] },
        { name: "All", extensions: ["*"] },
      ],
      properties: ["openFile"],
    });
    if (canceled || !filePaths[0]) return null;
    const path = filePaths[0];
    if (path.endsWith(".syx")) {
      const buf = await readFile(path);
      return { kind: "syx" as const, base64: buf.toString("base64") };
    }
    const text = await readFile(path, "utf8");
    return { kind: "json" as const, text };
  });

  ipcMain.handle("preset-library:copyBackupToWorkspace", async (_e, backupId: string) => {
    const src = join(backupsRoot(), backupId);
    const dest = join(userDataRoot(), "workspace-import");
    await cp(src, dest, { recursive: true, force: true });
    return dest;
  });
}
