import enumsJson from "./parameter-enums.json" with { type: "json" };
import type { EnumOption } from "./parameters.js";

export type { EnumOption };

export const PARAMETER_ENUMS: Record<number, EnumOption[]> = Object.fromEntries(
  Object.entries(enumsJson).map(([k, v]) => [Number(k), v as EnumOption[]])
);

export function getEnumOptions(paramId: number): EnumOption[] | undefined {
  return PARAMETER_ENUMS[paramId];
}

export function semitoneLabel(value: number, centre = 0): string {
  const semi = value - centre;
  if (semi === 0) return "0 st";
  return semi > 0 ? `+${semi} st` : `${semi} st`;
}

export function enumLabel(paramId: number, value: number): string {
  const opts = PARAMETER_ENUMS[paramId];
  if (!opts) return String(value);
  return opts.find((o) => o.value === value)?.label ?? String(value);
}

/** Display label for slider params with generated semitone options (Int_shift / Int_scale). */
export function parameterValueLabel(
  param: { id: number; name: string; centre: number; options?: EnumOption[] },
  value: number
): string {
  if (/Int_shift/.test(param.name)) return semitoneLabel(value, 0);
  if (/Int_scale/.test(param.name)) return semitoneLabel(value, param.centre);
  if (param.options?.length) return enumLabel(param.id, value);
  return String(value);
}
