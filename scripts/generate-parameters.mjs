#!/usr/bin/env node
/**
 * Parse docs/VoiceLive-Touch-Sysex-Manual.md tables → generated TS modules.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

let PARAMETER_ENUMS = {};
try {
  PARAMETER_ENUMS = JSON.parse(
    readFileSync(join(root, "packages/core/src/parameter-enums.json"), "utf8")
  );
} catch {
  console.warn("No parameter-enums.json — options omitted");
}
const sysexMd = readFileSync(
  join(root, "docs/VoiceLive-Touch-Sysex-Manual.md"),
  "utf8"
);
const outDir = join(root, "packages/core/src/generated");

const LABEL_ALIASES = {
  193: "Harm Vol",
  134: "Harmony Attack",
  136: "Harmony Release",
  139: "Harmony Hold Release",
  142: "Harmony Notes Ext",
  943: "V12 Perfect 5th",
  955: "V34 Perfect 5th",
};

const GROUP_ORDER = [
  "EQ Voice",
  "EQ Guitar",
  "EQ Harmony",
  "Gate",
  "Harmony",
  "Doubling",
  "Mixer",
  "MicroMod",
  "Delay",
  "Reverb",
  "Transducer",
  "Pitch",
  "Ducking",
  "Choir",
  "Setup",
  "Other",
];

function deriveGroup(name) {
  if (/^ParEq .* Voice/.test(name)) return "EQ Voice";
  if (/^ParEq .* Guitar/.test(name)) return "EQ Guitar";
  if (/^ParEq .* Harm/.test(name)) return "EQ Harmony";
  if (/^HarmonyMapCus|^Harmony |^Choir /.test(name)) return "Harmony";
  if (/^Doubling /.test(name)) return "Doubling";
  if (/^Mixer_/.test(name)) return "Mixer";
  if (/^MicroMod /.test(name)) return "MicroMod";
  if (/^Delay /.test(name)) return "Delay";
  if (/^Reverb /.test(name)) return "Reverb";
  if (/^Transducer /.test(name)) return "Transducer";
  if (/^Correct |^Hardtune |^CorrectionMapCus/.test(name)) return "Pitch";
  if (/^Ducking /.test(name)) return "Ducking";
  if (/^ParEq /.test(name)) return "EQ Harmony";
  if (/^AutoGate/.test(name)) return "Gate";
  if (/^Utility |^Preset |^Block /.test(name)) return "Setup";
  return "Other";
}

/** Device-oriented section order (VoiceLive 2 / Touch SysEx table + edit menus). */
function deriveSection(name, group, offset, id) {
  if (group === "Harmony") {
    if (/HarmonyMapCus/.test(name)) return { section: "Custom scale map", sectionOrder: 90 };
    if (/^Harmony Notes/.test(name)) return { section: "Notes mode", sectionOrder: 70 };
    if ([106, 107, 108, 111].includes(id) || (offset >= 19 && offset <= 22))
      return { section: "Key & scale", sectionOrder: 20 };
    const voice = name.match(/\bV([1-4])\b/);
    if (voice && /Int_|Gender|Portamento|Smoothing/.test(name))
      return { section: `Voice ${voice[1]}`, sectionOrder: 30 + Number(voice[1]) };
    if (
      /GroupStyle|Human|Vibrato|Choir|NaturalPlay|Tuning/.test(name) ||
      (offset >= 9 && offset <= 18)
    )
      return { section: "Styles & choir", sectionOrder: 10 };
    if (/Attack|Release|Hold|Latch|Chord|Doubling|NotesExt|Notes_/.test(name))
      return { section: "Envelope & routing", sectionOrder: 60 };
    return { section: "Harmony (other)", sectionOrder: 80 };
  }
  if (group === "Doubling") {
    const voice = name.match(/\bV([1-4])\b/);
    if (voice && /Smoothing|Portamento|Gender/.test(name))
      return { section: `Voice ${voice[1]}`, sectionOrder: 20 + Number(voice[1]) };
    if (/GroupStyle|Human|Harmony Doubling/.test(name) || offset >= 57 && offset <= 59)
      return { section: "Doubling style", sectionOrder: 10 };
    return { section: "Doubling (other)", sectionOrder: 50 };
  }
  if (group === "Pitch") {
    if (/Hardtune|Correct (Key|Scale|Amount|Window|Rate|Shift|Lead)/.test(name))
      return { section: "HardTune / Correct", sectionOrder: 10 };
    if (/CorrectionMapCus/.test(name)) return { section: "Custom correct map", sectionOrder: 20 };
    return { section: "Pitch (other)", sectionOrder: 30 };
  }
  if (group === "Mixer") {
    if (name.includes("Mixer_LP")) return { section: "Per-voice sends", sectionOrder: 20 };
    if (name.includes("Mixer_LW")) return { section: "Stereo width", sectionOrder: 30 };
    if (name.includes("Mixer_L_6dB")) return { section: "6 dB boost", sectionOrder: 40 };
    return { section: "Mix levels", sectionOrder: 10 };
  }
  if (group === "EQ") return { section: "Parametric EQ", sectionOrder: 10 };
  if (group === "Gate") return { section: "Auto gate", sectionOrder: 10 };
  if (group === "Setup") {
    if (/^Block /.test(name)) return { section: "Effect blocks", sectionOrder: 10 };
    if (/^Utility /.test(name)) return { section: "Utility", sectionOrder: 20 };
    if (/^Preset /.test(name)) return { section: "Preset meta", sectionOrder: 30 };
    return { section: "Setup", sectionOrder: 40 };
  }
  return { section: group, sectionOrder: 10 };
}

