export interface ParameterDef {
  id: number;
  name: string;
  min: number;
  max: number;
  centre: number;
}

/** Harm Vol — Mixer_L Level Harmony (preset package, offset 77). */
export const harmVol: ParameterDef = {
  id: 193,
  name: "Harm Vol",
  min: -61,
  max: 0,
  centre: -60,
};

export const TC_HELICON_MANUFACTURER = [0x00, 0x01, 0x38] as const;
export const MODEL_ID = 0x5b;
export const MSG_PARAMETER_DATA = 0x22;
export const MSG_REQUEST_PARAMETER = 0x47;
