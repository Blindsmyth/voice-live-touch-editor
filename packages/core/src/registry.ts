import { presetParameters } from "./generated/preset-parameters.js";
import { systemParameters } from "./generated/system-parameters.js";
import { parameterGroups } from "./generated/parameter-groups.js";
import { mirrorsForGroup } from "./parameter-mirrors.js";
import { harmVol } from "./parameters.js";
import type { DisplayedParameter, ParameterDef, ParameterScope } from "./parameters.js";

export { parameterGroups };

const allParameters: ParameterDef[] = [...presetParameters, ...systemParameters];

export const parameterById = new Map<number, ParameterDef>(
  allParameters.map((p) => [p.id, p])
);
if (!parameterById.has(harmVol.id)) {
  parameterById.set(harmVol.id, harmVol);
}

export function getParameter(id: number): ParameterDef | undefined {
  return parameterById.get(id);
}

function compareDisplayed(a: DisplayedParameter, b: DisplayedParameter): number {
  const orderA = a.sectionOrder ?? 50;
  const orderB = b.sectionOrder ?? 50;
  if (orderA !== orderB) return orderA - orderB;
  const dispA = a.displayOrder ?? a.offset;
  const dispB = b.displayOrder ?? b.offset;
  if (dispA !== dispB) return dispA - dispB;
  if (a.offset !== b.offset) return a.offset - b.offset;
  if (a.mirroredFrom && !b.mirroredFrom) return -1;
  if (!a.mirroredFrom && b.mirroredFrom) return 1;
  return a.id - b.id;
}

function toDisplayedNative(p: ParameterDef, groupId: string): DisplayedParameter {
  return {
    ...p,
    uiKey: `native-${groupId}-${p.id}`,
    displayOrder: p.displayOrder ?? p.offset,
  };
}

function toDisplayedMirror(
  base: ParameterDef,
  groupId: string,
  spec: ReturnType<typeof mirrorsForGroup>[number]
): DisplayedParameter {
  return {
    ...base,
    label: spec.label ?? base.label,
    section: spec.section,
    sectionOrder: spec.sectionOrder,
    displayOrder: spec.displayOrder,
    uiKey: `mirror-${groupId}-${spec.paramId}-${spec.section}`,
    mirroredFrom: spec.mirroredFrom ?? base.group,
  };
}

export function getParametersForGroup(
  groupId: string,
  scope: ParameterScope
): DisplayedParameter[] {
  const list = scope === "preset" ? presetParameters : systemParameters;
  const native = list
    .filter((p) => p.group === groupId)
    .map((p) => toDisplayedNative(p, groupId));

  const nativeIds = new Set(native.map((p) => p.id));
  const mirrored: DisplayedParameter[] = [];
  for (const spec of mirrorsForGroup(groupId)) {
    const base = parameterById.get(spec.paramId);
    if (!base) continue;
    if (!spec.crossScope && base.scope !== scope) continue;
    if (nativeIds.has(base.id)) continue;
    mirrored.push(toDisplayedMirror(base, groupId, spec));
  }

  return [...native, ...mirrored].sort(compareDisplayed);
}

export function searchParameters(
  query: string,
  scope?: ParameterScope
): ParameterDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const list = scope
    ? scope === "preset"
      ? presetParameters
      : systemParameters
    : allParameters;
  return list.filter(
    (p) =>
      p.label.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      String(p.id).includes(q)
  );
}

export { presetParameters, systemParameters, allParameters };
