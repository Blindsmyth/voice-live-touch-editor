import { useState } from "react";
import type { WorkspaceEntry } from "@vlt/core";

export interface PresetLibraryPanelProps {
  workspace: WorkspaceEntry[];
  backups: string[];
  libraryStatus: string;
  connected: boolean;
  bulkActive: boolean;
  selectedWorkspaceSlot: number | null;
  onSelectSlot: (slot: number) => void;
  onLoadAllNames: () => void;
  onLoadAllFull: () => void;
  onCancelBulk: () => void;
  onBackupWorkspace: () => void;
  onExportSelected: () => void;
  onImport: () => void;
  onSendToDevice: () => void;
  onSendAllToDevice: () => void;
  onCopy: (from: number, to: number) => void;
  onSwap: (a: number, b: number) => void;
  onRefreshBackups: () => void;
}

export function PresetLibraryPanel({
  workspace,
  backups,
  libraryStatus,
  connected,
  bulkActive,
  selectedWorkspaceSlot,
  onSelectSlot,
  onLoadAllNames,
  onLoadAllFull,
  onCancelBulk,
  onBackupWorkspace,
  onExportSelected,
  onImport,
  onSendToDevice,
  onSendAllToDevice,
  onCopy,
  onSwap,
  onRefreshBackups,
}: PresetLibraryPanelProps) {
  const [copyFrom, setCopyFrom] = useState("1");
  const [copyTo, setCopyTo] = useState("2");
  const [swapA, setSwapA] = useState("1");
  const [swapB, setSwapB] = useState("2");

  return (
    <aside className="library-panel">
      <h2>Library</h2>
      <p className="subtitle">Workspace, snapshots & bulk device sync</p>

      <h3>Device sync</h3>
      <div className="library-actions">
        <button
          type="button"
          className="secondary"
          disabled={!connected || bulkActive}
          onClick={onLoadAllNames}
        >
          Load all names
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!connected || bulkActive}
          onClick={onLoadAllFull}
        >
          Load all (full)
        </button>
        <button
          type="button"
          disabled={!connected || bulkActive || workspace.length === 0}
          onClick={onSendAllToDevice}
        >
          Send all to device
        </button>
        {bulkActive && (
          <button type="button" className="secondary" onClick={onCancelBulk}>
            Cancel
          </button>
        )}
      </div>

      <h3>Workspace tools</h3>
      <div className="library-row">
        <label>
          Copy
          <input
            type="number"
            min={1}
            max={300}
            value={copyFrom}
            onChange={(e) => setCopyFrom(e.target.value)}
          />
        </label>
        <span>→</span>
        <label>
          To
          <input
            type="number"
            min={1}
            max={300}
            value={copyTo}
            onChange={(e) => setCopyTo(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="secondary"
          onClick={() => onCopy(Number(copyFrom), Number(copyTo))}
        >
          Copy
        </button>
      </div>
      <div className="library-row">
        <label>
          Swap
          <input
            type="number"
            min={1}
            max={300}
            value={swapA}
            onChange={(e) => setSwapA(e.target.value)}
          />
        </label>
        <span>↔</span>
        <label>
          With
          <input
            type="number"
            min={1}
            max={300}
            value={swapB}
            onChange={(e) => setSwapB(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="secondary"
          onClick={() => onSwap(Number(swapA), Number(swapB))}
        >
          Swap
        </button>
      </div>

      <h3>Files</h3>
      <div className="library-actions">
        <button type="button" className="secondary" onClick={onBackupWorkspace}>
          Save snapshot (dated)
        </button>
        <button type="button" className="secondary" onClick={onExportSelected}>
          Export one
        </button>
        <button type="button" className="secondary" onClick={onImport}>
          Import
        </button>
        <button
          type="button"
          disabled={!connected || bulkActive}
          onClick={onSendToDevice}
        >
          Send selected
        </button>
      </div>

      {libraryStatus && <p className="library-status">{libraryStatus}</p>}

      <h3>Workspace ({workspace.length})</h3>
      {workspace.length === 0 ? (
        <p className="vlt-empty small">
          Use Load all names on the device to fill the slot list and workspace.
        </p>
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
        <p className="vlt-empty small">No snapshots yet — use Save snapshot.</p>
      ) : (
        <ul className="backup-list">
          {backups.slice(0, 12).map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
    </aside>
  );
}
