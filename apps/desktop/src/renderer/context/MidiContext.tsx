import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  midiParameterService,
  buildRequestPreset,
  NOTIFICATION_LABELS,
  getParametersForGroup,
  searchParameters,
  parameterGroups,
  type ParameterScope,
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
  requestLivePreset: () => void;
  presetStatus: string;
  showDebug: boolean;
  setShowDebug: (v: boolean) => void;
  lastIn: string | null;
  lastOut: string | null;
  visibleParameters: ReturnType<typeof getParametersForGroup>;
  groups: typeof parameterGroups;
}

const MidiContext = createContext<MidiContextValue | null>(null);

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

  const requestLivePreset = useCallback(() => {
    if (!conn.output) return;
    setPresetStatus("Requesting live preset (0)…");
    conn.output.send(buildRequestPreset(conn.sysexId, 0));
  }, [conn.output, conn.sysexId]);

  useEffect(() => {
    if (!conn.connected) return;
    return midiParameterService.onNotification((code) => {
      setPresetStatus(NOTIFICATION_LABELS[code] ?? `Notification ${code}`);
    });
  }, [conn.connected]);

  useEffect(() => {
    if (conn.connected && !searchQuery) refreshGroup();
  }, [conn.connected, activeGroup, scope]);

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
      requestLivePreset,
      presetStatus,
      showDebug,
      setShowDebug,
      lastIn,
      lastOut,
      visibleParameters,
      groups: parameterGroups,
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
      requestLivePreset,
      presetStatus,
      showDebug,
      lastIn,
      lastOut,
      visibleParameters,
    ]
  );

  return <MidiContext.Provider value={value}>{children}</MidiContext.Provider>;
}

export function useMidiContext(): MidiContextValue {
  const ctx = useContext(MidiContext);
  if (!ctx) throw new Error("useMidiContext requires MidiProvider");
  return ctx;
}
