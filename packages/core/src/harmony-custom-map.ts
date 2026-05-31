/**
 * VoiceLive custom harmony scale map (HarmonyMapCus *, IDs 936–959).
 *
 * Each SysEx value (0–4095) packs two 6-bit voice targets for one input scale
 * degree: high 6 bits = voice 1 or 3, low 6 bits = voice 2 or 4 (V12 / V34).
 *
 * Wire values follow the legacy VoiceLive shift-map table (semitone steps only):
 * 0 → −24 st … 24 → unison … 48 → +24 st, 54 → no change (N/C).
 */

export const HARMONY_SCALE_CUSTOM = 6;

/** Input scale degree → packed word param IDs (voices 1–2 / 3–4). */
export const HARMONY_CUSTOM_MAP_ROWS = [
  { degree: "Root", short: "R", v12Id: 936, v34Id: 948 },
  { degree: "Minor 2nd", short: "m2", v12Id: 937, v34Id: 949 },
  { degree: "Major 2nd", short: "M2", v12Id: 938, v34Id: 950 },
  { degree: "Minor 3rd", short: "m3", v12Id: 939, v34Id: 951 },
  { degree: "Major 3rd", short: "M3", v12Id: 940, v34Id: 952 },
  { degree: "Perfect 4th", short: "P4", v12Id: 941, v34Id: 953 },
  { degree: "Augmented 4th", short: "A4", v12Id: 942, v34Id: 954 },
  { degree: "Perfect 5th", short: "P5", v12Id: 943, v34Id: 955 },
  { degree: "Minor 6th", short: "m6", v12Id: 944, v34Id: 956 },
  { degree: "Major 6th", short: "M6", v12Id: 945, v34Id: 957 },
  { degree: "Minor 7th", short: "m7", v12Id: 946, v34Id: 958 },
  { degree: "Major 7th", short: "M7", v12Id: 947, v34Id: 959 },
] as const;

export const HARMONY_MAP_NC = 54;
export const HARMONY_MAP_UNISON = 24;

export function unpackHarmonyMapWord(packed: number): [number, number] {
  const v = Math.max(0, Math.min(4095, Math.round(packed)));
  return [(v >> 6) & 0x3f, v & 0x3f];
}

export function packHarmonyMapWord(high: number, low: number): number {
  return (((high & 0x3f) << 6) | (low & 0x3f)) & 0xfff;
}

/** Semitone offset from lead (−24…+24), or null for N/C / unknown wire codes. */
export function wireToSemitones(wire: number): number | null {
  if (wire === HARMONY_MAP_NC) return null;
  if (wire >= 0 && wire <= 48) return wire - 24;
  return null;
}

export function semitonesToWire(semitones: number | null): number {
  if (semitones === null) return HARMONY_MAP_NC;
  const clamped = Math.max(-24, Math.min(24, Math.round(semitones)));
  return clamped + 24;
}

export function formatShiftWire(wire: number): string {
  if (wire === HARMONY_MAP_NC) return "N/C";
  const st = wireToSemitones(wire);
  if (st === null) return `Code ${wire}`;
  if (st === 0) return "Uni (0)";
  if (st === -24) return "−2 oct";
  if (st === 24) return "+2 oct";
  return st > 0 ? `+${st} st` : `${st} st`;
}

/** Piano-roll index: 0 = −24 st, 24 = unison, 48 = +24 st, 49 = N/C. */
export const PIANO_ROLL_MIN = 0;
export const PIANO_ROLL_MAX = 49;

export function wireToPianoIndex(wire: number): number {
  if (wire === HARMONY_MAP_NC) return 49;
  const st = wireToSemitones(wire);
  if (st === null) return 24;
  return semitonesToWire(st);
}

export function pianoIndexToWire(index: number): number {
  if (index >= 49) return HARMONY_MAP_NC;
  return index;
}

export type HarmonyVoiceIndex = 0 | 1 | 2 | 3;

export function readVoiceWire(
  packedV12: number,
  packedV34: number,
  voice: HarmonyVoiceIndex
): number {
  const [v12Hi, v12Lo] = unpackHarmonyMapWord(packedV12);
  const [v34Hi, v34Lo] = unpackHarmonyMapWord(packedV34);
  switch (voice) {
    case 0:
      return v12Hi;
    case 1:
      return v12Lo;
    case 2:
      return v34Hi;
    case 3:
      return v34Lo;
    default:
      return v12Hi;
  }
}

