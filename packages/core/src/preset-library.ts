import type { PresetSnapshot } from "./preset-snapshot.js";
import {
  cloneSnapshot,
  snapshotFromJson,
  snapshotToJson,
} from "./preset-snapshot.js";
import { pack14 } from "./sysex.js";
import {
  presetMessagesToSyxBlob,
  parseSyxBlob,
} from "./preset-transfer.js";

export interface WorkspaceEntry {
  slot: number;
  name: string;
  dirty: boolean;
  snapshot: PresetSnapshot;
}

export class PresetWorkspace {
  private entries = new Map<number, WorkspaceEntry>();

  list(): WorkspaceEntry[] {
    return [...this.entries.values()].sort((a, b) => a.slot - b.slot);
  }

  get(slot: number): WorkspaceEntry | undefined {
    return this.entries.get(slot);
  }

  upsert(snapshot: PresetSnapshot, dirty = false): WorkspaceEntry {
    const entry: WorkspaceEntry = {
      slot: snapshot.number,
      name: snapshot.name,
      dirty,
      snapshot,
    };
    this.entries.set(snapshot.number, entry);
    return entry;
  }

  markDirty(slot: number, dirty = true): void {
    const e = this.entries.get(slot);
    if (e) e.dirty = dirty;
  }

  remove(slot: number): void {
    this.entries.delete(slot);
  }

  clear(): void {
    this.entries.clear();
  }

  /** Copy preset at `from` to slot `to` (workspace only until sent to device). */
  copySlot(from: number, to: number): boolean {
    const src = this.entries.get(from);
    if (!src) return false;
    const snap = cloneSnapshotForSlot(src.snapshot, to);
    this.upsert(snap, true);
    return true;
  }

  /** Swap two workspace presets (slot numbers in snapshots are updated). */
  swapSlots(a: number, b: number): boolean {
    const ea = this.entries.get(a);
    const eb = this.entries.get(b);
    if (!ea && !eb) return false;
    if (ea && !eb) {
      this.upsert(cloneSnapshotForSlot(ea.snapshot, b), ea.dirty);
      this.remove(a);
      return true;
    }
    if (!ea && eb) {
      this.upsert(cloneSnapshotForSlot(eb.snapshot, a), eb.dirty);
      this.remove(b);
      return true;
    }
    const snapA = cloneSnapshotForSlot(ea!.snapshot, b);
    const snapB = cloneSnapshotForSlot(eb!.snapshot, a);
    this.upsert(snapA, ea!.dirty);
    this.upsert(snapB, eb!.dirty);
    return true;
  }

  listDirty(): WorkspaceEntry[] {
    return this.list().filter((e) => e.dirty);
  }
}

function cloneSnapshotForSlot(
  snapshot: PresetSnapshot,
  slot: number
): PresetSnapshot {
  const [msb, lsb] = pack14(slot);
  const snap = cloneSnapshot(snapshot);
  snap.number = slot;
  snap.numberWire = [msb, lsb];
  return snap;
}

export function exportSnapshotJson(snapshot: PresetSnapshot): string {
  return snapshotToJson(snapshot);
}

export function importSnapshotJson(text: string): PresetSnapshot {
  return snapshotFromJson(text);
}

export function exportSnapshotSyx(
  sysexId: number,
  snapshot: PresetSnapshot
): Uint8Array {
  return presetMessagesToSyxBlob(sysexId, snapshot);
}

export function importSyx(
  data: Uint8Array,
  sysexId = 0
): PresetSnapshot[] {
  return parseSyxBlob(data, sysexId);
}

export function formatBackupId(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

export function favoriteBankLabel(slot: number): string | null {
  if (slot < 276 || slot > 300) return null;
  const bank = Math.floor((slot - 276) / 5);
  const letter = ["A", "B", "C", "D", "E"][bank];
  const pos = ((slot - 276) % 5) + 1;
  return `Favorite ${letter}${pos}`;
}

export function presetSlotLabel(slot: number): string {
  if (slot === 0) return "Live step (0)";
  const fav = favoriteBankLabel(slot);
  if (fav) return `${fav} (${slot})`;
  return `Preset ${slot}`;
}
