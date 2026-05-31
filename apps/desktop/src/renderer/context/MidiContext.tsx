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
  savePresetToDevice: () => void;
  presetStatus: string;
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
    return presetTransferService.onState(({ phase, snapshot, status, headerReceived }) => {
      setPresetStatus(status);
      if (snapshot?.name) {
        setPresetName(snapshot.name);
      }
      if (
        snapshot &&
        snapshot.number >= 1 &&
        snapshot.number <= 300 &&
        (headerReceived || phase === "complete")
      ) {
        setPresetSlot(snapshot.number);
      }
      if (phase === "complete" && snapshot) {
        loadedSnapshotRef.current = cloneSnapshot(snapshot);
        setHasLoadedSnapshot(true);
        midiParameterService.applySnapshotValues(snapshotToLiveValues(snapshot));
        workspaceStore.upsert(snapshot, false);
        setWorkspaceTick((t) => t + 1);
        setTick((t) => t + 1);
      }
    });
  }, []);

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
    const files = entries.map((e) => ({
      name: `preset-${e.slot}.vltpreset.json`,
      content: snapshotToJson(e.snapshot),
    }));
    const dir = await window.presetLibrary.backupWorkspace(files);
    setLibraryStatus(`Backed up to ${dir}`);
    await refreshBackups();
  }, [refreshBackups]);

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
      midiParameterService.getValuesMap()
    );
    presetTransferService.savePreset(merged);
    setPresetStatus(`Sending preset ${merged.number}…`);
  }, [selectedWorkspaceSlot]);

  const workspace = useMemo(
    () => workspaceStore.list(),
    [workspaceTick, tick]
  );

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
      savePresetToDevice,
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
      exportSelectedPreset,
      importPresetFile,
      sendWorkspaceToDevice,
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
      savePresetToDevice,
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
      exportSelectedPreset,
      importPresetFile,
      sendWorkspaceToDevice,
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
