import type { ParameterDef } from "./parameters.js";

const KEYS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"].map((label, value) => ({
  value,
  label,
}));

/**
 * Live-only parameters: settable with 0x22 / readable with 0x47, but not part of the
 * stored preset package (no preset offset, so saving and snapshot code skip them).
 *
 * 834 is HardTune's active key (firmware param 0x342). The preset stores its copy in
 * "Correct Key_Storage" (963). Setting 834 makes the unit copy it into Key Storage at
 * once; editing Key Storage alone only takes effect on the next preset load, and a
 * Scale change overwrites Key Storage with the active key. See the firmware notes.
 */
export const liveOnlyParameters: ParameterDef[] = [
  {
    id: 834,
    offset: -1,
    name: "Correct Key",
    label: "Own Key",
    scope: "preset",
    group: "Pitch",
    section: "HardTune / Correct",
    sectionOrder: 10,
    displayOrder: 162.5, // right after KeySource (offset 162)
    min: 0,
    max: 11,
    centre: 0,
    control: "select",
    options: KEYS,
  },
];

export const liveOnlyParameterIds = liveOnlyParameters.map((p) => p.id);
