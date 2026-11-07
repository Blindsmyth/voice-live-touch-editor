import { useEffect, useMemo, useRef, useState } from "react";
import {
  allLibrarySlots,
  presetSlotLabel,
  type BackupScope,
  type BulkProgress,
  type PresetSnapshot,
  type WorkspaceEntry,
} from "@vlt/core";
import type { BackupInfo } from "../preload/index.js";
import type { ExportFormat, SyncStage } from "./context/MidiContext.js";

export interface PresetLibraryPanelProps {
  workspace: WorkspaceEntry[];
  backups: BackupInfo[];
  libraryStatus: string;
  connected: boolean;
  bulkActive: boolean;
  bulkProgress: BulkProgress;
  syncStage: SyncStage;
  autoBackup: boolean;
  selectedSlots: number[];
  onSelectSlots: (slots: number[]) => void;
  onEdit: (slot: number) => void;
  onSync: () => void;
  onCancelBulk: () => void;
  onApply: () => void;
  onBackup: (scope: BackupScope) => void;
  onExport: (slots: number[], format: ExportFormat) => void;
  onImport: () => void;
  onAutoBackupChange: (v: boolean) => void;
  onCopy: (from: number, to: number) => void;
  onSwap: (a: number, b: number) => void;
  onRefreshBackups: () => void;
  onRestoreBackup: (backupId: string) => void;
  onRenameBackup: (backupId: string, label: string) => void;
  onDeleteBackup: (backupId: string) => void;
  onReadBackup: (backupId: string) => Promise<PresetSnapshot[]>;
  onCopyFromBackup: (backupId: string, from: number, to: number) => void;
}

type DragPayload =
  | { kind: "slot"; slot: number }
  | { kind: "backup"; backupId: string; slot: number };

const DRAG_TYPE = "application/x-vlt-preset";
const SLOTS = allLibrarySlots();

/** Electron has no window.prompt, so text input goes through this small modal. */
interface TextPrompt {
  title: string;
  initial: string;
  numeric?: boolean;
  onSubmit: (value: string) => void;
}

function PromptDialog({ prompt, onClose }: { prompt: TextPrompt; onClose: () => void }) {
  const [value, setValue] = useState(prompt.initial);
  const submit = () => {
    prompt.onSubmit(value.trim());
    onClose();
  };
  return (
    <div className="vs-modal-backdrop" onClick={onClose}>
      <form
        className="vs-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label>
          {prompt.title}
          <input
            autoFocus
            type={prompt.numeric ? "number" : "text"}
            min={prompt.numeric ? 1 : undefined}
            max={prompt.numeric ? 300 : undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onClose()}
          />
        </label>
        <div className="vs-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit">OK</button>
        </div>
      </form>
    </div>
  );
}

function parseSlot(value: string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 300 ? n : null;
}

