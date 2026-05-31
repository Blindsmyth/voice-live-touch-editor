import {
  MODEL_ID,
  MSG_PARAMETER_DATA,
  MSG_REQUEST_PARAMETER,
  TC_HELICON_MANUFACTURER,
} from "./parameters.js";

/** Pack a signed value into two 7-bit SysEx bytes (14-bit). */
export function pack14(value: number): [number, number] {
  let temp = value;
  if (value < 0) {
    temp = 16384 + value;
  }
  const msb = Math.floor(temp / 128);
  const lsb = temp - msb * 128;
  return [msb, lsb];
}

/** Pack a signed value into four 7-bit SysEx bytes (28-bit), matching the Axoloti reference editor. */
export function pack28(value: number): [number, number, number, number] {
  if (value < 0) {
    return [31, 127, 127, 128 + value];
  }
  const msb3 = Math.floor(value / 2097152);
  const msb2 = Math.floor(value / 16384);
  const msb = Math.floor(value / 128);
  const lsb = value - (msb * 128 + msb2 * 16384 + msb3 * 2097152);
  return [msb3, msb2, msb, lsb];
}

/** Unpack four 7-bit bytes into a signed 28-bit value. */
export function unpack28(
  msb3: number,
  msb2: number,
  msb: number,
  lsb: number
): number {
  if (msb3 === 31 && msb2 === 127 && msb === 127) {
    return lsb - 128;
  }
  return msb3 * 2097152 + msb2 * 16384 + msb * 128 + lsb;
}

/** Unpack two 7-bit bytes into a signed 14-bit value. */
export function unpack14(msb: number, lsb: number): number {
  const raw = msb * 128 + lsb;
  if (raw >= 8192) {
    return raw - 16384;
  }
  return raw;
}

function buildHeader(sysexId: number, messageId: number): number[] {
  return [0xf0, ...TC_HELICON_MANUFACTURER, sysexId, MODEL_ID, messageId];
}

/** Build a Parameter Data (0x22) message to set a parameter value. */
export function buildSetParameter(
  sysexId: number,
  paramId: number,
  value: number
): Uint8Array {
  const [pMsb, pLsb] = pack14(paramId);
  const [v3, v2, v1, v0] = pack28(value);
  return new Uint8Array([
    ...buildHeader(sysexId, MSG_PARAMETER_DATA),
    pMsb,
    pLsb,
    v3,
    v2,
    v1,
    v0,
    0xf7,
  ]);
}

/** Build a Request Parameter (0x47) message. */
export function buildRequestParameter(
  sysexId: number,
  paramId: number
): Uint8Array {
  const [pMsb, pLsb] = pack14(paramId);
  return new Uint8Array([
    ...buildHeader(sysexId, MSG_REQUEST_PARAMETER),
    pMsb,
    pLsb,
    0xf7,
  ]);
}

export interface ParsedParameterResponse {
  paramId: number;
  value: number;
}

/**
 * Parse an incoming SysEx message. Returns param/value if it is a Parameter Data
 * response for this device (TC-Helicon VoiceLive Touch).
 */
export function parseParameterResponse(
  data: Uint8Array,
  sysexId: number
): ParsedParameterResponse | null {
  if (data.length < 14) return null;
  if (data[0] !== 0xf0 || data[data.length - 1] !== 0xf7) return null;
  if (
    data[1] !== TC_HELICON_MANUFACTURER[0] ||
    data[2] !== TC_HELICON_MANUFACTURER[1] ||
    data[3] !== TC_HELICON_MANUFACTURER[2]
  ) {
    return null;
  }
  if (data[4] !== sysexId || data[5] !== MODEL_ID) return null;
  if (data[6] !== MSG_PARAMETER_DATA) return null;

  const paramId = unpack14(data[7], data[8]);
  const value = unpack28(data[9], data[10], data[11], data[12]);
  return { paramId, value };
}

/** Format bytes as hex for debug display. */
export function formatSysex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}