export function writeVoiceWire(
  packedV12: number,
  packedV34: number,
  voice: HarmonyVoiceIndex,
  wire: number
): { v12: number; v34: number } {
  const [v12Hi, v12Lo] = unpackHarmonyMapWord(packedV12);
  const [v34Hi, v34Lo] = unpackHarmonyMapWord(packedV34);
  const w = wire & 0x3f;
  switch (voice) {
    case 0:
      return { v12: packHarmonyMapWord(w, v12Lo), v34: packedV34 };
    case 1:
      return { v12: packHarmonyMapWord(v12Hi, w), v34: packedV34 };
    case 2:
      return { v12: packedV12, v34: packHarmonyMapWord(w, v34Lo) };
    case 3:
      return { v12: packedV12, v34: packHarmonyMapWord(v34Hi, w) };
    default:
      return { v12: packedV12, v34: packedV34 };
  }
}

export const PITCH_CLASS_NAMES = [
  "C",
  "C#",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "Bb",
  "B",
] as const;

export function pitchClassName(pitchClass: number): string {
  return PITCH_CLASS_NAMES[((pitchClass % 12) + 12) % 12]!;
}

/** Semitone offset from the preset key’s root for each map row (0–11). */
export function degreeSemitonesFromRoot(rowIndex: number): number {
  return ((rowIndex % 12) + 12) % 12;
}

/** Pitch class of the note you sing for this map row, given Harmony Key (0–11). */
export function inputPitchClassForRow(harmonyKey: number, rowIndex: number): number {
  const key = ((Math.round(harmonyKey) % 12) + 12) % 12;
  return (key + degreeSemitonesFromRoot(rowIndex)) % 12;
}

/** Output pitch class when harmony shifts by `semitonesFromInput` from that sung note. */
export function outputPitchClass(
  harmonyKey: number,
  rowIndex: number,
  semitonesFromInput: number
): number {
  return (
    (inputPitchClassForRow(harmonyKey, rowIndex) + semitonesFromInput + 120) %
    12
  );
}

export interface PianoKeyDisplay {
  /** Tooltip: absolute note + interval from sung input. */
  title: string;
  /** Text on the key (may be empty for dense keys). */
  short: string;
  semitonesFromInput: number;
  isUnison: boolean;
  isNoChange: boolean;
}

/** Piano-roll key label in context of preset key + selected input degree. */
export function pianoKeyDisplayForMap(
  pianoIndex: number,
  harmonyKey: number,
  rowIndex: number
): PianoKeyDisplay {
  if (pianoIndex >= 49) {
    return {
      title: "No change — hold previous interval",
      short: "N/C",
      semitonesFromInput: 0,
      isUnison: false,
      isNoChange: true,
    };
  }
  const st = pianoIndex - 24;
  const inputName = pitchClassName(inputPitchClassForRow(harmonyKey, rowIndex));
  const outName = pitchClassName(outputPitchClass(harmonyKey, rowIndex, st));
  const rel =
    st === 0 ? "0 st" : st > 0 ? `+${st} st` : `${st} st`;
  const oct = Math.floor(st / 12);
  const octHint =
    oct === 0 ? "" : oct > 0 ? `, +${oct} oct` : `, ${oct} oct`;
  return {
    title: `Harmony → ${outName} (${rel} from sung ${inputName}${octHint})`,
    short: outName,
    semitonesFromInput: st,
    isUnison: st === 0,
    isNoChange: false,
  };
}

/** Degree tab label, e.g. "m2 · D" when key is C. */
export function degreeTabLabel(harmonyKey: number, rowIndex: number): string {
  const row = HARMONY_CUSTOM_MAP_ROWS[rowIndex];
  if (!row) return "";
  const note = pitchClassName(inputPitchClassForRow(harmonyKey, rowIndex));
  return `${row.short} · ${note}`;
}

/** Voice target summary with absolute note when wire is a known semitone shift. */
export function formatVoiceTarget(
  wire: number,
  harmonyKey: number,
  rowIndex: number
): string {
  if (wire === HARMONY_MAP_NC) return "N/C";
  const st = wireToSemitones(wire);
  if (st === null) return formatShiftWire(wire);
  const out = pitchClassName(outputPitchClass(harmonyKey, rowIndex, st));
  const rel = formatShiftWire(wire);
  return `${out} (${rel})`;
}

/** @deprecated Use pianoKeyDisplayForMap for key-aware labels. */
export function pianoKeyLabel(index: number): string {
  if (index >= 49) return "N/C";
  const st = index - 24;
  const note = pitchClassName(((st % 12) + 12) % 12);
  const oct = Math.floor(st / 12);
  if (oct === 0) return note;
  if (oct > 0) return `+${oct} ${note}`;
  return `${oct} ${note}`;
}
