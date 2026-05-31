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
  PRESET_VALUE_COUNT,
  DEFAULT_VERSION_WIRE,
  parse14BitPair,
  type PresetSnapshot,
  decodePresetName,
  encodePresetName,
  createEmptySnapshot,
} from "./preset-snapshot.js";
import { isValidSysexMessage, pack14, pack28, unpack14, unpack28 } from "./sysex.js";
import { presetParameters } from "./generated/preset-parameters.js";

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
  versionWire: [number, number];
  numberWire: [number, number];
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
  const num = parse14BitPair(body[rel], body[rel + 1]);
  const ver = parse14BitPair(body[rel + 2], body[rel + 3]);
  const nameBytes = body.slice(rel + 4, rel + 19);
  const tags = unpack28(
    body[rel + 19],
    body[rel + 20],
    body[rel + 21],
    body[rel + 22]
  );
  const stepCount = body[rel + 23];
  return {
    presetNumber: num.value,
    numberWire: num.wire,
    version: ver.value,
    versionWire: ver.wire,
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
    return parsePresetHeaderAt(body, msg.payloadStart);
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
  if (expectedSysexId !== undefined && msg.sysexId !== expectedSysexId) {
    return parsePresetData(data);
  }

  const body = stripSysexBody(data);
  const rel = msg.payloadStart;
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
  const [pMsb, pLsb] =
    snapshot.numberWire ?? pack14(snapshot.number);
  const [vMsb, vLsb] = snapshot.versionWire;
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

const offsetToPresetParam = new Map(
  presetParameters.map((p) => [p.offset, p] as const)
);

function clampPresetValueAtOffset(offset: number, value: number): number {
  const def = offsetToPresetParam.get(offset);
  if (!def) return Math.round(value);
  return Math.round(Math.max(def.min, Math.min(def.max, value)));
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
    const raw =
      offset < valuesByOffset.length ? valuesByOffset[offset] : 0;
    const value = clampPresetValueAtOffset(offset, raw);
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
      snap.versionWire = [...header.versionWire];
      snap.numberWire = [...header.numberWire];
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
  if (sysexId !== undefined && idByte !== sysexId) {
    return parseNotification(data);
  }
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
  headerReceived?: boolean;
}) => void;

export type BulkJob =
  | { kind: "load-header"; slot: number }
  | { kind: "load-full"; slot: number }
  | { kind: "send"; snapshot: PresetSnapshot };

export type BulkMode = "load-headers" | "load-full" | "send-all";

export type BulkProgress = {
  active: boolean;
  mode: BulkMode | null;
  total: number;
  done: number;
  currentSlot: number | null;
  status: string;
};

export type BulkSlotListener = (
  snapshot: PresetSnapshot,
  partial: boolean
) => void;

/** True when all preset data chunks (0x21) for a full dump have arrived. */
export function isPresetDataComplete(received: Set<number>): boolean {
  const lastIndex = PRESET_DATA_MESSAGE_COUNT - 1;
  if (received.has(lastIndex)) return true;
  if (received.size >= PRESET_DATA_MESSAGE_COUNT) return true;
  for (let i = 0; i < lastIndex; i++) {
    if (!received.has(i)) return false;
  }
  return received.size >= lastIndex;
}

export class PresetTransferService {
  private sysexId = 0;
  private phase: PresetTransferPhase = "idle";
  private snapshot: PresetSnapshot | null = null;
  private receivedData = new Set<number>();
  private headerReceived = false;
  private listeners = new Set<PresetTransferListener>();
  private sendOutput: ((bytes: Uint8Array) => boolean) | null = null;
  private sendQueue: Uint8Array[] = [];
  private sendTimer: ReturnType<typeof setTimeout> | null = null;
  private ackTimeout: ReturnType<typeof setTimeout> | null = null;
  private receiveTimeout: ReturnType<typeof setTimeout> | null = null;
  private awaitingPaceAck = false;
  private savePacketTotal = 0;
  private savePacketsSent = 0;
  private expectingPresetData = false;
  private deviceVersionWire: [number, number] = [...DEFAULT_VERSION_WIRE];
  private headerWaiters: Array<{
    resolve: (header: ParsedPresetHeader | null) => void;
  }> = [];

  private bulkQueue: BulkJob[] = [];
  private bulkMode: BulkMode | null = null;
  private bulkDone = 0;
  private bulkHeaderOnly = false;
  private bulkSlotListener: BulkSlotListener | null = null;
  private bulkGapTimer: ReturnType<typeof setTimeout> | null = null;

