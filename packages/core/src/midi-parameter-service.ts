import {
  buildEditorMode,
  buildRequestActivatedPresetInfo,
  buildRequestParameter,
  buildSetParameter,
  createSysexAssembler,
  parseActivatedPresetInfo,
  parseParameterResponse,
  type ActivatedPresetInfo,
} from "./sysex.js";
import {
  parseNotification,
  presetTransferService,
  type NotificationCode,
} from "./preset-transfer.js";
import { getParameter } from "./registry.js";

export type { ActivatedPresetInfo };
export type ParameterListener = (id: number, value: number) => void;
export type SysexDebugListener = (direction: "in" | "out", hex: string) => void;
export type NotificationListener = (code: NotificationCode) => void;
export type ActivePresetListener = (info: ActivatedPresetInfo) => void;

export class MidiParameterService {
  private output: MIDIOutput | null = null;
  private sysexId = 0;
  private values = new Map<number, number>();
  private listeners = new Set<ParameterListener>();
  private debugListeners = new Set<SysexDebugListener>();
  private notificationListeners = new Set<NotificationListener>();
  private activePresetListeners = new Set<ActivePresetListener>();
  private debounceTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private suppressSend = false;
  private assembler = createSysexAssembler((bytes) => this.handleSysex(bytes));
  private activePresetWaiters: Array<{
    resolve: (info: ActivatedPresetInfo | null) => void;
  }> = [];

  constructor() {
    presetTransferService.setSendHandler((bytes) => this.send(bytes));
  }

  setOutput(output: MIDIOutput | null): void {
    this.output = output;
  }

  setSysexId(id: number): void {
    this.sysexId = Math.max(0, Math.min(127, Math.round(id)));
    presetTransferService.setSysexId(this.sysexId);
  }

  getSysexId(): number {
    return this.sysexId;
  }

  getValuesMap(): Map<number, number> {
    return this.values;
  }

  onParameter(listener: ParameterListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onSysexDebug(listener: SysexDebugListener): () => void {
    this.debugListeners.add(listener);
    return () => this.debugListeners.delete(listener);
  }

  onNotification(listener: NotificationListener): () => void {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  onActivePreset(listener: ActivePresetListener): () => void {
    this.activePresetListeners.add(listener);
    return () => this.activePresetListeners.delete(listener);
  }

  /**
   * Ask the device which preset/step is active (Editor Mode 3 → 0x23).
   */
  requestActivePreset(timeoutMs = 800): Promise<ActivatedPresetInfo | null> {
    return new Promise((resolve) => {
      const waiter = { resolve };
      this.activePresetWaiters.push(waiter);
      this.send(buildRequestActivatedPresetInfo(this.sysexId));
      const timer = setTimeout(() => {
        const idx = this.activePresetWaiters.indexOf(waiter);
        if (idx >= 0) {
          this.activePresetWaiters.splice(idx, 1);
          resolve(null);
        }
      }, timeoutMs);
      const original = waiter.resolve;
      waiter.resolve = (info) => {
        clearTimeout(timer);
        original(info);
      };
    });
  }

  /** Editor mode on, then query active preset (retries). */
  async requestActivePresetRobust(): Promise<ActivatedPresetInfo | null> {
    for (let attempt = 0; attempt < 4; attempt++) {
      this.enableEditorMode();
      await new Promise((r) => setTimeout(r, 60 + attempt * 40));
      const info = await this.requestActivePreset(900);
      if (info && info.presetNumber >= 0) return info;
    }
    return null;
  }

  handleMidiMessage(event: MIDIMessageEvent): void {
    const data = event.data;
    if (!data?.length) return;
    this.assembler(new Uint8Array(data));
  }

  getValue(id: number): number | undefined {
    return this.values.get(id);
  }

  getValueOrDefault(id: number): number {
    const v = this.values.get(id);
    if (v !== undefined) return v;
    const def = getParameter(id);
    return def?.centre ?? 0;
  }

  requestParameter(id: number): void {
    this.send(buildRequestParameter(this.sysexId, id));
  }

  requestParameters(ids: number[], gapMs = 8): void {
    ids.forEach((id, i) => {
      setTimeout(() => this.requestParameter(id), i * gapMs);
    });
  }

  setParameter(id: number, value: number, immediate = false): void {
    const def = getParameter(id);
    if (!def) return;
    const clamped = Math.round(
      Math.max(def.min, Math.min(def.max, value))
    );
    this.values.set(id, clamped);

    if (this.suppressSend) return;

    const existing = this.debounceTimers.get(id);
    if (existing) clearTimeout(existing);

    const send = () => {
      this.send(buildSetParameter(this.sysexId, id, clamped));
    };

    if (immediate) send();
    else this.debounceTimers.set(id, setTimeout(send, 30));
  }

  applyRemoteValue(id: number, value: number): void {
    const def = getParameter(id);
    if (!def) return;
    const clamped = Math.round(
      Math.max(def.min, Math.min(def.max, value))
    );
    this.suppressSend = true;
    this.values.set(id, clamped);
    for (const l of this.listeners) l(id, clamped);
    setTimeout(() => {
      this.suppressSend = false;
    }, 150);
  }

  applySnapshotValues(pairs: { id: number; value: number }[]): void {
    this.suppressSend = true;
    for (const { id, value } of pairs) {
      const def = getParameter(id);
      if (!def) continue;
      const clamped = Math.round(
        Math.max(def.min, Math.min(def.max, value))
      );
      this.values.set(id, clamped);
      for (const l of this.listeners) l(id, clamped);
    }
    setTimeout(() => {
      this.suppressSend = false;
    }, 200);
  }

  enableEditorMode(): void {
    this.send(buildEditorMode(this.sysexId, 1));
  }

  send(bytes: Uint8Array): void {
    if (!this.output) return;
    this.output.send(bytes);
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    for (const l of this.debugListeners) l("out", hex);
  }

  private dispatchActivePreset(info: ActivatedPresetInfo): void {
    for (const l of this.activePresetListeners) l(info);
    const waiters = this.activePresetWaiters.splice(0);
    for (const w of waiters) w.resolve(info);
  }

  private handleSysex(bytes: Uint8Array): void {
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    for (const l of this.debugListeners) l("in", hex);

    const notif =
      parseNotification(bytes, this.sysexId) ?? parseNotification(bytes);
    if (notif) {
      presetTransferService.handleNotification(notif);
      for (const l of this.notificationListeners) l(notif);
      return;
    }

    const active =
      parseActivatedPresetInfo(bytes, this.sysexId) ??
      parseActivatedPresetInfo(bytes);
    if (active) {
      this.dispatchActivePreset(active);
      return;
    }

    if (presetTransferService.handleSysex(bytes)) {
      return;
    }

    const parsed =
      parseParameterResponse(bytes, this.sysexId) ??
      parseParameterResponse(bytes);
    if (!parsed) return;
    this.applyRemoteValue(parsed.paramId, parsed.value);
  }
}

export const midiParameterService = new MidiParameterService();
