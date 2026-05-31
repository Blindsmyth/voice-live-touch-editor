import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildEditorMode,
  buildRequestParameter,
  buildSetParameter,
  createSysexAssembler,
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

function normalizePortName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, "")
    .replace(/midi|usb|output|input|out|in/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Prefer inputs paired with the selected output; fall back to device-related ports. */
function getInputsForOutput(
  access: MIDIAccess,
  output: MIDIOutput
): MIDIInput[] {
  const inputs = [...access.inputs.values()];
  if (inputs.length === 0) return [];

  const outputId = output.id;
  const paired = inputs.find(
    (input) => input.id === outputId.replace(/output/i, "input")
  );
  if (paired) return [paired];

  const base = normalizePortName(output.name ?? "");
  if (base) {
    const byName = inputs.filter((input) => {
      const inBase = normalizePortName(input.name ?? "");
      return inBase === base || inBase.includes(base) || base.includes(inBase);
    });
    if (byName.length > 0) return byName;
  }

  const hinted = inputs.filter((input) =>
    PORT_HINTS.some((h) => input.name?.toLowerCase().includes(h))
  );
  if (hinted.length > 0) return hinted;

  return inputs;
}

async function openMidiPort(port: MIDIPort): Promise<void> {
  if (port.state === "closed" && typeof port.open === "function") {
    await port.open();
  }
}

export interface UseMidiState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  outputs: MIDIOutput[];
  selectedOutputId: string;
  inputPortName: string | null;
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
  const [inputPortName, setInputPortName] = useState<string | null>(null);
  const [sysexId, setSysexIdState] = useState(0);
  const [harmVolValue, setHarmVolValueState] = useState(harmVol.centre);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [lastReceived, setLastReceived] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("Not connected");

  const accessRef = useRef<MIDIAccess | null>(null);
  const outputRef = useRef<MIDIOutput | null>(null);
  const inputsRef = useRef<MIDIInput[]>([]);
  const sysexIdRef = useRef(sysexId);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSendRef = useRef(false);
  const assemblerRef = useRef<((data: Uint8Array) => void) | null>(null);

  sysexIdRef.current = sysexId;

  const applyParameterValue = useCallback((value: number, raw: Uint8Array) => {
    if (!Number.isFinite(value)) return;
    const clamped = Math.round(
      Math.max(harmVol.min, Math.min(harmVol.max, value))
    );
    setLastReceived(formatSysex(raw));
    // Block slider onChange from overwriting this value (synthetic events after setState)
    skipSendRef.current = true;
    setHarmVolValueState(clamped);
    setStatusText(`Harm Vol: ${clamped} dB (from device)`);
    window.setTimeout(() => {
      skipSendRef.current = false;
    }, 150);
  }, []);

  const processSysexMessage = useCallback(
    (bytes: Uint8Array) => {
      setLastReceived(formatSysex(bytes));
      const parsed =
        parseParameterResponse(bytes, sysexIdRef.current) ??
        parseParameterResponse(bytes);
      if (!parsed || parsed.paramId !== harmVol.id) {
        setStatusText(
          parsed
            ? `Ignored param ${parsed.paramId} (expected ${harmVol.id})`
            : "Received SysEx (not Harm Vol param data)"
        );
        return;
      }
      applyParameterValue(parsed.value, bytes);
    },
    [applyParameterValue]
  );

  useEffect(() => {
    assemblerRef.current = createSysexAssembler(processSysexMessage);
  }, [processSysexMessage]);

  const handleMidiMessage = useCallback((event: MIDIMessageEvent) => {
    const data = event.data;
    if (!data || data.length === 0) return;
    assemblerRef.current?.(new Uint8Array(data));
  }, []);

  const clearInputHandlers = useCallback(() => {
    for (const input of inputsRef.current) {
      input.onmidimessage = null;
    }
    inputsRef.current = [];
    setInputPortName(null);
  }, []);

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

  const attachInputs = useCallback(
    async (access: MIDIAccess, output: MIDIOutput) => {
      clearInputHandlers();

      const inputs = getInputsForOutput(access, output);
      const opened: MIDIInput[] = [];

      for (const input of inputs) {
        try {
          await openMidiPort(input);
          input.onmidimessage = handleMidiMessage;
          opened.push(input);
        } catch {
          // Still attach handler — some platforms report open errors spuriously
          input.onmidimessage = handleMidiMessage;
          opened.push(input);
        }
      }

      inputsRef.current = opened;
      setInputPortName(
        opened.map((i) => i.name || i.id).join(", ") || "No MIDI input"
      );
    },
    [clearInputHandlers, handleMidiMessage]
  );

  const selectOutput = useCallback(
    async (access: MIDIAccess, outputId: string) => {
      const output = access.outputs.get(outputId);
      if (!output) return;

      try {
        await openMidiPort(output);
      } catch {
        // continue if send still works
      }

      outputRef.current = output;
      setSelectedOutputIdState(outputId);
      await attachInputs(access, output);

      sendSysex(buildEditorMode(sysexIdRef.current, 1));
      requestHarmVol();

      setStatusText(
        `Out: ${output.name ?? outputId} · In: ${inputsRef.current.map((i) => i.name).join(", ") || "?"}`
      );
    },
    [attachInputs, requestHarmVol, sendSysex]
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
      await selectOutput(access, preferred.id);
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
    clearInputHandlers();
    outputRef.current = null;
    accessRef.current = null;
    setConnected(false);
    setOutputs([]);
    setSelectedOutputIdState("");
    setStatusText("Disconnected");
    setLastSent(null);
    setLastReceived(null);
  }, [clearInputHandlers]);

  const setSelectedOutputId = useCallback(
    (id: string) => {
      const access = accessRef.current;
      if (!access || !id) return;
      void selectOutput(access, id);
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
      // Ignore synthetic onChange fired when we update value from incoming SysEx
      if (skipSendRef.current) return;

      const clamped = Math.max(
        harmVol.min,
        Math.min(harmVol.max, Math.round(value))
      );
      setHarmVolValueState(clamped);

      if (!connected) return;

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
      clearInputHandlers();
    };
  }, [clearInputHandlers]);

  return {
    connected,
    connecting,
    error,
    outputs,
    selectedOutputId,
    inputPortName,
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
