/**
 * Duplicate selected parameters in other sidebar groups (same SysEx ID).
 * Canonical rows stay in their original group (Mixer, Setup, etc.).
 */

export interface ParameterMirrorSpec {
  paramId: number;
  targetGroup: string;
  section: string;
  sectionOrder: number;
  /** Sort within section; lower = higher in the list. */
  displayOrder: number;
  label?: string;
  /** Sidebar group shown in “also in …” (defaults to source param group). */
  mirroredFrom?: string;
  /** Allow mirroring a system param into preset scope (or vice versa). */
  crossScope?: boolean;
}

const ON_OFF = "Effect on/off";
const ON_OFF_ORDER = 1;
const TONE_ROUTING = "Tone & routing";
const TONE_ROUTING_ORDER = 2;
const LEVELS = "Levels & sends";
const LEVELS_ORDER = 5;

const voice = (n: 1 | 2 | 3 | 4) => ({
  harmonySectionOrder: 30 + n,
  doublingSectionOrder: 20 + n,
});

const v1 = voice(1);
const v2 = voice(2);
const v3 = voice(3);
const v4 = voice(4);

const block = (
  paramId: number,
  targetGroup: string,
  label: string,
  displayOrder = 0,
  extra?: Partial<ParameterMirrorSpec>
): ParameterMirrorSpec => ({
  paramId,
  targetGroup,
  section: ON_OFF,
  sectionOrder: ON_OFF_ORDER,
  displayOrder,
  label,
  mirroredFrom: "Setup",
  ...extra,
});

