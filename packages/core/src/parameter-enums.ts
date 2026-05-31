import enumsJson from "./parameter-enums.json" with { type: "json" };
import type { EnumOption } from "./parameters.js";

export type { EnumOption };

export const PARAMETER_ENUMS: Record<number, EnumOption[]> = Object.fromEntries(
  Object.entries(enumsJson).map(([k, v]) => [Number(k), v as EnumOption[]])
);

export function getEnumOptions(paramId: number): EnumOption[] | undefined {
  return PARAMETER_ENUMS[paramId];
}

export function enumLabel(paramId: number, value: number): string {
  const opts = PARAMETER_ENUMS[paramId];
  if (!opts) return String(value);
  return opts.find((o) => o.value === value)?.label ?? String(value);
}
