import {
  buildEditorMode,
  buildRequestParameter,
  buildSetParameter,
  createSysexAssembler,
  parseParameterResponse,
} from "./sysex.js";
import { parseNotification, type NotificationCode } from "./preset-transfer.js";
import { getParameter } from "./registry.js";

export type ParameterListener = (id: number, value: number) => void;
export type SysexDebugListener = (direction: "in" | "out", hex: string) => void;
export type NotificationListener = (code: NotificationCode) => void;

export class MidiParameterService {
  private output: MIDIOutput | null = null;
  private sysexId = 0;
  private values = new Map<number, number>();
  private listeners = new Set<ParameterListener>();
  private debugListeners = new Set<SysexDebugListener>();
  private notificationListeners = new Set<NotificationListener>();
  private debounceTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private suppressSend = false;
  private assembler = createSysexAssembler((bytes) => this.handleSysex(bytes));

  setOutput(output: MIDIOutput | null): void {
    this.output = output;
  }

  setSysexId(id: number): void {
    this.sysexId = Math.max(0, Math.min(127, Math.round(id)));
  }

  getSysexId(): number {
    return this.sysexId;
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

  enableEditorMode(): void {
    this.send(buildEditorMode(this.sysexId, 1));
  }

  private send(bytes: Uint8Array): void {
    if (!this.output) return;
    this.output.send(bytes);
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    for (const l of this.debugListeners) l("out", hex);
  }

  private handleSysex(bytes: Uint8Array): void {
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    for (const l of this.debugListeners) l("in", hex);

    const notif =
      parseNotification(bytes, this.sysexId) ??
      parseNotification(bytes, 0);
    if (notif) {
      for (const l of this.notificationListeners) l(notif);
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