export function PresetLibraryPanel(props: PresetLibraryPanelProps) {
  const {
    workspace,
    backups,
    libraryStatus,
    connected,
    bulkActive,
    bulkProgress,
    syncStage,
    autoBackup,
    selectedSlots,
    onSelectSlots,
  } = props;
  const [backupScope, setBackupScope] = useState<BackupScope>("user");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("json");
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [backupPresets, setBackupPresets] = useState<PresetSnapshot[]>([]);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [prompt, setPrompt] = useState<TextPrompt | null>(null);
  const anchorRef = useRef<number | null>(null);

  const bySlot = useMemo(
    () => new Map(workspace.map((e) => [e.slot, e])),
    [workspace]
  );
  const dirtyCount = workspace.filter((e) => e.dirty).length;
  const partialCount = workspace.filter((e) => e.partial).length;
  const selected = useMemo(() => new Set(selectedSlots), [selectedSlots]);
  const single = selectedSlots.length === 1 ? selectedSlots[0] : null;

  useEffect(() => {
    if (!selectedBackup) {
      setBackupPresets([]);
      return;
    }
    let live = true;
    props
      .onReadBackup(selectedBackup)
      .then((p) => live && setBackupPresets(p))
      .catch(() => live && setBackupPresets([]));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBackup, backups]);

  const clickSlot = (slot: number, e: React.MouseEvent) => {
    if (e.shiftKey && anchorRef.current != null) {
      const [lo, hi] = [anchorRef.current, slot].sort((a, b) => a - b);
      props.onSelectSlots(SLOTS.filter((s) => s >= lo && s <= hi));
      return;
    }
    anchorRef.current = slot;
    if (e.metaKey || e.ctrlKey) {
      props.onSelectSlots(
        selected.has(slot)
          ? selectedSlots.filter((s) => s !== slot)
          : [...selectedSlots, slot]
      );
    } else {
      props.onSelectSlots([slot]);
    }
  };

  const onDrop = (target: number, e: React.DragEvent) => {
    e.preventDefault();
    setDropTarget(null);
    let payload: DragPayload;
    try {
      payload = JSON.parse(e.dataTransfer.getData(DRAG_TYPE));
    } catch {
      return;
    }
    if (payload.kind === "backup") {
      props.onCopyFromBackup(payload.backupId, payload.slot, target);
    } else if (payload.slot !== target) {
      if (e.altKey) props.onSwap(payload.slot, target);
      else props.onCopy(payload.slot, target);
    }
  };

  const dragStart = (payload: DragPayload, e: React.DragEvent) => {
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copyMove";
  };

  const progressPct =
    bulkProgress.total > 0
      ? Math.round((bulkProgress.done / bulkProgress.total) * 100)
      : 0;
  const stageLabel =
    syncStage === "headers"
      ? "Reading preset names"
      : syncStage === "full"
        ? "Loading preset data"
        : bulkProgress.mode === "send-all"
          ? "Applying to device"
          : "Working";

  return (
    <div className="vs-library">
      <div className="vs-toolbar">
        <button type="button" disabled={!connected || bulkActive} onClick={props.onSync}>
          Sync
        </button>
        <button
          type="button"
          disabled={!connected || bulkActive || dirtyCount === 0}
          onClick={props.onApply}
        >
          Apply{dirtyCount > 0 ? ` (${dirtyCount})` : ""}
        </button>
        <span className="vs-group">
          <select
            value={backupScope}
            onChange={(e) => setBackupScope(e.target.value as BackupScope)}
            aria-label="Backup scope"
          >
            <option value="user">Backup User</option>
            <option value="selected">Backup Selected</option>
            <option value="all">Backup All</option>
          </select>
          <button type="button" className="secondary" onClick={() => props.onBackup(backupScope)}>
            Backup
          </button>
        </span>
        <button
          type="button"
          className="secondary"
          disabled={!selectedBackup}
          onClick={() => selectedBackup && props.onRestoreBackup(selectedBackup)}
        >
          Restore
        </button>
        <span className="vs-group">
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
            aria-label="Export format"
          >
            <option value="json">.vltpreset.json</option>
            <option value="syx">.syx</option>
          </select>
          <button
            type="button"
            className="secondary"
            disabled={selectedSlots.length === 0}
            onClick={() => props.onExport(selectedSlots, exportFormat)}
          >
            Export
          </button>
        </span>
        <button type="button" className="secondary" onClick={props.onImport}>
          Import
        </button>
        <label className="vs-check">
          <input
            type="checkbox"
            checked={autoBackup}
            onChange={(e) => props.onAutoBackupChange(e.target.checked)}
          />
          Auto-backup
        </label>
      </div>

      {(bulkActive || partialCount > 0) && (
        <div className="vs-progress">
          <div className="vs-progress-bar">
            <div style={{ width: `${bulkActive ? progressPct : 100}%` }} />
          </div>
          <span>
            {bulkActive
              ? `${stageLabel} — ${bulkProgress.done}/${bulkProgress.total}`
              : `${partialCount} preset(s) names only — open one to load it`}
          </span>
          {bulkActive && (
            <button type="button" className="secondary small-btn" onClick={props.onCancelBulk}>
              Cancel
            </button>
          )}
        </div>
      )}

      <div className="vs-panes">
        <section className="vs-pane">
          <header>
            <h2>Working Data</h2>
            <div className="vs-actions">
              <button
                type="button"
                className="secondary small-btn"
                disabled={single == null}
                onClick={() => single != null && props.onEdit(single)}
              >
                Edit
              </button>
              <button
                type="button"
                className="secondary small-btn"
                disabled={single == null}
                onClick={() =>
                  single != null &&
                  setPrompt({
                    title: `Copy preset ${single} to slot (1–300)`,
                    initial: "",
                    numeric: true,
                    onSubmit: (v) => {
                      const to = parseSlot(v);
                      if (to != null) props.onCopy(single, to);
                    },
                  })
                }
              >
                Copy to…
              </button>
              <button
                type="button"
                className="secondary small-btn"
                disabled={single == null}
                onClick={() =>
                  single != null &&
                  setPrompt({
                    title: `Swap preset ${single} with slot (1–300)`,
                    initial: "",
                    numeric: true,
                    onSubmit: (v) => {
                      const b = parseSlot(v);
                      if (b != null) props.onSwap(single, b);
                    },
                  })
                }
              >
                Swap with…
              </button>
            </div>
          </header>
          <p className="vs-hint">
            Drag a preset onto another slot to copy it; hold Option to swap.
          </p>
          <ul className="vs-list">
            {SLOTS.map((slot) => {
              const entry = bySlot.get(slot);
              const cls = [
                "vs-row",
                selected.has(slot) ? "selected" : "",
                dropTarget === slot ? "drop" : "",
                entry ? "" : "empty",
              ].join(" ");
              return (
                <li
                  key={slot}
                  className={cls}
                  draggable={!!entry && !entry.partial}
                  onDragStart={(e) => dragStart({ kind: "slot", slot }, e)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropTarget(slot);
                  }}
                  onDragLeave={() => setDropTarget((t) => (t === slot ? null : t))}
                  onDrop={(e) => onDrop(slot, e)}
                  onClick={(e) => clickSlot(slot, e)}
                  onDoubleClick={() => props.onEdit(slot)}
                >
                  <span className="ws-slot">{presetSlotLabel(slot).replace("Preset ", "")}</span>
                  <span className="ws-name">{entry ? entry.name || "(unnamed)" : "—"}</span>
                  {entry?.partial && <span className="vs-tag" title="Data not loaded yet">name</span>}
                  {entry?.dirty && <span className="ws-dirty" title="Not applied to device">*</span>}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="vs-pane">
          <header>
            <h2>Archives</h2>
            <button type="button" className="secondary small-btn" onClick={props.onRefreshBackups}>
              Refresh
            </button>
          </header>
          {backups.length === 0 ? (
            <p className="vlt-empty small">No backups yet — Backup runs automatically after a sync.</p>
          ) : (
            <ul className="vs-list vs-archives">
              {backups.map((b) => (
                <li
                  key={b.id}
                  className={selectedBackup === b.id ? "vs-row selected" : "vs-row"}
                  onClick={() => setSelectedBackup(b.id)}
                  onDoubleClick={() =>
                    setPrompt({
                      title: "Rename backup",
                      initial: b.label,
                      onSubmit: (v) => v && props.onRenameBackup(b.id, v),
                    })
                  }
                >
                  <span className="ws-name" title={b.id}>
                    {b.label}
                  </span>
                  <span className="vs-tag">{b.count}</span>
                  <button
                    type="button"
                    className="secondary small-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onDeleteBackup(b.id);
                      if (selectedBackup === b.id) setSelectedBackup(null);
                    }}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedBackup && (
            <>
              <h3>Presets in backup</h3>
              <p className="vs-hint">Drag onto a Working Data slot to copy it in.</p>
              <ul className="vs-list vs-backup-presets">
                {backupPresets.map((p) => (
                  <li
                    key={p.number}
                    className="vs-row"
                    draggable
                    onDragStart={(e) =>
                      dragStart({ kind: "backup", backupId: selectedBackup, slot: p.number }, e)
                    }
                  >
                    <span className="ws-slot">{p.number}</span>
                    <span className="ws-name">{p.name || "(unnamed)"}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      {libraryStatus && <p className="library-status">{libraryStatus}</p>}
      {prompt && <PromptDialog prompt={prompt} onClose={() => setPrompt(null)} />}
    </div>
  );
}
