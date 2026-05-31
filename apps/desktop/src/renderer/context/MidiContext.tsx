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
  allUserPresetSlots,
  workspaceToJson,
  workspaceFromJson,
  formatBackupId,
  slotDisplayLabel,
  type ParameterScope,
  type PresetSnapshot,
} from "@vlt/core";
import { useMidiConnection } from "../hooks/useMidiConnection.js";

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
  cancelBulkTransfer: () => void;
  bulkActive: boolean;
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
  backups: string[];
  libraryStatus: string;
  selectedWorkspaceSlot: number | null;
  setSelectedWorkspaceSlot: (n: number | null) => void;
  backupWorkspace: () => void;
  exportSelectedPreset: () => void;
  importPresetFile: () => void;
  sendWorkspaceToDevice: () => void;
  sendAllToDevice: () => void;
  copyWorkspacePreset: (from: number, to: number) => void;
  swapWorkspacePresets: (a: number, b: number) => void;
  saveSnapshotBackup: () => void;
  refreshBackups: () => void;
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
  const [backups, setBackups] = useState<string[]>([]);
  const [libraryStatus, setLibraryStatus] = useState("");
  const [selectedWorkspaceSlot, setSelectedWorkspaceSlot] = useState<number | null>(null);
  const [mainView, setMainView] = useState<"editor" | "library">("editor");
  const [bulkActive, setBulkActive] = useState(false);
  const loadedSnapshotRef = useRef<PresetSnapshot | null>(null);

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
    return presetTransferService.onBulkSlot((snap) => {
      workspaceStore.upsert(snap, false);
      setWorkspaceTick((t) => t + 1);
    });
  }, []);

  useEffect(() => {
    return presetTransferService.onState(({ phase, snapshot, status, headerReceived }) => {
      setPresetStatus(status);
      const bulk = presetTransferService.getBulkProgress().active;
      setBulkActive(bulk);
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
        workspaceStore.upsert(snapshot, false);
        if (bulk) {
          workspaceStore.markDirty(snapshot.number, false);
        }
        setWorkspaceTick((t) => t + 1);
        if (!bulk) {
          loadedSnapshotRef.current = cloneSnapshot(snapshot);
          setHasLoadedSnapshot(true);
          midiParameterService.applySnapshotValues(snapshotToLiveValues(snapshot));
          setTick((t) => t + 1);
        } else if (snapshot.number === presetSlot) {
          loadedSnapshotRef.current = cloneSnapshot(snapshot);
          setHasLoadedSnapshot(true);
          midiParameterService.applySnapshotValues(snapshotToLiveValues(snapshot));
          setTick((t) => t + 1);
        }
      }
      if (bulk && (status.includes("complete") || status.includes("cancelled"))) {
        setBulkActive(false);
        setLibraryStatus(status);
        if (
          status.includes("Load all complete") &&
          workspaceStore.list().length > 0
        ) {
          const first =
            workspaceStore.get(1) ?? workspaceStore.list()[0];
          if (first) {
            loadedSnapshotRef.current = cloneSnapshot(first.snapshot);
            setHasLoadedSnapshot(true);
            setPresetSlot(first.slot);
            setPresetName(first.name);
            midiParameterService.applySnapshotValues(
              snapshotToLiveValues(first.snapshot)
            );
            setTick((t) => t + 1);
          }
        }
      }
    });
  }, [presetSlot]);

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

  const loadAllFromDevice = useCallback(() => {
    if (!conn.connected) return;
    const ok = window.confirm(
      "Load all 275 user presets from the device (full data)? This takes several minutes and is the recommended first step before editing."
    );
    if (!ok) return;
    if (presetTransferService.getBulkProgress().active) {
      presetTransferService.cancelBulk();
    }
    if (presetTransferService.getPhase() === "receiving") {
      presetTransferService.cancelReceive();
    }
    setHasLoadedSnapshot(false);
    loadedSnapshotRef.current = null;
    midiParameterService.enableEditorMode();
    setPresetStatus("Loading all presets from device…");
    setLibraryStatus("Loading all presets from device…");
    presetTransferService.startBulkLoadFull(allUserPresetSlots());
  }, [conn.connected]);

  const cancelBulkTransfer = useCallback(() => {
    presetTransferService.cancelBulk();
    setBulkActive(false);
    setLibraryStatus("Bulk transfer cancelled.");
  }, []);

  useEffect(() => {
    if (!conn.connected) return;
    return midiParameterService.onActivePreset((info) => {
      if (info.presetNumber >= 1 && info.presetNumber <= 300) {
        setPresetSlot(info.presetNumber);
      }
    });
  }, [conn.connected]);

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
    midiParameterService.flushPendingSends();
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
    const live = midiParameterService.getValuesMap();
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
    const [nMsb, nLsb] = pack14(presetSlot);
    const merged = mergeLiveValuesIntoSnapshot(
      {
        ...base,
        number: presetSlot,
        name: normalizePresetName(presetName),
        versionWire,
        version: header?.version ?? base.version,
        numberWire: [nMsb, nLsb],
        tags: header?.tags ?? base.tags,
        stepCount: header?.stepCount ?? base.stepCount,
      },
      live
    );
    presetTransferService.savePreset(merged);
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
    const list = await window.presetLibrary.listBackups();
    setBackups(list);
  }, []);

  useEffect(() => {
    void refreshBackups();
  }, [refreshBackups]);

  const backupWorkspace = useCallback(async () => {
    if (!window.presetLibrary) return;
    const entries = workspaceStore.list();
    if (entries.length === 0) {
      setLibraryStatus("Workspace is empty — load presets first.");
      return;
    }
    const label = formatBackupId();
    const files = [
      {
        name: "workspace.json",
        content: workspaceToJson(
          entries.map((e) => e.snapshot),
          label
        ),
      },
      ...entries.map((e) => ({
        name: `preset-${e.slot}.vltpreset.json`,
        content: snapshotToJson(e.snapshot),
      })),
    ];
    const dir = await window.presetLibrary.backupWorkspace(files);
    setLibraryStatus(`Snapshot backup: ${label}`);
    await refreshBackups();
  }, [refreshBackups]);

  const saveSnapshotBackup = useCallback(async () => {
    await backupWorkspace();
  }, [backupWorkspace]);

  const exportSelectedPreset = useCallback(async () => {
    if (!window.presetLibrary) return;
    const slot = selectedWorkspaceSlot ?? loadedSnapshotRef.current?.number;
    const entry = slot != null ? workspaceStore.get(slot) : undefined;
    const snap = entry?.snapshot ?? loadedSnapshotRef.current;
    if (!snap) {
      setLibraryStatus("Select a workspace preset or load from device.");
      return;
    }
    const path = await window.presetLibrary.saveExportFile(
      `preset-${snap.number}.vltpreset.json`,
      snapshotToJson(snap),
      false
    );
    if (path) setLibraryStatus(`Exported to ${path}`);
  }, [selectedWorkspaceSlot]);

  const importPresetFile = useCallback(async () => {
    if (!window.presetLibrary) return;
    const file = await window.presetLibrary.openImportFile();
    if (!file) return;
    try {
      if (file.kind === "json") {
        const parsed = JSON.parse(file.text) as { format?: string };
        if (parsed.format === "vlt-workspace") {
          const ws = workspaceFromJson(file.text);
          for (const snap of ws.presets) {
            workspaceStore.upsert(snap, true);
          }
          if (ws.presets[0]) {
            loadedSnapshotRef.current = ws.presets[0];
            setHasLoadedSnapshot(true);
            setPresetName(ws.presets[0].name);
            setPresetSlot(ws.presets[0].number);
            midiParameterService.applySnapshotValues(
              snapshotToLiveValues(ws.presets[0])
            );
          }
          setWorkspaceTick((t) => t + 1);
          setTick((t) => t + 1);
          setLibraryStatus(
            `Imported workspace “${ws.label}” (${ws.presets.length} presets)`
          );
        } else {
          const snap = snapshotFromJson(file.text);
          workspaceStore.upsert(snap, true);
          loadedSnapshotRef.current = snap;
          setHasLoadedSnapshot(true);
          setPresetName(snap.name);
          setPresetSlot(snap.number);
          midiParameterService.applySnapshotValues(snapshotToLiveValues(snap));
          setWorkspaceTick((t) => t + 1);
          setTick((t) => t + 1);
          setLibraryStatus(`Imported preset ${snap.number}`);
        }
      } else {
        const raw = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
        const snaps = importSyx(raw, conn.sysexId);
        for (const s of snaps) workspaceStore.upsert(s, true);
        if (snaps[0]) {
          loadedSnapshotRef.current = snaps[0];
          setHasLoadedSnapshot(true);
          setPresetName(snaps[0].name);
          setPresetSlot(snaps[0].number);
          midiParameterService.applySnapshotValues(snapshotToLiveValues(snaps[0]));
        }
        setWorkspaceTick((t) => t + 1);
        setTick((t) => t + 1);
        setLibraryStatus(`Imported ${snaps.length} preset(s) from SysEx`);
      }
    } catch (err) {
      setLibraryStatus(err instanceof Error ? err.message : "Import failed");
    }
  }, [conn.sysexId]);

  const sendWorkspaceToDevice = useCallback(() => {
    const slot = selectedWorkspaceSlot ?? loadedSnapshotRef.current?.number;
    const entry = slot != null ? workspaceStore.get(slot) : undefined;
    const snap = entry?.snapshot ?? loadedSnapshotRef.current;
    if (!snap) {
      setLibraryStatus("Nothing to send — import or load a preset.");
      return;
    }
    const merged = mergeLiveValuesIntoSnapshot(
      snap,
      slot === presetSlot ? midiParameterService.getValuesMap() : new Map()
    );
    presetTransferService.savePreset(merged);
    setPresetStatus(`Sending preset ${merged.number}…`);
  }, [selectedWorkspaceSlot, presetSlot]);

  const sendAllToDevice = useCallback(() => {
    if (!conn.connected) return;
    const entries = workspaceStore.list().filter((e) => e.slot >= 1);
    if (entries.length === 0) {
      setLibraryStatus("Workspace empty — Load all or import presets first.");
      return;
    }
    const ok = window.confirm(
      `Send ${entries.length} preset(s) from workspace to the device? This overwrites those slots on the unit.`
    );
    if (!ok) return;
    midiParameterService.flushPendingSends();
    midiParameterService.enableEditorMode();
    const snapshots = entries.map((e) => {
      const snap = cloneSnapshot(e.snapshot);
      if (e.slot === presetSlot) {
        return mergeLiveValuesIntoSnapshot(snap, midiParameterService.getValuesMap());
      }
      return snap;
    });
    setLibraryStatus(`Sending ${snapshots.length} presets to device…`);
    presetTransferService.startBulkSendAll(snapshots);
  }, [conn.connected, presetSlot]);

  const copyWorkspacePreset = useCallback((from: number, to: number) => {
    if (!workspaceStore.copySlot(from, to)) {
      setLibraryStatus(`Copy failed — load preset ${from} into workspace first.`);
      return;
    }
    setWorkspaceTick((t) => t + 1);
    setLibraryStatus(`Copied workspace preset ${from} → ${to}`);
  }, []);

  const swapWorkspacePresets = useCallback((a: number, b: number) => {
    if (!workspaceStore.swapSlots(a, b)) {
      setLibraryStatus(`Swap failed — need at least one of slot ${a} or ${b} in workspace.`);
      return;
    }
    setWorkspaceTick((t) => t + 1);
    setLibraryStatus(`Swapped workspace slots ${a} ↔ ${b}`);
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
      cancelBulkTransfer,
      bulkActive,
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
      saveSnapshotBackup,
      exportSelectedPreset,
      importPresetFile,
      sendWorkspaceToDevice,
      sendAllToDevice,
      copyWorkspacePreset,
      swapWorkspacePresets,
      refreshBackups,
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
      cancelBulkTransfer,
      bulkActive,
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
      saveSnapshotBackup,
      exportSelectedPreset,
      importPresetFile,
      sendWorkspaceToDevice,
      sendAllToDevice,
      copyWorkspacePreset,
      swapWorkspacePresets,
      refreshBackups,
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