export const PARAMETER_MIRRORS: ParameterMirrorSpec[] = [
  // —— Global EQ: tone bypass + style (manual EQ path on device) ——
  {
    paramId: 899,
    targetGroup: "EQ Voice",
    section: TONE_ROUTING,
    sectionOrder: TONE_ROUTING_ORDER,
    displayOrder: 0,
    label: "Tone block on/off",
    mirroredFrom: "Setup",
    crossScope: true,
  },
  {
    paramId: 0,
    targetGroup: "EQ Voice",
    section: TONE_ROUTING,
    sectionOrder: TONE_ROUTING_ORDER,
    displayOrder: 1,
    label: "Tone style",
    mirroredFrom: "Setup",
    crossScope: true,
  },
  {
    paramId: 899,
    targetGroup: "EQ Guitar",
    section: TONE_ROUTING,
    sectionOrder: TONE_ROUTING_ORDER,
    displayOrder: 0,
    label: "Tone block on/off",
    mirroredFrom: "Setup",
    crossScope: true,
  },
  {
    paramId: 901,
    targetGroup: "EQ Guitar",
    section: TONE_ROUTING,
    sectionOrder: TONE_ROUTING_ORDER,
    displayOrder: 1,
    label: "Guitar FX block",
    mirroredFrom: "Setup",
    crossScope: true,
  },

  // —— Effect block on/off (from Setup → effect pages) ——
  block(905, "Harmony", "Harmony block"),
  block(909, "Harmony", "Choir block", 1),
  block(906, "Doubling", "Doubling block"),
  block(902, "MicroMod", "µMod block"),
  block(903, "Delay", "Delay block"),
  block(904, "Reverb", "Reverb block"),
  {
    paramId: 177,
    targetGroup: "MicroMod",
    section: LEVELS,
    sectionOrder: LEVELS_ORDER,
    displayOrder: 0,
    label: "Dry → µMod send",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 178,
    targetGroup: "MicroMod",
    section: LEVELS,
    sectionOrder: LEVELS_ORDER,
    displayOrder: 1,
    label: "Harmony → µMod send",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 179,
    targetGroup: "Delay",
    section: LEVELS,
    sectionOrder: LEVELS_ORDER,
    displayOrder: 0,
    label: "Dry → Delay send",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 180,
    targetGroup: "Delay",
    section: LEVELS,
    sectionOrder: LEVELS_ORDER,
    displayOrder: 1,
    label: "Harmony → Delay send",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 181,
    targetGroup: "Delay",
    section: LEVELS,
    sectionOrder: LEVELS_ORDER,
    displayOrder: 2,
    label: "µMod → Delay send",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 183,
    targetGroup: "Reverb",
    section: LEVELS,
    sectionOrder: LEVELS_ORDER,
    displayOrder: 0,
    label: "Dry → Reverb send",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 184,
    targetGroup: "Reverb",
    section: LEVELS,
    sectionOrder: LEVELS_ORDER,
    displayOrder: 1,
    label: "Harmony → Reverb send",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 185,
    targetGroup: "Reverb",
    section: LEVELS,
    sectionOrder: LEVELS_ORDER,
    displayOrder: 2,
    label: "Delay → Reverb send",
    mirroredFrom: "Mixer",
  },
  block(907, "Transducer", "FX block (device bypass)"),
  block(908, "Transducer", "Transducer block", 1),
  block(907, "Pitch", "FX block (device bypass)"),
  block(910, "Pitch", "Pitch correction block", 1),
  {
    paramId: 172,
    targetGroup: "Doubling",
    section: ON_OFF,
    sectionOrder: ON_OFF_ORDER,
    displayOrder: 2,
    label: "Doubling in harmony layer",
    mirroredFrom: "Harmony",
  },
  {
    paramId: 901,
    targetGroup: "MicroMod",
    section: ON_OFF,
    sectionOrder: ON_OFF_ORDER,
    displayOrder: 1,
    label: "Guitar FX block",
    mirroredFrom: "Setup",
    crossScope: true,
  },
  {
    paramId: 61,
    targetGroup: "Gate",
    section: ON_OFF,
    sectionOrder: ON_OFF_ORDER,
    displayOrder: 0,
    label: "Auto gate",
    mirroredFrom: "Gate",
    crossScope: true,
  },
  {
    paramId: 899,
    targetGroup: "Other",
    section: ON_OFF,
    sectionOrder: ON_OFF_ORDER,
    displayOrder: 0,
    label: "Tone block",
    mirroredFrom: "Setup",
    crossScope: true,
  },

  // —— Harmony — mixer levels ——
  {
    paramId: 193,
    targetGroup: "Harmony",
    section: LEVELS,
    sectionOrder: LEVELS_ORDER,
    displayOrder: 0,
    label: "Harmony level",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 194,
    targetGroup: "Harmony",
    section: LEVELS,
    sectionOrder: LEVELS_ORDER,
    displayOrder: 1,
    label: "Harmony + doubling bus",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 178,
    targetGroup: "Harmony",
    section: LEVELS,
    sectionOrder: LEVELS_ORDER,
    displayOrder: 2,
    label: "Harmony → µMod send",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 180,
    targetGroup: "Harmony",
    section: LEVELS,
    sectionOrder: LEVELS_ORDER,
    displayOrder: 3,
    label: "Harmony → Delay send",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 184,
    targetGroup: "Harmony",
    section: LEVELS,
    sectionOrder: LEVELS_ORDER,
    displayOrder: 4,
    label: "Harmony → Reverb send",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 202,
    targetGroup: "Harmony",
    section: "Voice 1",
    sectionOrder: v1.harmonySectionOrder,
    displayOrder: 0,
    label: "Voice 1 level",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 216,
    targetGroup: "Harmony",
    section: "Voice 1",
    sectionOrder: v1.harmonySectionOrder,
    displayOrder: 1,
    label: "Voice 1 pan",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 203,
    targetGroup: "Harmony",
    section: "Voice 2",
    sectionOrder: v2.harmonySectionOrder,
    displayOrder: 0,
    label: "Voice 2 level",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 217,
    targetGroup: "Harmony",
    section: "Voice 2",
    sectionOrder: v2.harmonySectionOrder,
    displayOrder: 1,
    label: "Voice 2 pan",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 204,
    targetGroup: "Harmony",
    section: "Voice 3",
    sectionOrder: v3.harmonySectionOrder,
    displayOrder: 0,
    label: "Voice 3 level",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 218,
    targetGroup: "Harmony",
    section: "Voice 3",
    sectionOrder: v3.harmonySectionOrder,
    displayOrder: 1,
    label: "Voice 3 pan",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 205,
    targetGroup: "Harmony",
    section: "Voice 4",
    sectionOrder: v4.harmonySectionOrder,
    displayOrder: 0,
    label: "Voice 4 level",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 219,
    targetGroup: "Harmony",
    section: "Voice 4",
    sectionOrder: v4.harmonySectionOrder,
    displayOrder: 1,
    label: "Voice 4 pan",
    mirroredFrom: "Mixer",
  },

  // —— Doubling — mixer levels ——
  {
    paramId: 195,
    targetGroup: "Doubling",
    section: LEVELS,
    sectionOrder: LEVELS_ORDER,
    displayOrder: 0,
    label: "Doubling level",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 194,
    targetGroup: "Doubling",
    section: LEVELS,
    sectionOrder: LEVELS_ORDER,
    displayOrder: 1,
    label: "Harmony + doubling bus",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 210,
    targetGroup: "Doubling",
    section: "Voice 1",
    sectionOrder: v1.doublingSectionOrder,
    displayOrder: 0,
    label: "Double 1 level",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 224,
    targetGroup: "Doubling",
    section: "Voice 1",
    sectionOrder: v1.doublingSectionOrder,
    displayOrder: 1,
    label: "Double 1 pan",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 211,
    targetGroup: "Doubling",
    section: "Voice 2",
    sectionOrder: v2.doublingSectionOrder,
    displayOrder: 0,
    label: "Double 2 level",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 225,
    targetGroup: "Doubling",
    section: "Voice 2",
    sectionOrder: v2.doublingSectionOrder,
    displayOrder: 1,
    label: "Double 2 pan",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 212,
    targetGroup: "Doubling",
    section: "Voice 3",
    sectionOrder: v3.doublingSectionOrder,
    displayOrder: 0,
    label: "Double 3 level",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 226,
    targetGroup: "Doubling",
    section: "Voice 3",
    sectionOrder: v3.doublingSectionOrder,
    displayOrder: 1,
    label: "Double 3 pan",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 213,
    targetGroup: "Doubling",
    section: "Voice 4",
    sectionOrder: v4.doublingSectionOrder,
    displayOrder: 0,
    label: "Double 4 level",
    mirroredFrom: "Mixer",
  },
  {
    paramId: 227,
    targetGroup: "Doubling",
    section: "Voice 4",
    sectionOrder: v4.doublingSectionOrder,
    displayOrder: 1,
    label: "Double 4 pan",
    mirroredFrom: "Mixer",
  },
];

const mirrorsByGroup = new Map<string, ParameterMirrorSpec[]>();
for (const m of PARAMETER_MIRRORS) {
  if (!mirrorsByGroup.has(m.targetGroup)) mirrorsByGroup.set(m.targetGroup, []);
  mirrorsByGroup.get(m.targetGroup)!.push(m);
}

export function mirrorsForGroup(groupId: string): ParameterMirrorSpec[] {
  return mirrorsByGroup.get(groupId) ?? [];
}
