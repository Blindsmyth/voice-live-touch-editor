import {
  MODEL_ID,
  MSG_NOTIFICATION,
  MSG_PRESET_DATA,
  MSG_PRESET_HEADER,
  MSG_REQUEST_PRESET,
  MSG_REQUEST_PRESET_HEADER,
  TC_HELICON_MANUFACTURER,
} from "./parameters.js";
import {
  PRESET_DATA_MESSAGE_COUNT,
  PRESET_PARAMS_PER_MESSAGE,
  PRESET_PARAMETER_VERSION,
  PRESET_VALUE_COUNT,
  type PresetSnapshot,
  decodePresetName,
  encodePresetName,
  createEmptySnapshot,
} from "./preset-snapshot.js";
import { pack14, pack28, unpack14, unpack28 } from "./sysex.js";

function buildEnvelope(sysexId: number, messageId: number): number[] {
  return [0xf0, ...TC_HELICON_MANUFACTURER, sysexId, MODEL_ID, messageId];
}

export function sysexChecksum(bytes: number[]): number {
  let sum = 0;
  for (const b of bytes) sum += b & 0x7f;
  return sum & 0x7f;
}

/** Request preset by number (0 = live edited step). */
export function buildRequestPreset(sysexId: number, presetNumber: number): Uint8Array {
  const [msb, lsb] = pack14(presetNumber);
  return new Uint8Array([...buildEnvelope(sysexId, MSG_REQUEST_PRESET), msb, lsb, 0xf7]);
}

/** Request preset header only (name, tags, step count). */
export function buildRequestPresetHeader(
  sysexId: number,
  presetNumber: number
): Uint8Array {
  const [msb, lsb] = pack14(presetNumber);
  return new Uint8Array([
    ...buildEnvelope(sysexId, MSG_REQUEST_PRESET_HEADER),
    msb,
    lsb,
    0xf7,
  ]);
}

export interface ParsedPresetHeader {
  presetNumber: number;
  version: number;
  name: string;
  tags: number;
  stepCount: number;
}

export interface ParsedPresetData {
  index: number;
  values: number[];
}

function findMessageBody(data: Uint8Array): {
  sysexId: number;
  messageId: number;
  payloadStart: number;
  payloadEnd: number;
} | null {
  let start = 0;
  let end = data.length;
  if (data[0] === 0xf0) start = 1;
  if (data.length > 0 && data[data.length - 1] === 0xf7) end = data.length - 1;
  const body = data.subarray(start, end);

  for (let i = 0; i <= body.length - 7; i++) {
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
    return {
      sysexId,
      messageId,
      payloadStart: i + 6,
      payloadEnd: body.length,
    };
  }
  return null;
}

function stripSysexBody(data: Uint8Array): Uint8Array {
  let start = 0;
  let end = data.length;
  if (data[0] === 0xf0) start = 1;
  if (data.length > 0 && data[data.length - 1] === 0xf7) end = data.length - 1;
  return data.subarray(start, end);
}

function parsePresetHeaderAt(body: Uint8Array, rel: number): ParsedPresetHeader | null {
  if (rel + 24 > body.length) return null;
  const presetNumber = unpack14(body[rel], body[rel + 1]);
  const version = unpack14(body[rel + 2], body[rel + 3]);
  const nameBytes = body.slice(rel + 4, rel + 19);
  const tags = unpack28(
    body[rel + 19],
    body[rel + 20],
    body[rel + 21],
    body[rel + 22]
  );
  const stepCount = body[rel + 23];
  return {
    presetNumber,
    version,
    name: decodePresetName([...nameBytes]),
    tags,
    stepCount,
  };
}

export function parsePresetHeader(
  data: Uint8Array,
  expectedSysexId?: number
): ParsedPresetHeader | null {
  const msg = findMessageBody(data);
  if (msg?.messageId === MSG_PRESET_HEADER) {
    if (expectedSysexId !== undefined && msg.sysexId !== expectedSysexId) {
      return parsePresetHeader(data);
    }
    const body = stripSysexBody(data);
    const rel = msg.payloadStart - (data[0] === 0xf0 ? 1 : 0);
    return parsePresetHeaderAt(body, rel);
  }

  const body = stripSysexBody(data);
  for (let i = 0; i <= body.length - 31; i++) {
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
    if (messageId !== MSG_PRESET_HEADER) continue;
    if (expectedSysexId !== undefined && sysexId !== expectedSysexId) continue;
    return parsePresetHeaderAt(body, i + 6);
  }
  return null;
}

