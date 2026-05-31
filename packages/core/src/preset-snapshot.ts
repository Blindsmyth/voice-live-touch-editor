import { presetParameters } from "./generated/preset-parameters.js";

/**
 * Parameter set version 0.26 from the SysEx manual (hex-style id).
 * On the wire this is 14-bit packed value 38 (0x26), not decimal 26.
 */
export const PRESET_PARAMETER_VERSION = 0x26;

/** Resolve version for save: prefer loaded header, then device default. */
export function resolvePresetVersion(
  snapshotVersion: number,
  deviceVersion: number | null
): number {
  if (snapshotVersion > 0) return snapshotVersion;
  if (deviceVersion != null && deviceVersion > 0) return deviceVersion;
  return PRESET_PARAMETER_VERSION;
}

export const PRESET_VALUE_COUNT = 226;
export const PRESET_PARAMS_PER_MESSAGE = 25;
export const PRESET_DATA_MESSAGE_COUNT = Math.ceil(
  PRESET_VALUE_COUNT / PRESET_PARAMS_PER_MESSAGE
);

export interface PresetSnapshot {
  number: number;
  version: number;
  name: string;
  tags: number;
  stepCount: number;
  valuesByOffset: number[];
}

const offsetToId = new Map<number, number>();
const idToOffset = new Map<number, number>();

for (const p of presetParameters) {
  offsetToId.set(p.offset, p.id);
  idToOffset.set(p.id, p.offset);
}

export function createEmptySnapshot(presetNumber: number): PresetSnapshot {
  const valuesByOffset = presetParameters.map((p) => p.centre);
  return {
    number: presetNumber,
    version: PRESET_PARAMETER_VERSION,
    name: "",
    tags: 0,
    stepCount: 1,
    valuesByOffset,
  };
}

export function paramIdToOffset(id: number): number | undefined {
  return idToOffset.get(id);
}

export function offsetToParamId(offset: number): number | undefined {
  return offsetToId.get(offset);
}

export function normalizePresetName(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "").slice(0, 15);
  return ascii;
}

export function encodePresetName(name: string): number[] {
  const norm = normalizePresetName(name);
  const bytes = new Array(15).fill(0);
  for (let i = 0; i < norm.length; i++) {
    bytes[i] = norm.charCodeAt(i);
  }
  return bytes;
}

export function decodePresetName(bytes: number[]): string {
  const chars: number[] = [];
  for (const b of bytes) {
    const c = b & 0x7f;
    if (c === 0) break;
    chars.push(c);
  }
  return String.fromCharCode(...chars);
}

/** Merge live editor values into snapshot; only updates known offsets. */
export function cloneSnapshot(snapshot: PresetSnapshot): PresetSnapshot {
  return {
    ...snapshot,
    valuesByOffset: [...snapshot.valuesByOffset],
  };
}

/** True if this slot can be written via SysEx (not live step 0). */
export function canSaveToPresetSlot(slot: number): boolean {
  return slot >= 1 && slot <= 300;
}

/** Build a snapshot from current editor values (fallback when bulk dump incomplete). */
export function buildSnapshotFromLiveValues(
  presetNumber: number,
  name: string,
  liveValues: Map<number, number>,
  partial?: Partial<PresetSnapshot>
): PresetSnapshot {
  const snap = createEmptySnapshot(presetNumber);
  snap.name = normalizePresetName(name);
  if (partial?.version != null && partial.version > 0) {
    snap.version = partial.version;
  }
  if (partial?.tags != null) snap.tags = partial.tags;
  if (partial?.stepCount != null) snap.stepCount = partial.stepCount;
  return mergeLiveValuesIntoSnapshot(snap, liveValues);
}

export function mergeLiveValuesIntoSnapshot(
  snapshot: PresetSnapshot,
  liveValues: Map<number, number>
): PresetSnapshot {
  const values = [...snapshot.valuesByOffset];
  for (const [id, value] of liveValues) {
    const offset = idToOffset.get(id);
    if (offset !== undefined && offset < values.length) {
      values[offset] = value;
    }
  }
  return { ...snapshot, valuesByOffset: values };
}

export function snapshotToLiveValues(
  snapshot: PresetSnapshot
): { id: number; value: number }[] {
  const out: { id: number; value: number }[] = [];
  snapshot.valuesByOffset.forEach((value, offset) => {
    const id = offsetToId.get(offset);
    if (id !== undefined) out.push({ id, value });
  });
  return out;
}

export type VltPresetFile = {
  format: "vlt-preset";
  version: 1;
  snapshot: PresetSnapshot;
};

export function snapshotToJson(snapshot: PresetSnapshot): string {
  const file: VltPresetFile = {
    format: "vlt-preset",
    version: 1,
    snapshot,
  };
  return JSON.stringify(file, null, 2);
}

export function snapshotFromJson(text: string): PresetSnapshot {
  const parsed = JSON.parse(text) as VltPresetFile;
  if (parsed.format !== "vlt-preset" || !parsed.snapshot) {
    throw new Error("Invalid .vltpreset.json file");
  }
  const s = parsed.snapshot;
  if (s.valuesByOffset.length !== PRESET_VALUE_COUNT) {
    throw new Error(`Expected ${PRESET_VALUE_COUNT} preset values`);
  }
  return s;
}
