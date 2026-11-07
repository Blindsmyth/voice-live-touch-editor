import { app, ipcMain, dialog, shell } from "electron";
import {
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";

export interface BackupInfo {
  id: string;
  label: string;
  created: string;
  count: number;
}

/** Reject ids that could escape the backups folder. */
function backupDir(backupId: string): string {
  if (!backupId || basename(backupId) !== backupId) {
    throw new Error("Invalid backup id");
  }
  return join(backupsRoot(), backupId);
}

async function readBackupInfo(id: string): Promise<BackupInfo> {
  const dir = backupDir(id);
  let label = id.replace(/_/g, " ");
  let created = id;
  let count = 0;
  try {
    const meta = JSON.parse(await readFile(join(dir, "meta.json"), "utf8"));
    label = meta.label ?? label;
    created = meta.created ?? created;
    count = meta.count ?? 0;
  } catch {
    // Backups made before meta.json existed: count preset files instead.
    const files = await readdir(dir).catch(() => [] as string[]);
    count = files.filter((n) => n.startsWith("preset-")).length;
  }
  return { id, label, created, count };
}

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
    const ids = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort().reverse();
    return Promise.all(ids.map(readBackupInfo));
  });

  ipcMain.handle(
    "preset-library:backupWorkspace",
    async (
      _e,
      files: { name: string; content: string }[],
      meta?: { label?: string; count?: number }
    ) => {
      await mkdir(backupsRoot(), { recursive: true });
      const id = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const dir = join(backupsRoot(), id);
      await mkdir(dir, { recursive: true });
      for (const f of files) {
        await writeFile(join(dir, basename(f.name)), f.content, "utf8");
      }
      await writeFile(
        join(dir, "meta.json"),
        JSON.stringify({
          label: meta?.label ?? id.replace(/_/g, " "),
          created: new Date().toISOString(),
          count: meta?.count ?? 0,
        }),
        "utf8"
      );
      return id;
    }
  );

  ipcMain.handle("preset-library:readBackupFile", async (_e, backupId: string, fileName: string) => {
    return readFile(join(backupDir(backupId), basename(fileName)), "utf8");
  });

  ipcMain.handle("preset-library:renameBackup", async (_e, backupId: string, label: string) => {
    const info = await readBackupInfo(backupId);
    await writeFile(
      join(backupDir(backupId), "meta.json"),
      JSON.stringify({ label, created: info.created, count: info.count }),
      "utf8"
    );
  });

  ipcMain.handle("preset-library:deleteBackup", async (_e, backupId: string) => {
    await shell.trashItem(backupDir(backupId));
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
}