export function parsePresetData(
  data: Uint8Array,
  expectedSysexId?: number
): ParsedPresetData | null {
  const msg = findMessageBody(data);
  if (!msg || msg.messageId !== MSG_PRESET_DATA) return null;
  if (expectedSysexId !== undefined && msg.sysexId !== expectedSysexId) return null;

  const body = data.subarray(
    data[0] === 0xf0 ? 1 : 0,
    data[data.length - 1] === 0xf7 ? data.length - 1 : data.length
  );
  const rel = msg.payloadStart - (data[0] === 0xf0 ? 1 : 0);
  if (rel + 102 > body.length) return null;

  const index = body[rel];
  const values: number[] = [];
  for (let i = 0; i < PRESET_PARAMS_PER_MESSAGE; i++) {
    const base = rel + 1 + i * 4;
    values.push(
      unpack28(body[base], body[base + 1], body[base + 2], body[base + 3])
    );
  }

  const dataBytes = body.slice(rel + 1, rel + 1 + 100);
  const expected = sysexChecksum([...dataBytes]);
  const actual = body[rel + 101];
  if (expected !== actual) {
    console.warn(
      `Preset data checksum mismatch index=${index}: expected ${expected}, got ${actual}`
    );
  }

  return { index, values };
}

export function buildPresetHeader(
  sysexId: number,
  snapshot: PresetSnapshot
): Uint8Array {
  const [pMsb, pLsb] = pack14(snapshot.number);
  const [vMsb, vLsb] = pack14(snapshot.version);
  const nameBytes = encodePresetName(snapshot.name);
  const [t3, t2, t1, t0] = pack28(snapshot.tags);
  const payload = [
    pMsb,
    pLsb,
    vMsb,
    vLsb,
    ...nameBytes,
    t3,
    t2,
    t1,
    t0,
    snapshot.stepCount & 0x7f,
  ];
  return new Uint8Array([...buildEnvelope(sysexId, MSG_PRESET_HEADER), ...payload, 0xf7]);
}

export function buildPresetData(
  sysexId: number,
  index: number,
  valuesByOffset: number[]
): Uint8Array {
  const start = index * PRESET_PARAMS_PER_MESSAGE;
  const dataBytes: number[] = [];
  for (let i = 0; i < PRESET_PARAMS_PER_MESSAGE; i++) {
    const offset = start + i;
    const value =
      offset < valuesByOffset.length ? valuesByOffset[offset] : 0;
    const [v3, v2, v1, v0] = pack28(value);
    dataBytes.push(v3, v2, v1, v0);
  }
  const checksum = sysexChecksum(dataBytes);
  return new Uint8Array([
    ...buildEnvelope(sysexId, MSG_PRESET_DATA),
    index & 0x7f,
    ...dataBytes,
    checksum,
    0xf7,
  ]);
}

export function presetMessagesToSyxBlob(
  sysexId: number,
  snapshot: PresetSnapshot
): Uint8Array {
  const parts: number[] = [];
  const push = (u: Uint8Array) => parts.push(...u);
  push(buildPresetHeader(sysexId, snapshot));
  for (let i = 0; i < PRESET_DATA_MESSAGE_COUNT; i++) {
    push(buildPresetData(sysexId, i, snapshot.valuesByOffset));
  }
  return new Uint8Array(parts);
}

export function parseSyxBlob(data: Uint8Array, sysexId = 0): PresetSnapshot[] {
  const snapshots: PresetSnapshot[] = [];
  let i = 0;
  while (i < data.length) {
    if (data[i] !== 0xf0) {
      i++;
      continue;
    }
    let end = i + 1;
    while (end < data.length && data[end] !== 0xf7) end++;
    if (end >= data.length) break;
    const msg = data.subarray(i, end + 1);
    const header = parsePresetHeader(msg, sysexId);
    if (header) {
      const snap = createEmptySnapshot(header.presetNumber);
      snap.version = header.version;
      snap.name = header.name;
      snap.tags = header.tags;
      snap.stepCount = header.stepCount;
      snapshots.push(snap);
      i = end + 1;
      continue;
    }
    const chunk = parsePresetData(msg, sysexId);
    if (chunk && snapshots.length > 0) {
      const snap = snapshots[snapshots.length - 1];
      const base = chunk.index * PRESET_PARAMS_PER_MESSAGE;
      chunk.values.forEach((v, j) => {
        const offset = base + j;
        if (offset < PRESET_VALUE_COUNT) snap.valuesByOffset[offset] = v;
      });
    }
    i = end + 1;
  }
  return snapshots;
}

