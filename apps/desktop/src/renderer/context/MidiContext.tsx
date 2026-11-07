import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  midiParameterService,
  presetTransferService,
  NOTIFICATION_LABELS,
  getParametersForGroup,
  searchParameters,
  parameterGroups,
  PresetWorkspace,
  mergeLiveValuesIntoSnapshot,
  cloneSnapshot,
  buildSnapshotFromLiveValues,
  canSaveToPresetSlot,
  pack14,
  snapshotToLiveValues,
  snapshotToJson,
  snapshotFromJson,
  importSyx,
  normalizePresetName,
  allLibrarySlots,
  backupSlotFilter,
  exportSnapshotSyx,
  type BackupScope,
  type BulkProgress,
  workspaceToJson,
  workspaceFromJson,
  formatBackupId,
  slotDisplayLabel,
  type ParameterScope,
  type PresetSnapshot,
  liveOnlyParameterIds,
} from "@vlt/core";
import { useMidiConnection } from "../hooks/useMidiConnection.js";
import type { BackupInfo } from "../../preload/index.js";

export type SyncStage = "headers" | "full" | null;
export type ExportFormat = "json" | "syx";

const AUTO_BACKUP_KEY = "vlt.autoBackup";

function readAutoBackupPref(): boolean {
  try {
    return localStorage.getItem(AUTO_BACKUP_KEY) !== "0";
  } catch {
    return true;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

interface MidiContextValue {
  conn: ReturnType<typeof useMidiConnection>;
  scope: ParameterScope;
  setScope: (s: ParameterScope) => void;
  activeGroup: string;
  setActiveGroup: (g: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  getValue: (id: number) => number;
  setValue: (id: number, value: number) => void;
  refreshGroup: () => void;
  refreshSearch: () => void;
  presetSlot: number;
  setPresetSlot: (n: number) => void;
  presetName: string;
  setPresetName: (n: string) => void;
  loadPresetFromDevice: () => void;
  loadAllFromDevice: () => void;
  syncFromDevice: () => void;
  cancelBulkTransfer: () => void;
  bulkActive: boolean;
  bulkProgress: BulkProgress;
  syncStage: SyncStage;
  autoBackup: boolean;
  setAutoBackup: (v: boolean) => void;
  selectedSlots: number[];
  setSelectedSlots: (slots: number[]) => void;
  editWorkspaceSlot: (slot: number) => void;
  readBackupPresets: (backupId: string) => Promise<PresetSnapshot[]>;
  copyBackupPresetToWorkspace: (backupId: string, from: number, to: number) => Promise<void>;
  renameBackup: (backupId: string, label: string) => Promise<void>;
  deleteBackup: (backupId: string) => Promise<void>;
  savePresetToDevice: () => void;
  presetStatus: string;
  slotOptions: { value: number; label: string }[];
  hasLoadedSnapshot: boolean;
  showDebug: boolean;
  setShowDebug: (v: boolean) => void;
  lastIn: string | null;
  lastOut: string | null;
  visibleParameters: ReturnType<typeof getParametersForGroup>;
  groups: typeof parameterGroups;
  workspace: ReturnType<PresetWorkspace["list"]>;
  backups: BackupInfo[];
  libraryStatus: string;
  selectedWorkspaceSlot: number | null;
  setSelectedWorkspaceSlot: (n: number | null) => void;
  backupWorkspace: (scope?: BackupScope, label?: string) => Promise<void>;
  exportPresets: (slots: number[], format: ExportFormat) => void;
  importPresetFile: () => void;
  sendAllToDevice: () => void;
  copyWorkspacePreset: (from: number, to: number) => void;
  swapWorkspacePresets: (a: number, b: number) => void;
  refreshBackups: () => void;
  restoreWorkspaceFromBackup: (backupId: string) => Promise<void>;
  mainView: "editor" | "library";
  setMainView: (v: "editor" | "library") => void;
}

const MidiContext = createContext<MidiContextValue | null>(null);
const workspaceStore = new PresetWorkspace();

export function MidiProvider({ children }: { children: ReactNode }) {
  const conn = useMidiConnection();
  const [scope, setScope] = useState<ParameterScope>("preset");
  const [activeGroup, setActiveGroup] = useState("Mixer");
  const [searchQuery, setSearchQuery] = useState("");
  const [tick, setTick] = useState(0);
  const [showDebug, setShowDebug] = useState(false);
  const [lastIn, setLastIn] = useState<string | null>(null);
  const [lastOut, setLastOut] = useState<string | null>(null);
  const [presetStatus, setPresetStatus] = useState("");
  const [presetSlot, setPresetSlot] = useState(0);
  const [presetName, setPresetName] = useState("");
  const [hasLoadedSnapshot, setHasLoadedSnapshot] = useState(false);
  const [workspaceTick, setWorkspaceTick] = useState(0);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [libraryStatus, setLibraryStatus] = useState("");
  const [selectedWorkspaceSlot, setSelectedWorkspaceSlot] = useState<number | null>(null);
  const [mainView, setMainView] = useState<"editor" | "library">("editor");
  const [bulkActive, setBulkActive] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<BulkProgress>(
    presetTransferService.getBulkProgress()
  );
  const [syncStage, setSyncStageState] = useState<SyncStage>(null);
  const [autoBackup, setAutoBackupState] = useState(readAutoBackupPref);
  const [selectedSlots, setSelectedSlots] = useState<number[]>([]);
  const syncStageRef = useRef<SyncStage>(null);
  const resumeFullRef = useRef(false);
  const autoBackupRef = useRef(autoBackup);
  const backupRef = useRef<(scope?: BackupScope, label?: string) => Promise<void>>(
    async () => {}
  );
  const startFullLoadRef = useRef<() => void>(() => {});
  const loadedSnapshotRef = useRef<PresetSnapshot | null>(null);
  const lastLivePushRef = useRef(0);
  const lastPolledPresetRef = useRef<number | null>(null);
  const presetPollBusyRef = useRef(false);

  const setSyncStage = useCallback((stage: SyncStage) => {
    syncStageRef.current = stage;
    setSyncStageState(stage);
  }, []);

  const setAutoBackup = useCallback((v: boolean) => {
    autoBackupRef.current = v;
    setAutoBackupState(v);
    try {
      localStorage.setItem(AUTO_BACKUP_KEY, v ? "1" : "0");
    } catch {
      // preference just won't persist
    }
  }, []);

  const pushSnapshotToDeviceLive = useCallback(
    (snapshot: PresetSnapshot, reason: "save" | "load" | "active-preset") => {
      const pairs = snapshotToLiveValues(snapshot);
      midiParameterService.applySnapshotValues(pairs);
      midiParameterService.syncSnapshotToLiveStep(pairs);
      lastLivePushRef.current = Date.now();
    },
    []
  );

  useEffect(() => {
    midiParameterService.setOutput(conn.output);
    midiParameterService.setSysexId(conn.sysexId);
  }, [conn.output, conn.sysexId]);

  useEffect(() => {
    if (!conn.connected) return;
    const unsub = midiParameterService.onParameter(() => setTick((t) => t + 1));
    return unsub;
  }, [conn.connected]);

  useEffect(() => {
    const unsub = midiParameterService.onSysexDebug((dir, hex) => {
      if (dir === "in") setLastIn(hex);
      else setLastOut(hex);
    });
    return unsub;
  }, []);

  useEffect(() => {
    return presetTransferService.onBulkSlot((snap, partial) => {
      const existing = workspaceStore.get(snap.number);
      const sending = presetTransferService.getBulkProgress().mode === "send-all";
      // Sync must not clobber local edits or downgrade full data to names only.
      const keep = !sending && existing && (existing.dirty || (partial && !existing.partial));
      if (!keep) workspaceStore.upsert(snap, false, partial);
      setWorkspaceTick((t) => t + 1);
    });
  }, []);

  useEffect(() => {
    return presetTransferService.onState(({ phase, snapshot, status, headerReceived }) => {
      setPresetStatus(status);
      const bulk = presetTransferService.getBulkProgress().active;
      setBulkActive(bulk);
      setBulkProgress(presetTransferService.getBulkProgress());
      if (snapshot?.name && (!bulk || snapshot.number === presetSlot)) {
        setPresetName(snapshot.name);
      }
      if (
        !bulk &&
        snapshot &&
        snapshot.number >= 1 &&
        snapshot.number <= 300 &&
        (headerReceived || phase === "complete")
      ) {
        setPresetSlot(snapshot.number);
      }
      if (phase === "complete" && snapshot) {
        const savedToDevice =
          !bulk && status.includes("saved to device");
        if (!bulk) workspaceStore.upsert(snapshot, false);
        setWorkspaceTick((t) => t + 1);
        if (!bulk) {
          loadedSnapshotRef.current = cloneSnapshot(snapshot);
          setHasLoadedSnapshot(true);
          // Loading only reads: the device already holds these values. Pushing them back
          // turned any decode mistake into a change on the device (e.g. muted levels).
          if (savedToDevice) {
            pushSnapshotToDeviceLive(snapshot, "save");
          } else {
            // Not in the preset dump (e.g. HardTune's active key): ask the unit directly.
            midiParameterService.requestParameters(liveOnlyParameterIds, 8);
            midiParameterService.applySnapshotValues(
              snapshotToLiveValues(snapshot)
            );
          }
          setTick((t) => t + 1);
        } else if (snapshot.number === presetSlot) {
          loadedSnapshotRef.current = cloneSnapshot(snapshot);
          setHasLoadedSnapshot(true);
          midiParameterService.applySnapshotValues(snapshotToLiveValues(snapshot));
          setTick((t) => t + 1);
        }
      }
      if (bulk && status.includes("cancelled")) {
        setBulkActive(false);
        setLibraryStatus(status);
      }
      if (!bulk && status.startsWith("Load all complete")) {
        setLibraryStatus(status);
        const stage = syncStageRef.current;
        if (stage === "headers") {
          setTimeout(() => startFullLoadRef.current(), 0);
        } else if (stage === "full") {
          setSyncStage(null);
          if (autoBackupRef.current) {
            void backupRef.current("user", "Auto-backup after sync");
          }
        }
      }
      if (
        !bulk &&
        resumeFullRef.current &&
        phase === "complete" &&
        snapshot &&
        status.includes("loaded")
      ) {
        resumeFullRef.current = false;
        setTimeout(() => startFullLoadRef.current(), 0);
      }
    });
  }, [presetSlot, pushSnapshotToDeviceLive]);

  useEffect(() => {
    if (!conn.connected) return;
    return midiParameterService.onNotification((code) => {
      if (code === 4) {
        const [a, b] = presetTransferService.getDeviceVersionWire();
        setPresetStatus(
          `Incompatible preset version (device expects wire bytes ${a}, ${b}). Load the preset from the device, then Save.`
        );
        return;
      }
      if (code !== 1) {
        setPresetStatus(NOTIFICATION_LABELS[code] ?? `Notification ${code}`);
      }
    });
  }, [conn.connected]);

  const visibleParameters = useMemo(() => {
    if (searchQuery.trim()) {
      return searchParameters(searchQuery, scope);
    }
    return getParametersForGroup(activeGroup, scope);
  }, [searchQuery, activeGroup, scope, tick]);

  const getValue = useCallback(
    (id: number) => midiParameterService.getValueOrDefault(id),
    [tick]
  );

  const setValue = useCallback((id: number, value: number) => {
    midiParameterService.setParameter(id, value);
    if (loadedSnapshotRef.current) {
      workspaceStore.markDirty(loadedSnapshotRef.current.number, true);
      setWorkspaceTick((t) => t + 1);
    }
    setTick((t) => t + 1);
  }, []);

  const refreshGroup = useCallback(() => {
    if (!conn.connected) return;
    const params = getParametersForGroup(activeGroup, scope);
    midiParameterService.requestParameters(
      params.map((p) => p.id),
      8
    );
  }, [conn.connected, activeGroup, scope]);

  const refreshSearch = useCallback(() => {
    if (!conn.connected || !searchQuery.trim()) return;
    const params = searchParameters(searchQuery, scope);
    midiParameterService.requestParameters(
      params.map((p) => p.id),
      8
    );
  }, [conn.connected, searchQuery, scope]);

  const loadPresetFromDevice = useCallback(async () => {
    if (!conn.connected) return;
    if (presetTransferService.getPhase() === "receiving") {
      presetTransferService.cancelReceive();
    }
    setHasLoadedSnapshot(false);
    loadedSnapshotRef.current = null;
    midiParameterService.enableEditorMode();
    let loadSlot = 0;
    if (presetSlot >= 1 && presetSlot <= 300) {
      loadSlot = presetSlot;
      setPresetStatus(`Loading preset ${loadSlot}…`);
    } else {
      setPresetStatus("Reading active preset on device…");
      const active = await midiParameterService.requestActivePresetRobust();
      if (active && active.presetNumber >= 1 && active.presetNumber <= 300) {
        loadSlot = active.presetNumber;
        setPresetSlot(active.presetNumber);
        setPresetStatus(
          `Device on preset ${active.presetNumber} (step ${active.step + 1}) — loading…`
        );
      } else {
        setPresetSlot(0);
        setPresetStatus("Live step — loading current edit…");
      }
    }
    presetTransferService.requestPreset(loadSlot);
  }, [conn.connected, presetSlot]);

  const startFullLoad = useCallback(() => {
    const slots = allLibrarySlots().filter(
      (slot) => workspaceStore.get(slot)?.partial
    );
    if (slots.length === 0) {
      // Nothing left to fetch: treat as a finished sync.
      const wasFull = syncStageRef.current === "full";
      setSyncStage(null);
      setLibraryStatus("Load all complete — workspace ready to edit.");
      if (wasFull && autoBackupRef.current) void backupRef.current("user", "Auto-backup after sync");
      return;
    }
    setSyncStage("full");
    presetTransferService.startBulkLoadFull(slots);
  }, [setSyncStage]);
  startFullLoadRef.current = startFullLoad;

  /** Pull every preset from the device: names first, then full data in the background. */
  const syncFromDevice = useCallback(() => {
    if (!conn.connected) return;
    const dirty = workspaceStore.listDirty();
    if (
      dirty.length > 0 &&
      !window.confirm(
        `${dirty.length} preset(s) have changes that were not applied to the device. Syncing will discard them. To keep them, choose Cancel and use Apply or Backup first.`
      )
    ) {
      return;
    }
    if (presetTransferService.getPhase() === "receiving") {
      presetTransferService.cancelReceive();
    }
    resumeFullRef.current = false;
    workspaceStore.clear();
    setWorkspaceTick((t) => t + 1);
    setHasLoadedSnapshot(false);
    loadedSnapshotRef.current = null;
    midiParameterService.enableEditorMode();
    setSyncStage("headers");
    setLibraryStatus("Syncing presets from device…");
    presetTransferService.startBulkLoadHeaders(allLibrarySlots());
  }, [conn.connected, setSyncStage]);

  const loadAllFromDevice = syncFromDevice;

  const cancelBulkTransfer = useCallback(() => {
    setSyncStage(null);
    resumeFullRef.current = false;
    presetTransferService.cancelBulk();
    setBulkActive(false);
    setLibraryStatus("Bulk transfer cancelled.");
  }, [setSyncStage]);

  // Auto-sync once per connection (VoiceSupport-style): names first, data in the background.
  useEffect(() => {
    if (!conn.connected) {
      if (syncStageRef.current) {
        setSyncStage(null);
        presetTransferService.cancelBulk();
      }
      return;
    }
    setMainView("library");
    if (workspaceStore.list().length > 0) return;
    const id = setTimeout(() => {
      if (presetTransferService.getPhase() !== "idle") return;
      midiParameterService.enableEditorMode();
      setSyncStage("headers");
      setLibraryStatus("Syncing presets from device…");
      presetTransferService.startBulkLoadHeaders(allLibrarySlots());
    }, 600);
    return () => clearTimeout(id);
  }, [conn.connected, setSyncStage]);

  useEffect(() => {
    if (!conn.connected) return;
    let cancelled = false;
    const pollActivePreset = async () => {
      if (cancelled || presetPollBusyRef.current) return;
      if (presetTransferService.getPhase() !== "idle") return;
      if (presetTransferService.getBulkProgress().active) return;
      if (Date.now() - lastLivePushRef.current < 1800) return;
      presetPollBusyRef.current = true;
      try {
        midiParameterService.enableEditorMode();
        const info = await midiParameterService.requestActivePreset(500);
        if (
          !info ||
          info.presetNumber < 1 ||
          info.presetNumber > 300 ||
          info.presetNumber === lastPolledPresetRef.current
        ) {
          return;
        }
        lastPolledPresetRef.current = info.presetNumber;
        setPresetSlot(info.presetNumber);
        const entry = workspaceStore.get(info.presetNumber);
        if (entry?.snapshot) {
          const snap = cloneSnapshot(entry.snapshot);
          loadedSnapshotRef.current = snap;
          setHasLoadedSnapshot(true);
          setPresetName(entry.name);
          pushSnapshotToDeviceLive(snap, "active-preset");
          setTick((t) => t + 1);
        } else {
          presetTransferService.requestPreset(info.presetNumber);
        }
      } finally {
        presetPollBusyRef.current = false;
      }
    };
    const id = setInterval(() => {
      void pollActivePreset();
    }, 1200);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [conn.connected, pushSnapshotToDeviceLive]);

  const savePresetToDevice = useCallback(async () => {
    if (!conn.connected) return;
    if (!canSaveToPresetSlot(presetSlot)) {
      setPresetStatus(
        "Cannot save to slot 0 (live step). Pick preset 1–275 or favorite 276–300."
      );
      return;
    }
    if (presetTransferService.getPhase() === "receiving") {
      presetTransferService.cancelReceive();
    }
    const savePhase = presetTransferService.getPhase();
    if (savePhase === "sending" || savePhase === "awaiting_ack") {
      presetTransferService.cancelSave();
    }
    if (!midiParameterService.hasOutput()) {
      setPresetStatus("MIDI output not connected — use Connect MIDI first.");
      return;
    }
    midiParameterService.flushPendingSendsImmediate();
    midiParameterService.enableEditorMode();
    await new Promise((r) => setTimeout(r, 80));
    let header: Awaited<
      ReturnType<typeof presetTransferService.requestHeaderAndWait>
    > = null;
    const cached = loadedSnapshotRef.current;
    if (!cached?.versionWire) {
      setPresetStatus(`Reading header for preset ${presetSlot}…`);
      header = await presetTransferService.requestHeaderAndWait(presetSlot);
    }
    const live = midiParameterService.getEffectiveValuesMap();
    const svcSnap = presetTransferService.getSnapshot();
    let base =
      loadedSnapshotRef.current ??
      (svcSnap ? cloneSnapshot(svcSnap) : null);
    if (!base && live.size >= 20) {
      base = buildSnapshotFromLiveValues(presetSlot, presetName, live, {
        versionWire:
          header?.versionWire ??
          svcSnap?.versionWire ??
          presetTransferService.getDeviceVersionWire(),
        tags: header?.tags ?? svcSnap?.tags,
        stepCount: header?.stepCount ?? svcSnap?.stepCount,
      });
    }
    if (!base) {
      setPresetStatus(
        "Load a preset from the device first (wait until loading finishes), then Save."
      );
      return;
    }
    const versionWire: [number, number] = header
      ? [...header.versionWire]
      : base.versionWire ?? presetTransferService.getDeviceVersionWire();
    const numberWire: [number, number] = header?.numberWire
      ? [...header.numberWire]
      : base.numberWire
        ? [...base.numberWire]
        : (pack14(presetSlot) as [number, number]);
    const merged = mergeLiveValuesIntoSnapshot(
      {
        ...base,
        number: presetSlot,
        name: normalizePresetName(presetName),
        versionWire,
        version: header?.version ?? base.version,
        numberWire,
        tags: header?.tags ?? base.tags,
        stepCount: header?.stepCount ?? base.stepCount,
      },
      live
    );
    if (!presetTransferService.savePreset(merged)) {
      return;
    }
    workspaceStore.upsert(merged, false);
    loadedSnapshotRef.current = cloneSnapshot(merged);
    setHasLoadedSnapshot(true);
    setWorkspaceTick((t) => t + 1);
  }, [conn.connected, presetSlot, presetName]);

  useEffect(() => {
    if (conn.connected && !searchQuery) refreshGroup();
  }, [conn.connected, activeGroup, scope]);

  const refreshBackups = useCallback(async () => {
    if (!window.presetLibrary) return;
    await window.presetLibrary.ensureDirs();
    setBackups(await window.presetLibrary.listBackups());
  }, []);

  useEffect(() => {
    void refreshBackups();
  }, [refreshBackups]);

  const backupWorkspace = useCallback(
    async (scope: BackupScope = "all", label?: string) => {
      if (!window.presetLibrary) return;
      const include = backupSlotFilter(scope, new Set(selectedSlots));
      const all = workspaceStore.list().filter((e) => include(e.slot));
      const entries = all.filter((e) => !e.partial);
      if (entries.length === 0) {
        setLibraryStatus(
          all.length > 0
            ? "Presets are still loading — try again when the sync finishes."
            : "Nothing to back up — sync from the device first."
        );
        return;
      }
      const scopeName = { user: "User", selected: "Selected", all: "All" }[scope];
      const name = label ?? `Backup ${scopeName} · ${formatBackupId()}`;
      const files = [
        {
          name: "workspace.json",
          content: workspaceToJson(
            entries.map((e) => e.snapshot),
            name
          ),
        },
        ...entries.map((e) => ({
          name: `preset-${e.slot}.vltpreset.json`,
          content: snapshotToJson(e.snapshot),
        })),
      ];
      await window.presetLibrary.backupWorkspace(files, {
        label: name,
        count: entries.length,
      });
      const skipped = all.length - entries.length;
      setLibraryStatus(
        `${name} (${entries.length} presets${skipped ? `, ${skipped} still loading skipped` : ""})`
      );
      await refreshBackups();
    },
    [refreshBackups, selectedSlots]
  );
  backupRef.current = backupWorkspace;

  const readBackupPresets = useCallback(async (backupId: string) => {
    const text = await window.presetLibrary.readBackupFile(backupId, "workspace.json");
    return workspaceFromJson(text).presets;
  }, []);

  /** Restore merges into Working Data and marks presets as changed; Apply writes them to the device. */
  const restoreWorkspaceFromBackup = useCallback(
    async (backupId: string) => {
      if (!window.presetLibrary) return;
      const hasChanges = workspaceStore.list().length > 0;
      const ok =
        !hasChanges ||
        window.confirm(
          `Restore “${backupId}” into Working Data? Matching slots are replaced and marked as changed; nothing is written to the device until you press Apply. To retain the current data, choose Cancel and make a new backup first.`
        );
      if (!ok) return;
      try {
        const presets = await readBackupPresets(backupId);
        for (const snap of presets) workspaceStore.upsert(snap, true);
        setWorkspaceTick((t) => t + 1);
        setTick((t) => t + 1);
        setLibraryStatus(
          `Restored ${presets.length} presets from ${backupId} — press Apply to send them to the device.`
        );
      } catch (err) {
        setLibraryStatus(
          `Restore failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    },
    [readBackupPresets]
  );

  const copyBackupPresetToWorkspace = useCallback(
    async (backupId: string, from: number, to: number) => {
      const presets = await readBackupPresets(backupId);
      const src = presets.find((p) => p.number === from);
      if (!src) {
        setLibraryStatus(`Preset ${from} is not in that backup.`);
        return;
      }
      const [msb, lsb] = pack14(to);
      const snap = cloneSnapshot(src);
      snap.number = to;
      snap.numberWire = [msb, lsb];
      workspaceStore.upsert(snap, true);
      setWorkspaceTick((t) => t + 1);
      setLibraryStatus(`Copied backup preset ${from} → slot ${to} (not applied yet).`);
    },
    [readBackupPresets]
  );

  const renameBackup = useCallback(
    async (backupId: string, label: string) => {
      await window.presetLibrary.renameBackup(backupId, label);
      await refreshBackups();
    },
    [refreshBackups]
  );

  const deleteBackup = useCallback(
    async (backupId: string) => {
      if (!window.confirm(`Move backup “${backupId}” to the Trash?`)) return;
      await window.presetLibrary.deleteBackup(backupId);
      await refreshBackups();
    },
    [refreshBackups]
  );

  const exportPresets = useCallback(
    async (slots: number[], format: ExportFormat) => {
      if (!window.presetLibrary) return;
      const snaps = slots
        .map((slot) => workspaceStore.get(slot))
        .filter((e) => e && !e.partial)
        .map((e) => e!.snapshot);
      if (snaps.length === 0) {
        setLibraryStatus("Select presets with loaded data to export.");
        return;
      }
      let path: string | null;
      if (format === "syx") {
        const parts = snaps.map((s) => exportSnapshotSyx(conn.sysexId, s));
        const blob = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
        let off = 0;
        for (const p of parts) {
          blob.set(p, off);
          off += p.length;
        }
        path = await window.presetLibrary.saveExportFile(
          snaps.length === 1 ? `preset-${snaps[0].number}.syx` : "presets.syx",
          bytesToBase64(blob),
          true
        );
      } else if (snaps.length === 1) {
        path = await window.presetLibrary.saveExportFile(
          `preset-${snaps[0].number}.vltpreset.json`,
          snapshotToJson(snaps[0]),
          false
        );
      } else {
        path = await window.presetLibrary.saveExportFile(
          "presets.vltpreset.json",
          workspaceToJson(snaps, `Export ${formatBackupId()}`),
          false
        );
      }
      if (path) setLibraryStatus(`Exported ${snaps.length} preset(s) to ${path}`);
    },
    [conn.sysexId]
  );

  const editWorkspaceSlot = useCallback((slot: number) => {
    const entry = workspaceStore.get(slot);
    setPresetSlot(slot);
    setSelectedWorkspaceSlot(slot);
    setMainView("editor");
    if (entry && !entry.partial) {
      const snap = cloneSnapshot(entry.snapshot);
      loadedSnapshotRef.current = snap;
      setHasLoadedSnapshot(true);
      setPresetName(entry.name);
      midiParameterService.applySnapshotValues(snapshotToLiveValues(snap));
      setTick((t) => t + 1);
      return;
    }
    // Names only (or empty): fetch it now, then resume the background sync.
    if (!midiParameterService.hasOutput()) return;
    resumeFullRef.current = syncStageRef.current === "full";
    presetTransferService.cancelBulk();
    setSyncStage(null);
    setHasLoadedSnapshot(false);
    loadedSnapshotRef.current = null;
    midiParameterService.enableEditorMode();
    setPresetStatus(`Loading preset ${slot}…`);
    presetTransferService.requestPreset(slot);
  }, [setSyncStage]);

  const importPresetFile = useCallback(async () => {
    if (!window.presetLibrary) return;
    const file = await window.presetLibrary.openImportFile();
    if (!file) return;
    try {
      let snaps: PresetSnapshot[];
      let what: string;
      if (file.kind === "json") {
        const parsed = JSON.parse(file.text) as { format?: string };
        if (parsed.format === "vlt-workspace") {
          const ws = workspaceFromJson(file.text);
          snaps = ws.presets;
          what = `workspace “${ws.label}”`;
        } else {
          snaps = [snapshotFromJson(file.text)];
          what = "preset";
        }
      } else {
        const raw = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
        snaps = importSyx(raw, conn.sysexId);
        what = "SysEx";
      }
      for (const snap of snaps) workspaceStore.upsert(snap, true);
      setWorkspaceTick((t) => t + 1);
      setLibraryStatus(
        `Imported ${snaps.length} preset(s) from ${what} — press Apply to send them to the device.`
      );
    } catch (err) {
      setLibraryStatus(err instanceof Error ? err.message : "Import failed");
    }
  }, [conn.sysexId]);

  /** Apply: send every changed preset in Working Data to the device. */
  const sendAllToDevice = useCallback(async () => {
    if (!conn.connected) return;
    const dirty = workspaceStore.listDirty().filter((e) => e.slot >= 1);
    const entries = dirty.filter((e) => !e.partial);
    if (dirty.length === 0) {
      setLibraryStatus("No changes to apply.");
      return;
    }
    if (entries.length < dirty.length) {
      setLibraryStatus("Some changed presets are still loading — wait for the sync to finish.");
      return;
    }
    const ok = window.confirm(
      `Apply ${entries.length} changed preset(s) to the device? This overwrites those slots on the unit.${autoBackupRef.current ? " A backup is made first." : ""}`
    );
    if (!ok) return;
    if (autoBackupRef.current) await backupRef.current("all", "Auto-backup before Apply");
    midiParameterService.flushPendingSends();
    midiParameterService.enableEditorMode();
    const snapshots = entries.map((e) => {
      const snap = cloneSnapshot(e.snapshot);
      if (e.slot === presetSlot) {
        return mergeLiveValuesIntoSnapshot(snap, midiParameterService.getValuesMap());
      }
      return snap;
    });
    setLibraryStatus(`Applying ${snapshots.length} presets to device…`);
    presetTransferService.startBulkSendAll(snapshots);
  }, [conn.connected, presetSlot]);

  const copyWorkspacePreset = useCallback((from: number, to: number) => {
    if (workspaceStore.get(from)?.partial) {
      setLibraryStatus(`Preset ${from} is still loading — try again shortly.`);
      return;
    }
    if (!workspaceStore.copySlot(from, to)) {
      setLibraryStatus(`Copy failed — preset ${from} is empty.`);
      return;
    }
    setWorkspaceTick((t) => t + 1);
    setLibraryStatus(`Copied ${from} → ${to} (not applied yet).`);
  }, []);

  const swapWorkspacePresets = useCallback((a: number, b: number) => {
    if (workspaceStore.get(a)?.partial || workspaceStore.get(b)?.partial) {
      setLibraryStatus("A preset is still loading — try again shortly.");
      return;
    }
    if (!workspaceStore.swapSlots(a, b)) {
      setLibraryStatus(`Swap failed — both slots ${a} and ${b} are empty.`);
      return;
    }
    setWorkspaceTick((t) => t + 1);
    setLibraryStatus(`Swapped ${a} ↔ ${b} (not applied yet).`);
  }, []);

  const workspace = useMemo(
    () => workspaceStore.list(),
    [workspaceTick, tick]
  );

  const slotOptions = useMemo(() => {
    const nameFor = (slot: number) => workspaceStore.get(slot)?.name;
    return [
      { value: 0, label: slotDisplayLabel(0, nameFor(0)) },
      ...Array.from({ length: 275 }, (_, i) => {
        const slot = i + 1;
        return { value: slot, label: slotDisplayLabel(slot, nameFor(slot)) };
      }),
      ...Array.from({ length: 25 }, (_, i) => {
        const slot = 276 + i;
        return { value: slot, label: slotDisplayLabel(slot, nameFor(slot)) };
      }),
    ];
  }, [workspaceTick]);

  const value = useMemo(
    () => ({
      conn,
      scope,
      setScope,
      activeGroup,
      setActiveGroup,
      searchQuery,
      setSearchQuery,
      getValue,
      setValue,
      refreshGroup,
      refreshSearch,
      presetSlot,
      setPresetSlot,
      presetName,
      setPresetName,
      loadPresetFromDevice,
      loadAllFromDevice,
      syncFromDevice,
      cancelBulkTransfer,
      bulkActive,
      bulkProgress,
      syncStage,
      autoBackup,
      setAutoBackup,
      selectedSlots,
      setSelectedSlots,
      editWorkspaceSlot,
      readBackupPresets,
      copyBackupPresetToWorkspace,
      renameBackup,
      deleteBackup,
      savePresetToDevice,
      slotOptions,
      presetStatus,
      hasLoadedSnapshot,
      showDebug,
      setShowDebug,
      lastIn,
      lastOut,
      visibleParameters,
      groups: parameterGroups,
      workspace,
      backups,
      libraryStatus,
      selectedWorkspaceSlot,
      setSelectedWorkspaceSlot,
      backupWorkspace,
      exportPresets,
      importPresetFile,
      sendAllToDevice,
      copyWorkspacePreset,
      swapWorkspacePresets,
      refreshBackups,
      restoreWorkspaceFromBackup,
      mainView,
      setMainView,
    }),
    [
      conn,
      scope,
      activeGroup,
      searchQuery,
      getValue,
      setValue,
      refreshGroup,
      refreshSearch,
      presetSlot,
      presetName,
      loadPresetFromDevice,
      loadAllFromDevice,
      syncFromDevice,
      cancelBulkTransfer,
      bulkActive,
      bulkProgress,
      syncStage,
      autoBackup,
      setAutoBackup,
      selectedSlots,
      setSelectedSlots,
      editWorkspaceSlot,
      readBackupPresets,
      copyBackupPresetToWorkspace,
      renameBackup,
      deleteBackup,
      savePresetToDevice,
      slotOptions,
      presetStatus,
      hasLoadedSnapshot,
      showDebug,
      lastIn,
      lastOut,
      visibleParameters,
      workspace,
      backups,
      libraryStatus,
      selectedWorkspaceSlot,
      backupWorkspace,
      exportPresets,
      importPresetFile,
      sendAllToDevice,
      copyWorkspacePreset,
      swapWorkspacePresets,
      refreshBackups,
      restoreWorkspaceFromBackup,
      mainView,
    ]
  );

  return <MidiContext.Provider value={value}>{children}</MidiContext.Provider>;
}

export function useMidiContext(): MidiContextValue {
  const ctx = useContext(MidiContext);
  if (!ctx) throw new Error("useMidiContext requires MidiProvider");
  return ctx;
}
