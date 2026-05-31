import { pack14 } from "./sysex.js";
import { presetParameters } from "./generated/preset-parameters.js";

/** Parameter set version 0.26 — wire bytes [0, 26] per TC-Helicon Touch SysEx manual. */
export const PRESET_PARAMETER_VERSION = 26;
export const DEFAULT_VERSION_WIRE: [number, number] = [0, 26];

export const PRESET_VALUE_COUNT = 226;
export const PRESET_PARAMS_PER_MESSAGE = 25;
export const PRESET_DATA_MESSAGE_COUNT = Math.ceil(
  PRESET_VALUE_COUNT / PRESET_PARAMS_PER_MESSAGE
);

export interface PresetSnapshot {
  number: number;
  /** Parsed 14-bit version (informational). */
  version: number;
  /** Exact 2 version bytes from device header — must be echoed on save. */
  versionWire: [number, number];
  /** Exact 2 preset-number bytes from device header when available. */
  numberWire?: [number, number];
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

/** Parse 14-bit field; `wire` is always the raw bytes from the message (for echo on save). */
export function parse14BitPair(
  byte0: number,
  byte1: number
): { value: number; wire: [number, number] } {
  const w0 = byte0 & 0x7f;
  const w1 = byte1 & 0x7f;
  const wire: [number, number] = [w0, w1];
  if (w0 === 0) return { value: w1, wire };
  if (w1 === 0) return { value: w0, wire };
  const vMsbFirst = w0 * 128 + w1;
  const vLsbFirst = w1 * 128 + w0;
  if (vMsbFirst <= 4095 && vMsbFirst <= vLsbFirst) {
    return { value: vMsbFirst, wire };
  }
  if (vLsbFirst <= 4095) return { value: vLsbFirst, wire };
  return { value: vMsbFirst, wire };
}

export function createEmptySnapshot(presetNumber: number): PresetSnapshot {
  const numberWire = pack14(presetNumber);
  return {
    number: presetNumber,
    version: PRESET_PARAMETER_VERSION,
    versionWire: [...DEFAULT_VERSION_WIRE],
    numberWire: [numberWire[0], numberWire[1]],
    name: "",
    tags: 0,
    stepCount: 1,
    valuesByOffset: presetParameters.map((p) => p.centre),
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
    bytes[i] = norm.charCodeAt(i) & 0x7f;
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

export function cloneSnapshot(snapshot: PresetSnapshot): PresetSnapshot {
  return {
    ...snapshot,
    versionWire: [...snapshot.versionWire],
    numberWire: snapshot.numberWire ? [...snapshot.numberWire] : undefined,
    valuesByOffset: [...snapshot.valuesByOffset],
  };
}

export function canSaveToPresetSlot(slot: number): boolean {
  return slot >= 1 && slot <= 300;
}

export function buildSnapshotFromLiveValues(
  presetNumber: number,
  name: string,
  liveValues: Map<number, number>,
  partial?: Partial<PresetSnapshot>
): PresetSnapshot {
  const snap = createEmptySnapshot(presetNumber);
  snap.name = normalizePresetName(name);
  if (partial?.versionWire) snap.versionWire = [...partial.versionWire];
  else if (partial?.version != null && partial.version > 0) {
    const w = pack14(partial.version);
    snap.versionWire = [w[0], w[1]];
    snap.version = partial.version;
  }
  if (partial?.numberWire) snap.numberWire = [...partial.numberWire];
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
  return JSON.stringify(file, null, 1);
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
  if (!s.versionWire) {
    const w = pack14(s.version ?? PRESET_PARAMETER_VERSION);
    s.versionWire = [w[0], w[1]];
  }
  return s;
}
