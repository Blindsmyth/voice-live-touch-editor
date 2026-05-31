import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildRequestParameter,
  buildSetParameter,
  formatSysex,
  harmVol,
  parseParameterResponse,
} from "@vlt/core";

const PORT_HINTS = ["voice", "helicon", "vlt", "touch"];

function sortOutputs(outputs: MIDIOutput[]): MIDIOutput[] {
  const hinted = outputs.filter((o) =>
    PORT_HINTS.some((h) => o.name?.toLowerCase().includes(h))
  );
  const rest = outputs.filter((o) => !hinted.includes(o));
  return [...hinted, ...rest];
}

function findMatchingInput(
  access: MIDIAccess,
  output: MIDIOutput
): MIDIInput | null {
  const outputId = output.id;
  const byPair = [...access.inputs.values()].find(
    (input) => input.id === outputId.replace("output", "input")
  );
  if (byPair) return byPair;

  const baseName = output.name?.replace(/\s*output\s*/i, "").trim();
  if (baseName) {
    for (const input of access.inputs.values()) {
      if (input.name?.toLowerCase().includes(baseName.toLowerCase())) {
        return input;
      }
    }
  }

  return access.inputs.values().next().value ?? null;
}

export interface UseMidiState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  outputs: MIDIOutput[];
  selectedOutputId: string;
  sysexId: number;
  harmVolValue: number;
  lastSent: string | null;
  lastReceived: string | null;
  statusText: string;
  connect: () => Promise<void>;
  disconnect: () => void;
  setSelectedOutputId: (id: string) => void;
  setSysexId: (id: number) => void;
  setHarmVolValue: (value: number) => void;
  requestHarmVol: () => void;
}

export function useMidi(): UseMidiState {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<MIDIOutput[]>([]);
  const [selectedOutputId, setSelectedOutputIdState] = useState("");
  const [sysexId, setSysexIdState] = useState(0);
  const [harmVolValue, setHarmVolValueState] = useState(harmVol.centre);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [lastReceived, setLastReceived] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("Not connected");

  const accessRef = useRef<MIDIAccess | null>(null);
  const outputRef = useRef<MIDIOutput | null>(null);
  const inputRef = useRef<MIDIInput | null>(null);
  const sysexIdRef = useRef(sysexId);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSendRef = useRef(false);

  sysexIdRef.current = sysexId;

  const sendSysex = useCallback((bytes: Uint8Array) => {
    const out = outputRef.current;
    if (!out) return;
    out.send(bytes);
    setLastSent(formatSysex(bytes));
  }, []);

  const requestHarmVol = useCallback(() => {
    sendSysex(buildRequestParameter(sysexIdRef.current, harmVol.id));
    setStatusText("Requested Harm Vol…");
  }, [sendSysex]);

  const handleMidiMessage = useCallback((event: MIDIMessageEvent) => {
    const data = event.data;
    if (!data || data[0] !== 0xf0) return;

    const bytes = new Uint8Array(data);
    const parsed = parseParameterResponse(bytes, sysexIdRef.current);
    if (!parsed || parsed.paramId !== harmVol.id) return;

    const clamped = Math.max(harmVol.min, Math.min(harmVol.max, parsed.value));
    setLastReceived(formatSysex(bytes));
    skipSendRef.current = true;
    setHarmVolValueState(clamped);
    setStatusText(`Harm Vol: ${clamped} dB`);
    queueMicrotask(() => {
      skipSendRef.current = false;
    });
  }, []);

  const attachInput = useCallback(
    (access: MIDIAccess, output: MIDIOutput) => {
      if (inputRef.current) {
        inputRef.current.onmidimessage = null;
      }
      const input = findMatchingInput(access, output);
      inputRef.current = input;
      if (input) {
        input.onmidimessage = handleMidiMessage;
      }
    },
    [handleMidiMessage]
  );

  const selectOutput = useCallback(
    (access: MIDIAccess, outputId: string) => {
      const output = access.outputs.get(outputId);
      if (!output) return;
      outputRef.current = output;
      setSelectedOutputIdState(outputId);
      attachInput(access, output);
      setStatusText(`Connected: ${output.name ?? outputId}`);
      requestHarmVol();
    },
    [attachInput, requestHarmVol]
  );

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      if (!navigator.requestMIDIAccess) {
        throw new Error("Web MIDI is not available in this environment.");
      }
      const access = await navigator.requestMIDIAccess({ sysex: true });
      accessRef.current = access;

      const list = sortOutputs([...access.outputs.values()]);
      setOutputs(list);

      if (list.length === 0) {
        throw new Error("No MIDI outputs found. Check USB and device MIDI settings.");
      }

      const preferred =
        list.find((o) =>
          PORT_HINTS.some((h) => o.name?.toLowerCase().includes(h))
        ) ?? list[0];

      setConnected(true);
      selectOutput(access, preferred.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setConnected(false);
      setStatusText("Connection failed");
    } finally {
      setConnecting(false);
    }
  }, [selectOutput]);

  const disconnect = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (inputRef.current) inputRef.current.onmidimessage = null;
    outputRef.current = null;
    inputRef.current = null;
    accessRef.current = null;
    setConnected(false);
    setOutputs([]);
    setSelectedOutputIdState("");
    setStatusText("Disconnected");
    setLastSent(null);
    setLastReceived(null);
  }, []);

  const setSelectedOutputId = useCallback(
    (id: string) => {
      const access = accessRef.current;
      if (!access || !id) return;
      selectOutput(access, id);
    },
    [selectOutput]
  );

  const setSysexId = useCallback((id: number) => {
    const clamped = Math.max(0, Math.min(127, Math.round(id)));
    sysexIdRef.current = clamped;
    setSysexIdState(clamped);
  }, []);

  const setHarmVolValue = useCallback(
    (value: number) => {
      const clamped = Math.max(harmVol.min, Math.min(harmVol.max, Math.round(value)));
      setHarmVolValueState(clamped);

      if (!connected || skipSendRef.current) return;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        sendSysex(buildSetParameter(sysexIdRef.current, harmVol.id, clamped));
        setStatusText(`Sent Harm Vol: ${clamped} dB`);
      }, 30);
    },
    [connected, sendSysex]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (inputRef.current) inputRef.current.onmidimessage = null;
    };
  }, []);

  return {
    connected,
    connecting,
    error,
    outputs,
    selectedOutputId,
    sysexId,
    harmVolValue,
    lastSent,
    lastReceived,
    statusText,
    connect,
    disconnect,
    setSelectedOutputId,
    setSysexId,
    setHarmVolValue,
    requestHarmVol,
  };
}