function deriveSubgroup(name, group) {
  const parts = name.split(" ");
  if (group === "Harmony" && /V[1-4]$/.test(name)) return parts.slice(-2).join(" ");
  if (group === "Harmony" && /^(Harmony Key|Harmony Scale|Harmony Tuning|Harmony NaturalPlay)$/.test(name))
    return "Key & scale";
  if (group === "Mixer") {
    if (name.includes("Mixer_LP")) return "Per-voice";
    if (name.includes("Mixer_LW")) return "Width";
    if (name.includes("Mixer_L_6dB")) return "6 dB boost";
    return "Levels";
  }
  if (name.endsWith(" Voice") || name.endsWith(" Guitar") || name.endsWith(" Harm"))
    return parts[parts.length - 1];
  return parts.slice(1, 3).join(" ") || undefined;
}

function deriveControl(min, max) {
  if (min === 0 && max === 1) return "toggle";
  if (max - min <= 20 && min >= 0) return "select";
  return "slider";
}

function makeLabel(name, id) {
  if (LABEL_ALIASES[id]) return LABEL_ALIASES[id];
  return name
    .replace(/_/g, " ")
    .replace(/^(Harmony|Mixer_L|Mixer_LP|Mixer_LW|Utility|Block|ParEq|MicroMod|Delay|Reverb|Transducer|Correct|Doubling|Ducking|Choir|AutoGateGain|AutoGateT|PreFX) /, "")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function parseTable(sectionTitle) {
  const scope = sectionTitle.includes("System") ? "system" : "preset";
  const start = sysexMd.indexOf(sectionTitle);
  if (start < 0) throw new Error(`Section not found: ${sectionTitle}`);
  const slice = sysexMd.slice(start);
  const end = slice.indexOf("\n---", 100);
  const block = end > 0 ? slice.slice(0, end) : slice;

  const rows = [];
  const lineRe =
    /^\|?\s*(\d+)\s*\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*(-?\d+)\s*\|\s*(-?\d+)\s*\|\s*(-?\d+)\s*\|/gm;
  let m;
  while ((m = lineRe.exec(block)) !== null) {
    const name = m[3].replace(/\*\*/g, "").trim();
    rows.push({
      offset: Number(m[1]),
      id: Number(m[2]),
      name,
      min: Number(m[4]),
      max: Number(m[5]),
      centre: Number(m[6]),
      scope,
      group: deriveGroup(name),
      subgroup: undefined,
      label: makeLabel(name, Number(m[2])),
      control: deriveControl(Number(m[4]), Number(m[5])),
    });
  }
  for (const r of rows) {
    const { section, sectionOrder } = deriveSection(r.name, r.group, r.offset, r.id);
    r.section = section;
    r.sectionOrder = sectionOrder;
    r.subgroup = deriveSubgroup(r.name, r.group) || undefined;
  }
  return rows;
}

function optionsFor(p) {
  if (PARAMETER_ENUMS[String(p.id)]) return PARAMETER_ENUMS[String(p.id)];
  if (p.control === "toggle") {
    return [
      { value: 0, label: "Off" },
      { value: 1, label: "On" },
    ];
  }
  // Int_shift / Int_scale: slider + runtime semitone labels (see parameter-enums.ts)
  if (/Int_(shift|scale)/.test(p.name)) return undefined;
  if (p.control === "select" && p.min >= 0 && p.max - p.min <= 30) {
    return Array.from({ length: p.max - p.min + 1 }, (_, i) => ({
      value: p.min + i,
      label: String(p.min + i),
    }));
  }
  return undefined;
}

function emitParam(p) {
  const sub = p.subgroup ? `, subgroup: ${JSON.stringify(p.subgroup)}` : "";
  const sec = p.section
    ? `, section: ${JSON.stringify(p.section)}, sectionOrder: ${p.sectionOrder}`
    : "";
  const opts = optionsFor(p);
  const options = opts ? `, options: ${JSON.stringify(opts)}` : "";
  return `  { id: ${p.id}, offset: ${p.offset}, name: ${JSON.stringify(p.name)}, label: ${JSON.stringify(p.label)}, scope: "${p.scope}", group: ${JSON.stringify(p.group)}, min: ${p.min}, max: ${p.max}, centre: ${p.centre}, control: "${p.control}"${sec}${sub}${options} }`;
}

const preset = parseTable("## Preset package parameter table");
const system = parseTable("## System package parameter table");

const groupMap = new Map();
for (const p of [...preset, ...system]) {
  if (!groupMap.has(p.group)) groupMap.set(p.group, []);
  groupMap.get(p.group).push(p);
}

const groups = GROUP_ORDER.filter((g) => groupMap.has(g)).map((id) => ({
  id,
  label: id,
  presetCount: (groupMap.get(id) || []).filter((p) => p.scope === "preset").length,
  systemCount: (groupMap.get(id) || []).filter((p) => p.scope === "system").length,
}));

mkdirSync(outDir, { recursive: true });

writeFileSync(
  join(outDir, "preset-parameters.ts"),
  `/* AUTO-GENERATED by scripts/generate-parameters.mjs — do not edit */\nimport type { ParameterDef } from "../parameters.js";\n\nexport const presetParameters: ParameterDef[] = [\n${preset.map(emitParam).join(",\n")}\n];\n`
);

writeFileSync(
  join(outDir, "system-parameters.ts"),
  `/* AUTO-GENERATED by scripts/generate-parameters.mjs — do not edit */\nimport type { ParameterDef } from "../parameters.js";\n\nexport const systemParameters: ParameterDef[] = [\n${system.map(emitParam).join(",\n")}\n];\n`
);

writeFileSync(
  join(outDir, "parameter-groups.ts"),
  `/* AUTO-GENERATED by scripts/generate-parameters.mjs — do not edit */\n\nexport interface ParameterGroupInfo {\n  id: string;\n  label: string;\n  presetCount: number;\n  systemCount: number;\n}\n\nexport const parameterGroups: ParameterGroupInfo[] = ${JSON.stringify(groups, null, 2)};\n`
);

const byIdEntries = [...preset, ...system]
  .map((p) => `  ${p.id}: presetParameters.find((x) => x.id === ${p.id})!`)
  .join(",\n");
// Fix: build unified map in index instead

console.log(`Generated ${preset.length} preset + ${system.length} system parameters, ${groups.length} groups.`);
