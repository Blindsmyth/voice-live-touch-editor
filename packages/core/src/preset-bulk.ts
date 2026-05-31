import type { ParsedPresetHeader } from "./preset-transfer.js";
import {
  createEmptySnapshot,
  type PresetSnapshot,
} from "./preset-snapshot.js";
import { presetSlotLabel } from "./preset-library.js";

export const USER_PRESET_SLOT_MIN = 1;
export const USER_PRESET_SLOT_MAX = 275;
export const FAVORITE_SLOT_MIN = 276;
export const FAVORITE_SLOT_MAX = 300;

export function allUserPresetSlots(): number[] {
  return Array.from(
    { length: USER_PRESET_SLOT_MAX - USER_PRESET_SLOT_MIN + 1 },
    (_, i) => USER_PRESET_SLOT_MIN + i
  );
}

export function allFavoriteSlots(): number[] {
  return Array.from(
    { length: FAVORITE_SLOT_MAX - FAVORITE_SLOT_MIN + 1 },
    (_, i) => FAVORITE_SLOT_MIN + i
  );
}

export function allLibrarySlots(includeFavorites = true): number[] {
  return includeFavorites
    ? [...allUserPresetSlots(), ...allFavoriteSlots()]
    : allUserPresetSlots();
}

/** Build a workspace snapshot from a device header (values = centres until full load). */
export function snapshotFromParsedHeader(header: ParsedPresetHeader): PresetSnapshot {
  const snap = createEmptySnapshot(header.presetNumber);
  snap.number = header.presetNumber;
  snap.numberWire = [...header.numberWire];
  snap.version = header.version;
  snap.versionWire = [...header.versionWire];
  snap.name = header.name;
  snap.tags = header.tags;
  snap.stepCount = header.stepCount;
  return snap;
}

export function slotDisplayLabel(
  slot: number,
  name?: string | null
): string {
  const trimmed = name?.trim();
  if (trimmed) {
    const base = presetSlotLabel(slot);
    return `${base} — ${trimmed}`;
  }
  return presetSlotLabel(slot);
}

export type VltWorkspaceFile = {
  format: "vlt-workspace";
  version: 1;
  created: string;
  label: string;
  presets: PresetSnapshot[];
};

export function workspaceToJson(
  snapshots: PresetSnapshot[],
  label: string
): string {
  const file: VltWorkspaceFile = {
    format: "vlt-workspace",
    version: 1,
    created: new Date().toISOString(),
    label,
    presets: snapshots,
  };
  return JSON.stringify(file, null, 1);
}

export function workspaceFromJson(text: string): VltWorkspaceFile {
  const parsed = JSON.parse(text) as VltWorkspaceFile;
  if (parsed.format !== "vlt-workspace" || !Array.isArray(parsed.presets)) {
    throw new Error("Invalid workspace snapshot file");
  }
  return parsed;
}
