import { canSaveToPresetSlot, presetSlotLabel } from "@vlt/core";

export interface PresetBarProps {
  presetSlot: number;
  onPresetSlotChange: (slot: number) => void;
  presetName: string;
  onPresetNameChange: (name: string) => void;
  onLoad: () => void;
  onSave: () => void;
  transferStatus: string;
  hasLoadedSnapshot: boolean;
  connected: boolean;
}

const SLOT_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: presetSlotLabel(0) },
  ...Array.from({ length: 275 }, (_, i) => ({
    value: i + 1,
    label: presetSlotLabel(i + 1),
  })),
  ...Array.from({ length: 25 }, (_, i) => ({
    value: 276 + i,
    label: presetSlotLabel(276 + i),
  })),
];

export function PresetBar({
  presetSlot,
  onPresetSlotChange,
  presetName,
  onPresetNameChange,
  onLoad,
  onSave,
  transferStatus,
  hasLoadedSnapshot,
  connected,
}: PresetBarProps) {
  return (
    <div className="preset-bar">
      <label>
        Slot
        <select
          value={presetSlot}
          disabled={!connected}
          onChange={(e) => onPresetSlotChange(Number(e.target.value))}
        >
          {SLOT_OPTIONS.map((o) => (
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
          disabled={!connected}
          placeholder="(15 chars max)"
          onChange={(e) => onPresetNameChange(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="secondary"
        disabled={!connected}
        onClick={onLoad}
      >
        Load from device
      </button>
      <button
        type="button"
        disabled={!connected || !canSaveToPresetSlot(presetSlot)}
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
          : `${transferStatus} · Load before Save to avoid empty parameters.`}
      </span>
    </div>
  );
}