export type NotificationCode = 1 | 2 | 3 | 4 | 6 | 7 | 8;

export function parseNotification(
  data: Uint8Array,
  sysexId?: number
): NotificationCode | null {
  if (data.length < 8) return null;
  let i = 0;
  if (data[0] === 0xf0) i = 1;
  if (
    data[i] !== 0x00 ||
    data[i + 1] !== 0x01 ||
    data[i + 2] !== 0x38
  ) {
    return null;
  }
  const idByte = data[i + 3];
  if (sysexId !== undefined && idByte !== sysexId) return null;
  if (data[i + 4] !== MODEL_ID && data[i + 4] !== 91) return null;
  if (data[i + 5] !== MSG_NOTIFICATION) return null;
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

export type PresetTransferPhase =
  | "idle"
  | "receiving"
  | "complete"
  | "sending"
  | "awaiting_ack";

export type PresetTransferListener = (state: {
  phase: PresetTransferPhase;
  snapshot: PresetSnapshot | null;
  status: string;
}) => void;

export class PresetTransferService {
  private sysexId = 0;
  private phase: PresetTransferPhase = "idle";
  private snapshot: PresetSnapshot | null = null;
  private receivedData = new Set<number>();
  private listeners = new Set<PresetTransferListener>();
  private sendOutput: ((bytes: Uint8Array) => void) | null = null;
  private sendQueue: Uint8Array[] = [];
  private sendTimer: ReturnType<typeof setTimeout> | null = null;
  private ackTimeout: ReturnType<typeof setTimeout> | null = null;

  setSysexId(id: number): void {
    this.sysexId = Math.max(0, Math.min(127, Math.round(id)));
  }

  setSendHandler(handler: (bytes: Uint8Array) => void): void {
    this.sendOutput = handler;
  }

  onState(listener: PresetTransferListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getPhase(): PresetTransferPhase {
    return this.phase;
  }

  getSnapshot(): PresetSnapshot | null {
    return this.snapshot;
  }

  private emit(status: string): void {
    for (const l of this.listeners) {
      l({ phase: this.phase, snapshot: this.snapshot, status });
    }
  }

  requestPreset(presetNumber: number): void {
    this.phase = "receiving";
    this.snapshot = createEmptySnapshot(presetNumber);
    this.receivedData.clear();
    this.emit(`Requesting preset ${presetNumber}…`);
    this.sendOutput?.(buildRequestPreset(this.sysexId, presetNumber));
    setTimeout(() => {
      if (this.phase === "receiving") {
        this.sendOutput?.(buildRequestPresetHeader(this.sysexId, presetNumber));
      }
    }, 120);
  }

  requestPresetHeaderOnly(presetNumber: number): void {
    this.sendOutput?.(buildRequestPresetHeader(this.sysexId, presetNumber));
  }

  applyHeaderToSnapshot(header: ParsedPresetHeader): void {
    if (!this.snapshot) {
      this.snapshot = createEmptySnapshot(header.presetNumber);
    }
    this.snapshot.number = header.presetNumber;
    this.snapshot.version = header.version;
    this.snapshot.name = header.name;
    this.snapshot.tags = header.tags;
    this.snapshot.stepCount = header.stepCount;
  }

  handleSysex(data: Uint8Array): boolean {
    const header = parsePresetHeader(data, this.sysexId) ?? parsePresetHeader(data);
    if (header) {
      this.applyHeaderToSnapshot(header);
      if (this.phase === "idle") this.phase = "receiving";
      this.emit(`Received header: ${header.name || "(unnamed)"}`);
      return true;
    }

    const chunk =
      parsePresetData(data, this.sysexId) ?? parsePresetData(data);
    if (chunk && this.snapshot) {
      const base = chunk.index * PRESET_PARAMS_PER_MESSAGE;
      chunk.values.forEach((v, j) => {
        const offset = base + j;
        if (offset < PRESET_VALUE_COUNT) {
          this.snapshot!.valuesByOffset[offset] = v;
        }
      });
      this.receivedData.add(chunk.index);
      const dataComplete =
        this.receivedData.size >= PRESET_DATA_MESSAGE_COUNT ||
        (this.receivedData.size >= 9 && this.receivedData.has(9));
      if (dataComplete && this.phase === "receiving") {
        this.finishReceiving();
      } else {
        this.emit(`Preset data ${chunk.index + 1}/${PRESET_DATA_MESSAGE_COUNT}`);
      }
      return true;
    }
    return false;
  }

  private finishReceiving(): void {
    if (!this.snapshot || this.phase !== "receiving") return;
    this.phase = "complete";
    this.emit(
      `Preset ${this.snapshot.number} loaded (${this.snapshot.name || "unnamed"})`
    );
  }

  handleNotification(code: NotificationCode): void {
    if (code === 1) {
      if (this.phase === "awaiting_ack" && this.snapshot) {
        if (this.ackTimeout) clearTimeout(this.ackTimeout);
        this.phase = "complete";
        this.emit(
          `Preset ${this.snapshot.number} saved to device (${this.snapshot.name || "unnamed"})`
        );
        return;
      }
      if (this.phase === "receiving" && this.snapshot) {
        this.finishReceiving();
      }
    } else if (this.phase === "sending" || this.phase === "awaiting_ack") {
      if (this.sendTimer) clearTimeout(this.sendTimer);
      if (this.ackTimeout) clearTimeout(this.ackTimeout);
      this.sendQueue = [];
      this.phase = "idle";
      this.emit(NOTIFICATION_LABELS[code] ?? `Error ${code}`);
    }
  }

  savePreset(snapshot: PresetSnapshot): void {
    if (snapshot.number < 1) {
      this.emit("Cannot save to slot 0 — choose a user preset (1–275) or favorite (276–300).");
      return;
    }
    const snap: PresetSnapshot = {
      ...snapshot,
      valuesByOffset: [...snapshot.valuesByOffset],
      version:
        snapshot.version > 0 ? snapshot.version : PRESET_PARAMETER_VERSION,
      stepCount: Math.max(1, snapshot.stepCount || 1),
      name: snapshot.name || "",
    };
    this.snapshot = snap;
    this.phase = "sending";
    if (this.ackTimeout) clearTimeout(this.ackTimeout);
    this.sendQueue = [
      buildPresetHeader(this.sysexId, snap),
      ...Array.from({ length: PRESET_DATA_MESSAGE_COUNT }, (_, i) =>
        buildPresetData(this.sysexId, i, snap.valuesByOffset)
      ),
    ];
    this.emit(`Saving preset ${snap.number}…`);
    this.flushSendQueue();
    this.ackTimeout = setTimeout(() => {
      if (this.phase === "awaiting_ack") {
        this.phase = "idle";
        this.emit(
          "No response from device after save — check MIDI input and SysEx ID."
        );
      }
    }, 8000);
  }

  private flushSendQueue(): void {
    if (!this.sendOutput || this.sendQueue.length === 0) {
      if (this.sendQueue.length === 0 && this.phase === "sending") {
        this.phase = "awaiting_ack";
        this.emit("Waiting for device ack…");
      }
      return;
    }
    const msg = this.sendQueue.shift()!;
    this.sendOutput(msg);
    if (this.sendQueue.length > 0) {
      this.phase = "sending";
      this.sendTimer = setTimeout(() => this.flushSendQueue(), 60);
    } else {
      this.phase = "awaiting_ack";
      this.emit("Waiting for device ack…");
    }
  }

  reset(): void {
    if (this.sendTimer) clearTimeout(this.sendTimer);
    if (this.ackTimeout) clearTimeout(this.ackTimeout);
    this.phase = "idle";
    this.snapshot = null;
    this.receivedData.clear();
    this.sendQueue = [];
    this.emit("Idle");
  }
}

export const presetTransferService = new PresetTransferService();
