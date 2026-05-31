import { canSaveToPresetSlot } from "@vlt/core";

export interface PresetBarProps {
  presetSlot: number;
  slotOptions: { value: number; label: string }[];
  onPresetSlotChange: (slot: number) => void;
  presetName: string;
  onPresetNameChange: (name: string) => void;
  onLoad: () => void;
  onLoadAll: () => void;
  onCancelBulk: () => void;
  onSave: () => void;
  transferStatus: string;
  hasLoadedSnapshot: boolean;
  connected: boolean;
  bulkActive: boolean;
}

export function PresetBar({
  presetSlot,
  slotOptions,
  onPresetSlotChange,
  presetName,
  onPresetNameChange,
  onLoad,
  onLoadAll,
  onCancelBulk,
  onSave,
  transferStatus,
  hasLoadedSnapshot,
  connected,
  bulkActive,
}: PresetBarProps) {
  return (
    <div className="preset-bar">
      <label>
        Slot
        <select
          value={presetSlot}
          disabled={!connected || bulkActive}
          onChange={(e) => onPresetSlotChange(Number(e.target.value))}
        >
          {slotOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Name
        <input
          type="text"
          maxLength={15}
          value={presetName}
          disabled={!connected || bulkActive}
          placeholder="(15 chars max)"
          onChange={(e) => onPresetNameChange(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="secondary"
        disabled={!connected || bulkActive}
        onClick={onLoad}
      >
        Load from device
      </button>
      <button
        type="button"
        className="secondary"
        disabled={!connected || bulkActive}
        title="Load all 275 user presets (full data) — do this first"
        onClick={onLoadAll}
      >
        Load all
      </button>
      {bulkActive && (
        <button type="button" className="secondary" onClick={onCancelBulk}>
          Cancel bulk
        </button>
      )}
      <button
        type="button"
        disabled={!connected || !canSaveToPresetSlot(presetSlot) || bulkActive}
        title={
          !canSaveToPresetSlot(presetSlot)
            ? "Slot 0 is the live step — save to preset 1–275 or a favorite"
            : undefined
        }
        onClick={onSave}
      >
        Save to device
      </button>
      <span
        className={
          transferStatus.toLowerCase().includes("cannot") ||
          transferStatus.toLowerCase().includes("error") ||
          transferStatus.toLowerCase().includes("failed") ||
          transferStatus.toLowerCase().includes("checksum") ||
          transferStatus.toLowerCase().includes("incompatible") ||
          transferStatus.toLowerCase().includes("load")
            ? "preset-hint preset-hint-warn"
            : "preset-hint"
        }
      >
        {hasLoadedSnapshot
          ? transferStatus
          : transferStatus
            ? `${transferStatus} · Load before Save to avoid empty parameters.`
            : "Load before Save to avoid empty parameters."}
      </span>
    </div>
  );
}
