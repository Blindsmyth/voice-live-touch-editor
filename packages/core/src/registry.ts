import { presetParameters } from "./generated/preset-parameters.js";
import { systemParameters } from "./generated/system-parameters.js";
import { parameterGroups } from "./generated/parameter-groups.js";
import type { ParameterDef, ParameterScope } from "./parameters.js";

export { parameterGroups };

const allParameters: ParameterDef[] = [...presetParameters, ...systemParameters];

export const parameterById = new Map<number, ParameterDef>(
  allParameters.map((p) => [p.id, p])
);

export function getParameter(id: number): ParameterDef | undefined {
  return parameterById.get(id);
}

export function getParametersForGroup(
  groupId: string,
  scope: ParameterScope
): ParameterDef[] {
  const list = scope === "preset" ? presetParameters : systemParameters;
  return list.filter((p) => p.group === groupId);
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
