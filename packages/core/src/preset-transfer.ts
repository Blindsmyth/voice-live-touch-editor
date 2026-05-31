import { MODEL_ID, MSG_NOTIFICATION, MSG_REQUEST_PRESET, TC_HELICON_MANUFACTURER } from "./parameters.js";
import { pack14 } from "./sysex.js";

function buildHeader(sysexId: number, messageId: number): number[] {
  return [0xf0, ...TC_HELICON_MANUFACTURER, sysexId, MODEL_ID, messageId];
}

/** Request current / live preset (0 = active edited step). */
export function buildRequestPreset(sysexId: number, presetNumber: number): Uint8Array {
  const [msb, lsb] = pack14(presetNumber);
  return new Uint8Array([...buildHeader(sysexId, MSG_REQUEST_PRESET), msb, lsb, 0xf7]);
}

export type NotificationCode = 1 | 2 | 3 | 4 | 6 | 7 | 8;

export function parseNotification(data: Uint8Array, sysexId: number): NotificationCode | null {
  if (data.length < 8) return null;
  let i = 0;
  if (data[0] === 0xf0) i = 1;
  if (
    data[i] !== 0x00 ||
    data[i + 1] !== 0x01 ||
    data[i + 2] !== 0x38 ||
    data[i + 3] !== sysexId ||
    data[i + 4] !== MODEL_ID ||
    data[i + 5] !== MSG_NOTIFICATION
  ) {
    return null;
  }
  return data[i + 6] as NotificationCode;
}

export const NOTIFICATION_LABELS: Record<number, string> = {
  1: "Preset data received",
  2: "Preset does not exist / out of range",
  3: "Memory full",
  4: "Incompatible preset version",
  6: "Checksum failed",
  7: "Too many steps",
  8: "Preset packages out of sync",
};
