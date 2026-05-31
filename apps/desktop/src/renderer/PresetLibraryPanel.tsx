import type { WorkspaceEntry } from "@vlt/core";

export interface PresetLibraryPanelProps {
  workspace: WorkspaceEntry[];
  backups: string[];
  libraryStatus: string;
  connected: boolean;
  selectedWorkspaceSlot: number | null;
  onSelectSlot: (slot: number) => void;
  onBackupWorkspace: () => void;
  onExportSelected: () => void;
  onImport: () => void;
  onSendToDevice: () => void;
  onRefreshBackups: () => void;
}

export function PresetLibraryPanel({
  workspace,
  backups,
  libraryStatus,
  connected,
  selectedWorkspaceSlot,
  onSelectSlot,
  onBackupWorkspace,
  onExportSelected,
  onImport,
  onSendToDevice,
  onRefreshBackups,
}: PresetLibraryPanelProps) {
  return (
    <aside className="library-panel">
      <h2>Library</h2>
      <p className="subtitle">Local workspace & backups (VoiceSupport-style)</p>
      <div className="library-actions">
        <button type="button" className="secondary" onClick={onBackupWorkspace}>
          Backup workspace
        </button>
        <button type="button" className="secondary" onClick={onExportSelected}>
          Export
        </button>
        <button type="button" className="secondary" onClick={onImport}>
          Import
        </button>
        <button type="button" disabled={!connected} onClick={onSendToDevice}>
          Send to device
        </button>
      </div>
      {libraryStatus && <p className="library-status">{libraryStatus}</p>}
      <h3>Workspace</h3>
      {workspace.length === 0 ? (
        <p className="vlt-empty small">Load presets from device to fill workspace.</p>
      ) : (
        <ul className="workspace-list">
          {workspace.map((e) => (
            <li key={e.slot}>
              <button
                type="button"
                className={
                  selectedWorkspaceSlot === e.slot
                    ? "workspace-item active"
                    : "workspace-item"
                }
                onClick={() => onSelectSlot(e.slot)}
              >
                <span className="ws-slot">{e.slot}</span>
                <span className="ws-name">{e.name || "(unnamed)"}</span>
                {e.dirty && <span className="ws-dirty">*</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3>Backups</h3>
      <button type="button" className="secondary small-btn" onClick={onRefreshBackups}>
        Refresh
      </button>
      {backups.length === 0 ? (
        <p className="vlt-empty small">No backups yet.</p>
      ) : (
        <ul className="backup-list">
          {backups.slice(0, 8).map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
    </aside>
  );
}
