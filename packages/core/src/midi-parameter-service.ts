import {
  buildEditorMode,
  buildRequestActivatedPresetInfo,
  buildRequestParameter,
  buildSetParameter,
  createSysexAssembler,
  isValidSysexMessage,
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
  /** Last value sent (or queued) from user setParameter — stale device echoes are ignored. */
  private userOutbound = new Map<number, number>();
  private lastSendError: string | null = null;
  private assembler = createSysexAssembler((bytes) => this.handleSysex(bytes));
  private activePresetWaiters: Array<{
    resolve: (info: ActivatedPresetInfo | null) => void;
  }> = [];

  constructor() {
    presetTransferService.setSendHandler(
      (bytes) => this.send(bytes),
      () => this.getLastSendError()
    );
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
    this.userOutbound.delete(id);
    this.send(buildRequestParameter(this.sysexId, id));
  }

  requestParameters(ids: number[], gapMs = 8): void {
    ids.forEach((id, i) => {
      setTimeout(() => this.requestParameter(id), i * gapMs);
    });
  }

  setParameter(id: number, value: number, immediate = false): void {
    const def = getParameter(id);
    if (!def) {
      // #region agent log
      if (id === 201) fetch('http://127.0.0.1:7637/ingest/f53347c8-0c3a-47a5-abd9-6ed4f8b31484',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5b1531'},body:JSON.stringify({sessionId:'5b1531',location:'midi-parameter-service.ts:setParameter',message:'setParameter missing def',data:{id,value},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      return;
    }
    const clamped = Math.round(
      Math.max(def.min, Math.min(def.max, value))
    );
    this.values.set(id, clamped);
    // #region agent log
    if (id === 201) fetch('http://127.0.0.1:7637/ingest/f53347c8-0c3a-47a5-abd9-6ed4f8b31484',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5b1531'},body:JSON.stringify({sessionId:'5b1531',location:'midi-parameter-service.ts:setParameter',message:'local set',data:{requested:value,clamped,immediate},timestamp:Date.now(),hypothesisId:'H4',runId:'post-fix'})}).catch(()=>{});
    // #endregion

    const existing = this.debounceTimers.get(id);
    if (existing) clearTimeout(existing);

    const send = () => {
      this.userOutbound.set(id, clamped);
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
    const outbound = this.userOutbound.get(id);
    if (outbound !== undefined && clamped !== outbound) {
      // #region agent log
      if (id === 201) fetch('http://127.0.0.1:7637/ingest/f53347c8-0c3a-47a5-abd9-6ed4f8b31484',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5b1531'},body:JSON.stringify({sessionId:'5b1531',location:'midi-parameter-service.ts:applyRemoteValue',message:'ignored stale echo',data:{requested:value,clamped,outbound,local:this.values.get(id)},timestamp:Date.now(),hypothesisId:'H1',runId:'post-fix'})}).catch(()=>{});
      // #endregion
      return;
    }
    if (outbound !== undefined && clamped === outbound) {
      this.userOutbound.delete(id);
    }
    this.values.set(id, clamped);
    // #region agent log
    if (id === 201) fetch('http://127.0.0.1:7637/ingest/f53347c8-0c3a-47a5-abd9-6ed4f8b31484',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5b1531'},body:JSON.stringify({sessionId:'5b1531',location:'midi-parameter-service.ts:applyRemoteValue',message:'remote overwrite',data:{requested:value,clamped,prev:this.values.get(id)},timestamp:Date.now(),hypothesisId:'H1',runId:'post-fix'})}).catch(()=>{});
    // #endregion
    for (const l of this.listeners) l(id, clamped);
  }

  applySnapshotValues(pairs: { id: number; value: number }[]): void {
    const p201 = pairs.find((p) => p.id === 201);
    // #region agent log
    if (p201) fetch('http://127.0.0.1:7637/ingest/f53347c8-0c3a-47a5-abd9-6ed4f8b31484',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5b1531'},body:JSON.stringify({sessionId:'5b1531',location:'midi-parameter-service.ts:applySnapshotValues',message:'snapshot apply id201',data:{value:p201.value,pairCount:pairs.length},timestamp:Date.now(),hypothesisId:'H3',runId:'post-fix'})}).catch(()=>{});
    // #endregion
    for (const { id, value } of pairs) {
      const def = getParameter(id);
      if (!def) continue;
      const clamped = Math.round(
        Math.max(def.min, Math.min(def.max, value))
      );
      this.values.set(id, clamped);
      this.userOutbound.set(id, clamped);
      for (const l of this.listeners) l(id, clamped);
    }
  }

  enableEditorMode(): void {
    this.send(buildEditorMode(this.sysexId, 1));
  }

  hasOutput(): boolean {
    return this.output != null;
  }

  getLastSendError(): string | null {
    return this.lastSendError;
  }

  /** Values map merged with user outbound pins (editor truth during save). */
  getEffectiveValuesMap(): Map<number, number> {
    const merged = new Map(this.values);
    for (const [id, value] of this.userOutbound) {
      merged.set(id, value);
    }
    return merged;
  }

  /** Flush debounced sends immediately (do not drop pending edits before preset save). */
  flushPendingSendsImmediate(): void {
    for (const [id, timer] of this.debounceTimers.entries()) {
      clearTimeout(timer);
      const v = this.values.get(id);
      if (v === undefined) continue;
      const def = getParameter(id);
      if (!def) continue;
      const clamped = Math.round(Math.max(def.min, Math.min(def.max, v)));
      this.userOutbound.set(id, clamped);
      this.send(buildSetParameter(this.sysexId, id, clamped));
    }
    this.debounceTimers.clear();
  }

  /** Push saved preset values to the device live step (0x22), so audio matches the preset. */
  syncSnapshotToLiveStep(
    pairs: { id: number; value: number }[],
    gapMs = 6
  ): void {
    pairs.forEach(({ id, value }, i) => {
      setTimeout(() => this.setParameter(id, value, true), i * gapMs);
    });
  }

  /** Cancel pending debounced parameter sends before a bulk preset transfer. */
  flushPendingSends(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  /** Send raw SysEx (F0…F7). Returns false if no port or the driver rejects the message. */
  send(bytes: Uint8Array): boolean {
    this.lastSendError = null;
    if (!this.output) {
      this.lastSendError = "No MIDI output port";
      return false;
    }
    if (!isValidSysexMessage(bytes)) {
      const bad = Array.from(bytes).findIndex((b, i) => i > 0 && i < bytes.length - 1 && b > 127);
      this.lastSendError =
        bad >= 0
          ? `Invalid SysEx data byte ${bytes[bad]} at position ${bad} (must be 0–127)`
          : "Invalid SysEx message";
      console.error(this.lastSendError, bytes);
      return false;
    }
    const data = Array.from(bytes);
    try {
      this.output.send(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastSendError = msg;
      console.error("MIDI SysEx send failed:", err);
      try {
        this.output.send(new Uint8Array(bytes));
      } catch (err2) {
        const msg2 = err2 instanceof Error ? err2.message : String(err2);
        this.lastSendError = msg2;
        console.error("MIDI SysEx send retry failed:", err2);
        return false;
      }
    }
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    for (const l of this.debugListeners) l("out", hex);
    return true;
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
