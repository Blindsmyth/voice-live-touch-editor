import {
  MODEL_ID,
  MSG_ACTIVATED_PRESET_INFO,
  MSG_EDITOR_MODE,
  MSG_PARAMETER_DATA,
  MSG_REQUEST_PARAMETER,
  TC_HELICON_MANUFACTURER,
} from "./parameters.js";

export interface ActivatedPresetInfo {
  presetNumber: number;
  step: number;
}

/** Editor mode 3 — device responds with Activated Preset Info (0x23). */
export function buildRequestActivatedPresetInfo(sysexId: number): Uint8Array {
  return buildEditorMode(sysexId, 3);
}

/** Parse Activated Preset Info (0x23): active preset number + step. */
export function parseActivatedPresetInfo(
  data: Uint8Array,
  expectedSysexId?: number
): ActivatedPresetInfo | null {
  let start = 0;
  let end = data.length;
  if (data[0] === 0xf0) start = 1;
  if (data.length > 0 && data[data.length - 1] === 0xf7) end = data.length - 1;
  const body = data.subarray(start, end);

  for (let i = 0; i <= body.length - 10; i++) {
    if (
      body[i] !== TC_HELICON_MANUFACTURER[0] ||
      body[i + 1] !== TC_HELICON_MANUFACTURER[1] ||
      body[i + 2] !== TC_HELICON_MANUFACTURER[2]
    ) {
      continue;
    }
    const sysexId = body[i + 3];
    const modelId = body[i + 4];
    const messageId = body[i + 5];
    if (modelId !== MODEL_ID && modelId !== 91) continue;
    if (messageId !== MSG_ACTIVATED_PRESET_INFO) continue;
    if (expectedSysexId !== undefined && sysexId !== expectedSysexId) continue;
    if (i + 9 > body.length) return null;
    return {
      presetNumber: unpack14(body[i + 6], body[i + 7]),
      step: body[i + 8] & 0x7f,
    };
  }
  return null;
}

/** Pack a signed value into two 7-bit SysEx bytes (14-bit), inverse of unpack14. */
export function pack14(value: number): [number, number] {
  let temp = value;
  if (value < 0) temp = 16384 + value;
  temp = Math.round(temp) & 0x3fff;
  return [(temp >> 7) & 0x7f, temp & 0x7f];
}

/**
 * Pack a signed 28-bit value into four 7-bit SysEx bytes (inverse of unpack28).
 * All returned bytes are 0–127 (required by Web MIDI SysEx send).
 */
export function pack28(value: number): [number, number, number, number] {
  if (value < 0 && value >= -128) {
    return [31, 127, 127, 128 + value];
  }
  let raw = Math.round(value);
  if (raw < 0) {
    raw = (1 << 28) + raw;
  }
  raw &= 0xfffffff;
  return [
    (raw >> 21) & 0x7f,
    (raw >> 14) & 0x7f,
    (raw >> 7) & 0x7f,
    raw & 0x7f,
  ];
}

/** True if a complete F0…F7 message is valid for Web MIDI (data bytes ≤ 127). */
export function isValidSysexMessage(bytes: Uint8Array): boolean {
  if (bytes.length < 2 || bytes[0] !== 0xf0 || bytes[bytes.length - 1] !== 0xf7) {
    return false;
  }
  for (let i = 1; i < bytes.length - 1; i++) {
    if (bytes[i] > 127) return false;
  }
  return true;
}

/** Unpack four 7-bit bytes into a signed 28-bit value. */
export function unpack28(
  msb3: number,
  msb2: number,
  msb: number,
  lsb: number
): number {
  // VoiceLive Touch / Axoloti negative shortcut
  if (msb3 === 31 && msb2 === 127 && msb === 127) {
    return lsb - 128;
  }
  let raw = ((msb3 & 0x7f) << 21) | ((msb2 & 0x7f) << 14) | ((msb & 0x7f) << 7) | (lsb & 0x7f);
  // 28-bit two's complement
  if (raw & 0x8000000) {
    raw -= 0x10000000;
  }
  return raw;
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

/** Build Editor Mode (0x53) — mode 1 enables parameter echo over SysEx. */
export function buildEditorMode(sysexId: number, mode: number): Uint8Array {
  return new Uint8Array([...buildHeader(sysexId, MSG_EDITOR_MODE), mode, 0xf7]);
}

/** Reassemble SysEx fragments from Web MIDI (multi-packet messages). */
export function createSysexAssembler(
  onMessage: (message: Uint8Array) => void
): (data: Uint8Array) => void {
  let buffer: number[] = [];

  return (data: Uint8Array) => {
    for (let i = 0; i < data.length; i++) {
      const byte = data[i];
      if (byte === 0xf0) {
        buffer = [0xf0];
        continue;
      }
      if (buffer.length === 0) continue;
      buffer.push(byte);
      if (byte === 0xf7) {
        onMessage(new Uint8Array(buffer));
        buffer = [];
      }
    }
  };
}

export interface ParsedParameterResponse {
  paramId: number;
  value: number;
}

function isParameterDataMessageId(byte: number): boolean {
  return byte === MSG_PARAMETER_DATA || byte === 34;
}

function isModelId(byte: number): boolean {
  return byte === MODEL_ID || byte === 91;
}

/**
 * Parse an incoming SysEx message. Returns param/value if it is a Parameter Data
 * response for this device (TC-Helicon VoiceLive Touch).
 * If expectedSysexId is undefined, any SysEx ID in the message is accepted.
 */
export function parseParameterResponse(
  data: Uint8Array,
  expectedSysexId?: number
): ParsedParameterResponse | null {
  let start = 0;
  let end = data.length;
  if (data[0] === 0xf0) start = 1;
  if (data.length > 0 && data[data.length - 1] === 0xf7) end = data.length - 1;

  const body = data.subarray(start, end);
  if (body.length < 11) return null;

  for (let i = 0; i <= body.length - 11; i++) {
    if (
      body[i] !== TC_HELICON_MANUFACTURER[0] ||
      body[i + 1] !== TC_HELICON_MANUFACTURER[1] ||
      body[i + 2] !== TC_HELICON_MANUFACTURER[2]
    ) {
      continue;
    }

    const sysexIdByte = body[i + 3];
    const modelId = body[i + 4];
    const messageId = body[i + 5];

    if (!isModelId(modelId) || !isParameterDataMessageId(messageId)) continue;
    if (expectedSysexId !== undefined && sysexIdByte !== expectedSysexId) {
      continue;
    }

    const paramId = unpack14(body[i + 6], body[i + 7]);
    const value = unpack28(
      body[i + 8],
      body[i + 9],
      body[i + 10],
      body[i + 11]
    );
    return { paramId, value };
  }

  return null;
}

/** Format bytes as hex for debug display. */
export function formatSysex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}
