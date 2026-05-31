export type ParameterScope = "preset" | "system";
export type ParameterControl = "slider" | "toggle" | "select";

export interface EnumOption {
  value: number;
  label: string;
}

export interface ParameterDef {
  id: number;
  offset: number;
  name: string;
  label: string;
  scope: ParameterScope;
  group: string;
  subgroup?: string;
  min: number;
  max: number;
  centre: number;
  control: ParameterControl;
  options?: EnumOption[];
}

/** @deprecated use presetParameters — Harm Vol (Mixer_L Level Harmony) */
export const harmVol: ParameterDef = {
  id: 193,
  offset: 77,
  name: "Mixer_L Level Harmony",
  label: "Harm Vol",
  scope: "preset",
  group: "Mixer",
  subgroup: "Levels",
  min: -61,
  max: 0,
  centre: -60,
  control: "slider",
};

export const TC_HELICON_MANUFACTURER = [0x00, 0x01, 0x38] as const;
export const MODEL_ID = 0x5b;
export const MSG_PARAMETER_DATA = 0x22;
export const MSG_REQUEST_PARAMETER = 0x47;
export const MSG_EDITOR_MODE = 0x53;
export const MSG_REQUEST_PRESET = 0x45;
export const MSG_REQUEST_PRESET_HEADER = 0x46;
export const MSG_PRESET_HEADER = 0x20;
export const MSG_PRESET_DATA = 0x21;
export const MSG_ACTIVATED_PRESET_INFO = 0x23;
export const MSG_NOTIFICATION = 0x34;