  /** Gap between preset packets if the device does not send notification 1. */
  private static readonly PACE_FALLBACK_MS = 250;
  private static readonly SAVE_TOTAL_MS = 60000;
  private static readonly BULK_SLOT_GAP_MS = 180;
  private static readonly BULK_HEADER_TIMEOUT_MS = 4000;

  setSysexId(id: number): void {
    this.sysexId = Math.max(0, Math.min(127, Math.round(id)));
  }

  setSendHandler(
    handler: (bytes: Uint8Array) => boolean,
    getError?: () => string | null
  ): void {
    this.sendOutput = (bytes) => {
      const ok = handler(bytes);
      if (!ok && getError) {
        const detail = getError();
        if (detail) this.lastSendFailDetail = detail;
      }
      return ok;
    };
  }

  private lastSendFailDetail: string | null = null;

  onState(listener: PresetTransferListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onBulkSlot(listener: BulkSlotListener): () => void {
    this.bulkSlotListener = listener;
    return () => {
      if (this.bulkSlotListener === listener) this.bulkSlotListener = null;
    };
  }

  getBulkProgress(): BulkProgress {
    return {
      active: this.bulkMode !== null,
      mode: this.bulkMode,
      total: this.bulkDone + this.bulkQueue.length + (this.isBulkBusy() ? 1 : 0),
      done: this.bulkDone,
      currentSlot: this.snapshot?.number ?? null,
      status: this.bulkMode ? `${this.bulkMode}…` : "",
    };
  }

  private isBulkBusy(): boolean {
    return (
      this.phase === "receiving" ||
      this.phase === "sending" ||
      this.phase === "awaiting_ack"
    );
  }

  cancelBulk(): void {
    if (this.bulkGapTimer) clearTimeout(this.bulkGapTimer);
    this.bulkGapTimer = null;
    this.bulkQueue = [];
    this.bulkMode = null;
    this.bulkHeaderOnly = false;
    this.bulkDone = 0;
    if (this.phase === "receiving") this.cancelReceive();
    if (this.phase === "sending" || this.phase === "awaiting_ack") {
      this.cancelSave();
    }
    this.emit("Bulk operation cancelled.");
  }

  startBulkLoadHeaders(slots: number[]): void {
    this.startBulk(
      "load-headers",
      slots.map((slot) => ({ kind: "load-header", slot }))
    );
  }

  startBulkLoadFull(slots: number[]): void {
    this.startBulk(
      "load-full",
      slots.map((slot) => ({ kind: "load-full", slot }))
    );
  }

  startBulkSendAll(snapshots: PresetSnapshot[]): void {
    this.startBulk(
      "send-all",
      snapshots.map((snapshot) => ({ kind: "send", snapshot }))
    );
  }

  private startBulk(mode: BulkMode, jobs: BulkJob[]): void {
    if (jobs.length === 0) return;
    this.cancelBulk();
    this.bulkMode = mode;
    this.bulkQueue = jobs;
    this.bulkDone = 0;
    this.emit(`Starting ${mode} (${jobs.length} presets)…`);
    this.runNextBulkJob();
  }

  private runNextBulkJob(): void {
    if (this.bulkGapTimer) clearTimeout(this.bulkGapTimer);
    this.bulkGapTimer = null;
    if (this.bulkQueue.length === 0) {
      const mode = this.bulkMode;
      this.bulkMode = null;
      this.bulkHeaderOnly = false;
      this.emit(
        mode === "send-all"
          ? "Send all complete."
          : mode === "load-full"
            ? "Load all complete."
            : "Load all names complete."
      );
      return;
    }
    const job = this.bulkQueue[0];
    const remaining = this.bulkQueue.length;
    if (job.kind === "load-header") {
      this.emit(
        `Loading names… slot ${job.slot} (${this.bulkDone + 1}/${this.bulkDone + remaining})`
      );
      this.requestPresetHeaderBulk(job.slot);
    } else if (job.kind === "load-full") {
      this.emit(
        `Loading presets… slot ${job.slot} (${this.bulkDone + 1}/${this.bulkDone + remaining})`
      );
      this.requestPreset(job.slot);
    } else {
      this.emit(
        `Sending… slot ${job.snapshot.number} (${this.bulkDone + 1}/${this.bulkDone + remaining})`
      );
      this.savePreset(job.snapshot);
    }
  }

  private scheduleNextBulkJob(): void {
    this.bulkDone += 1;
    this.bulkQueue.shift();
    if (this.bulkGapTimer) clearTimeout(this.bulkGapTimer);
    this.bulkGapTimer = setTimeout(() => this.runNextBulkJob(), PresetTransferService.BULK_SLOT_GAP_MS);
  }

  private completeBulkSlot(partial: boolean): void {
    if (this.snapshot && this.bulkSlotListener) {
      this.bulkSlotListener(this.snapshot, partial);
    }
    this.scheduleNextBulkJob();
  }

  getPhase(): PresetTransferPhase {
    return this.phase;
  }

  getSnapshot(): PresetSnapshot | null {
    return this.snapshot;
  }

  getDeviceVersionWire(): [number, number] {
    return [...this.deviceVersionWire];
  }

  private emit(status: string, headerReceived = this.headerReceived): void {
    for (const l of this.listeners) {
      l({
        phase: this.phase,
        snapshot: this.snapshot,
        status,
        headerReceived,
      });
    }
  }

  private clearSendTimers(): void {
    if (this.sendTimer) clearTimeout(this.sendTimer);
    this.sendTimer = null;
    if (this.ackTimeout) clearTimeout(this.ackTimeout);
    this.ackTimeout = null;
    this.awaitingPaceAck = false;
  }

  /** Abort a stuck save (host→device transfer). */
  cancelSave(): void {
    if (this.phase !== "sending" && this.phase !== "awaiting_ack") return;
    this.clearSendTimers();
    this.sendQueue = [];
    this.phase = "idle";
    this.emit("Save cancelled.");
  }

  /** Abort a stuck receive so Save / a new Load can proceed. */
  cancelReceive(): void {
    if (this.receiveTimeout) clearTimeout(this.receiveTimeout);
    this.receiveTimeout = null;
    if (this.phase !== "receiving") return;
    this.phase = "idle";
    this.receivedData.clear();
    this.headerReceived = false;
    this.emit("Preset load cancelled.");
  }

  requestPreset(presetNumber: number): void {
    if (this.receiveTimeout) clearTimeout(this.receiveTimeout);
    this.expectingPresetData = true;
    this.phase = "receiving";
    this.headerReceived = false;
    this.snapshot = createEmptySnapshot(presetNumber);
    this.receivedData.clear();
    this.emit(`Requesting preset ${presetNumber}…`);
    this.sendOutput?.(buildRequestPreset(this.sysexId, presetNumber));
    this.receiveTimeout = setTimeout(() => {
      if (this.phase !== "receiving") return;
      if (this.headerReceived && this.receivedData.size > 0) {
        this.finishReceiving();
        return;
      }
      if (this.bulkMode === "load-full") {
        this.emit(`Slot ${presetNumber}: load timed out (skipped)`);
        this.scheduleNextBulkJob();
        return;
      }
      this.phase = "idle";
      this.headerReceived = false;
      this.emit(
        "Preset load timed out — check MIDI input routing and SysEx ID, then try Load again."
      );
    }, 15000);
  }

  requestPresetHeaderOnly(presetNumber: number): void {
    this.sendOutput?.(buildRequestPresetHeader(this.sysexId, presetNumber));
  }

  private requestPresetHeaderBulk(presetNumber: number): void {
    if (this.receiveTimeout) clearTimeout(this.receiveTimeout);
    this.bulkHeaderOnly = true;
    this.expectingPresetData = false;
    this.phase = "receiving";
    this.headerReceived = false;
    this.snapshot = createEmptySnapshot(presetNumber);
    this.receivedData.clear();
    this.sendOutput?.(buildRequestPresetHeader(this.sysexId, presetNumber));
    this.receiveTimeout = setTimeout(() => {
      if (this.phase !== "receiving" || !this.bulkHeaderOnly) return;
      if (this.headerReceived) {
        this.finishHeaderOnlyBulk();
      } else {
        this.emit(`Slot ${presetNumber}: no response (skipped)`);
        this.scheduleNextBulkJob();
      }
    }, PresetTransferService.BULK_HEADER_TIMEOUT_MS);
  }

  private finishHeaderOnlyBulk(): void {
    if (!this.snapshot || this.phase !== "receiving") return;
    if (this.receiveTimeout) clearTimeout(this.receiveTimeout);
    this.receiveTimeout = null;
    this.bulkHeaderOnly = false;
    this.phase = "complete";
    this.completeBulkSlot(true);
  }

  applyHeaderToSnapshot(header: ParsedPresetHeader): void {
    if (!this.snapshot) {
      this.snapshot = createEmptySnapshot(header.presetNumber);
    }
    this.snapshot.number = header.presetNumber;
    this.snapshot.numberWire = [...header.numberWire];
    this.snapshot.version = header.version;
    this.snapshot.versionWire = [...header.versionWire];
    this.snapshot.name = header.name;
    this.snapshot.tags = header.tags;
    this.snapshot.stepCount = header.stepCount;
    this.deviceVersionWire = [...header.versionWire];
    this.headerReceived = true;
    const waiters = this.headerWaiters.splice(0);
    for (const w of waiters) w.resolve(header);
  }

  /** Fetch preset header from device (version/name/tags) before save. */
  requestHeaderAndWait(
    presetNumber: number,
    timeoutMs = 1500
  ): Promise<ParsedPresetHeader | null> {
    return new Promise((resolve) => {
      const waiter = { resolve };
      this.headerWaiters.push(waiter);
      this.sendOutput?.(buildRequestPresetHeader(this.sysexId, presetNumber));
      const timer = setTimeout(() => {
        const idx = this.headerWaiters.indexOf(waiter);
        if (idx >= 0) {
          this.headerWaiters.splice(idx, 1);
          resolve(null);
        }
      }, timeoutMs);
      const original = waiter.resolve;
      waiter.resolve = (header) => {
        clearTimeout(timer);
        original(header);
      };
    });
  }

  handleSysex(data: Uint8Array): boolean {
    const header = parsePresetHeader(data, this.sysexId) ?? parsePresetHeader(data);
    if (header) {
      if (this.phase === "sending" || this.phase === "awaiting_ack") {
        return true;
      }
      this.applyHeaderToSnapshot(header);
      if (this.bulkHeaderOnly && this.phase === "receiving") {
        this.finishHeaderOnlyBulk();
        return true;
      }
      if (this.phase === "idle" && this.expectingPresetData) {
        this.phase = "receiving";
      }
      this.emit(`Received header: ${header.name || "(unnamed)"}`);
      return true;
    }

    const chunk =
      parsePresetData(data, this.sysexId) ?? parsePresetData(data);
    if (chunk && this.snapshot) {
      if (this.phase === "sending" || this.phase === "awaiting_ack") {
        return true;
      }
      const base = chunk.index * PRESET_PARAMS_PER_MESSAGE;
      chunk.values.forEach((v, j) => {
        const offset = base + j;
        if (offset < PRESET_VALUE_COUNT) {
          this.snapshot!.valuesByOffset[offset] = v;
        }
      });
      this.receivedData.add(chunk.index);
      if (isPresetDataComplete(this.receivedData) && this.phase === "receiving") {
        this.finishReceiving();
      } else {
        this.emit(
          `Preset data ${this.receivedData.size}/${PRESET_DATA_MESSAGE_COUNT} (chunk ${chunk.index + 1})`
        );
      }
      return true;
    }
    return false;
  }

  private finishReceiving(): void {
    if (!this.snapshot || this.phase !== "receiving") return;
    if (this.receiveTimeout) clearTimeout(this.receiveTimeout);
    this.receiveTimeout = null;
    this.expectingPresetData = false;
    this.bulkHeaderOnly = false;
    this.phase = "complete";
    const msg = `Preset ${this.snapshot.number} loaded (${this.snapshot.name || "unnamed"})`;
    this.emit(msg);
    if (this.bulkMode === "load-full") {
      this.completeBulkSlot(false);
    }
  }

  handleNotification(code: NotificationCode): void {
    if (code === 1) {
      if (this.awaitingPaceAck && this.phase === "sending") {
        this.onSavePaceAck();
        return;
      }
      if (this.phase === "awaiting_ack" && this.snapshot) {
        this.finishSave();
        return;
      }
      if (
        this.phase === "receiving" &&
        this.snapshot &&
        isPresetDataComplete(this.receivedData)
      ) {
        this.finishReceiving();
      }
      return;
    }
    if (this.phase === "sending" || this.phase === "awaiting_ack") {
      if (this.sendTimer) clearTimeout(this.sendTimer);
      if (this.ackTimeout) clearTimeout(this.ackTimeout);
      this.sendQueue = [];
      this.phase = "idle";
      this.emit(NOTIFICATION_LABELS[code] ?? `Error ${code}`);
      if (this.bulkMode === "send-all") {
        this.scheduleNextBulkJob();
      }
    }
    if (
      code === 2 &&
      this.bulkMode &&
      (this.phase === "receiving" || this.bulkHeaderOnly)
    ) {
      this.emit(`Slot ${this.snapshot?.number ?? "?"}: empty (skipped)`);
      if (this.receiveTimeout) clearTimeout(this.receiveTimeout);
      this.bulkHeaderOnly = false;
      this.phase = "idle";
      this.scheduleNextBulkJob();
    }
  }

  savePreset(snapshot: PresetSnapshot): void {
    if (snapshot.number < 1) {
      this.emit("Cannot save to slot 0 — choose a user preset (1–275) or favorite (276–300).");
      return;
    }
    this.clearSendTimers();
    this.expectingPresetData = false;
    const snap: PresetSnapshot = {
      ...snapshot,
      valuesByOffset: [...snapshot.valuesByOffset],
      versionWire: snapshot.versionWire?.length
        ? [...snapshot.versionWire]
        : [...this.deviceVersionWire],
      numberWire: snapshot.numberWire ?? (pack14(snapshot.number) as [number, number]),
      version: snapshot.version,
      stepCount: Math.max(1, snapshot.stepCount || 1),
      name: snapshot.name || "",
    };
    this.snapshot = snap;
    this.phase = "sending";
    this.savePacketTotal = 1 + PRESET_DATA_MESSAGE_COUNT;
    this.savePacketsSent = 0;
    this.sendQueue = [
      buildPresetHeader(this.sysexId, snap),
      ...Array.from({ length: PRESET_DATA_MESSAGE_COUNT }, (_, i) =>
        buildPresetData(this.sysexId, i, snap.valuesByOffset)
      ),
    ];
    this.emit(`Saving preset ${snap.number} to device…`);
    this.ackTimeout = setTimeout(() => {
      if (this.phase === "sending" || this.phase === "awaiting_ack") {
        this.clearSendTimers();
        this.sendQueue = [];
        this.phase = "idle";
        this.emit(
          "Save timed out — check MIDI input and SysEx ID. Try Load, then Save again."
        );
      }
    }, PresetTransferService.SAVE_TOTAL_MS);
    this.sendNextSaveMessage();
  }

  private onSavePaceAck(): void {
    if (this.sendTimer) clearTimeout(this.sendTimer);
    this.sendTimer = null;
    this.awaitingPaceAck = false;
    if (this.sendQueue.length > 0) {
      this.sendNextSaveMessage();
      return;
    }
    if (this.phase === "awaiting_ack") {
      this.finishSave();
    }
  }

  private finishSave(): void {
    if (!this.snapshot) return;
    this.clearSendTimers();
    this.sendQueue = [];
    this.phase = "complete";
    this.emit(
      `Preset ${this.snapshot.number} saved to device (${this.snapshot.name || "unnamed"})`
    );
    if (this.bulkMode === "send-all") {
      this.completeBulkSlot(false);
    }
  }

  /** Send one SysEx packet; wait for device ack (or short fallback) before the next. */
  private sendNextSaveMessage(): void {
    if (!this.sendOutput) {
      this.failSave("MIDI output not connected — reconnect and try Save again.");
      return;
    }
    if (this.sendTimer) clearTimeout(this.sendTimer);
    this.sendTimer = null;

    if (this.sendQueue.length === 0) {
      if (this.phase !== "awaiting_ack") {
        this.phase = "awaiting_ack";
        this.emit("Waiting for device confirmation…");
      }
      return;
    }

    const msg = this.sendQueue.shift()!;
    if (!this.sendPresetBytes(msg)) {
      return;
    }

    this.savePacketsSent += 1;
    this.awaitingPaceAck = true;
    const slot = this.snapshot?.number ?? "?";
    this.emit(
      `Saving preset ${slot} to device… (${this.savePacketsSent}/${this.savePacketTotal})`
    );

    if (this.sendQueue.length === 0) {
      this.phase = "awaiting_ack";
      this.emit(`Saving preset ${slot} — waiting for device…`);
      return;
    }

    this.phase = "sending";
    this.sendTimer = setTimeout(() => {
      if (!this.awaitingPaceAck) return;
      this.awaitingPaceAck = false;
      this.sendNextSaveMessage();
    }, PresetTransferService.PACE_FALLBACK_MS);
  }

  private failSave(message: string): void {
    this.clearSendTimers();
    this.sendQueue = [];
    this.phase = "idle";
    this.emit(message);
    if (this.bulkMode === "send-all") {
      this.bulkMode = null;
      this.bulkQueue = [];
    }
  }

  private sendPresetBytes(msg: Uint8Array): boolean {
    if (!this.sendOutput) return false;
    if (!isValidSysexMessage(msg)) {
      this.failSave(
        "Preset SysEx encoding error (invalid byte >127) — try Load from device again."
      );
      return false;
    }
    return this.sendOutput(msg);
  }

  reset(): void {
    this.clearSendTimers();
    if (this.receiveTimeout) clearTimeout(this.receiveTimeout);
    this.receiveTimeout = null;
    this.phase = "idle";
    this.snapshot = null;
    this.receivedData.clear();
    this.headerReceived = false;
    this.expectingPresetData = false;
    this.sendQueue = [];
    this.emit("Idle");
  }
}

export const presetTransferService = new PresetTransferService();
