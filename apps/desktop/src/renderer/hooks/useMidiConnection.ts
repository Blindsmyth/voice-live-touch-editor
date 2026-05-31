import { useCallback, useEffect, useRef, useState } from "react";
import { midiParameterService } from "@vlt/core";

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

function getInputsForOutput(
  access: MIDIAccess,
  output: MIDIOutput
): MIDIInput[] {
  const inputs = [...access.inputs.values()];
  if (inputs.length === 0) return [];

  const paired = inputs.find(
    (input) => input.id === output.id.replace(/output/i, "input")
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
  return hinted.length > 0 ? hinted : inputs;
}

async function openMidiPort(port: MIDIPort): Promise<void> {
  if (port.state === "closed" && typeof port.open === "function") {
    await port.open();
  }
}

export function useMidiConnection() {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<MIDIOutput[]>([]);
  const [selectedOutputId, setSelectedOutputId] = useState("");
  const [inputPortName, setInputPortName] = useState<string | null>(null);
  const [sysexId, setSysexIdState] = useState(0);
  const [statusText, setStatusText] = useState("Not connected");

  const accessRef = useRef<MIDIAccess | null>(null);
  const outputRef = useRef<MIDIOutput | null>(null);
  const inputsRef = useRef<MIDIInput[]>([]);

  const clearInputs = useCallback(() => {
    for (const input of inputsRef.current) {
      input.onmidimessage = null;
    }
    inputsRef.current = [];
    setInputPortName(null);
  }, []);

  const attachInputs = useCallback(async (access: MIDIAccess, output: MIDIOutput) => {
    clearInputs();
    const inputs = getInputsForOutput(access, output);
    for (const input of inputs) {
      try {
        await openMidiPort(input);
      } catch {
        /* continue */
      }
      input.onmidimessage = (e) => midiParameterService.handleMidiMessage(e);
      inputsRef.current.push(input);
    }
    setInputPortName(
      inputs.map((i) => i.name || i.id).join(", ") || "No MIDI input"
    );
  }, [clearInputs]);

  const selectOutput = useCallback(
    async (access: MIDIAccess, outputId: string) => {
      const output = access.outputs.get(outputId);
      if (!output) return;
      try {
        await openMidiPort(output);
      } catch {
        /* continue */
      }
      outputRef.current = output;
      setSelectedOutputId(outputId);
      await attachInputs(access, output);
      midiParameterService.setOutput(output);
      midiParameterService.setSysexId(sysexId);
      midiParameterService.enableEditorMode();
      setStatusText(`Connected: ${output.name ?? outputId}`);
    },
    [attachInputs, sysexId]
  );

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      if (!navigator.requestMIDIAccess) {
        throw new Error("Web MIDI is not available.");
      }
      const access = await navigator.requestMIDIAccess({ sysex: true });
      accessRef.current = access;
      const list = sortOutputs([...access.outputs.values()]);
      setOutputs(list);
      if (list.length === 0) throw new Error("No MIDI outputs found.");
      const preferred =
        list.find((o) =>
          PORT_HINTS.some((h) => o.name?.toLowerCase().includes(h))
        ) ?? list[0];
      setConnected(true);
      await selectOutput(access, preferred.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setConnected(false);
    } finally {
      setConnecting(false);
    }
  }, [selectOutput]);

  const disconnect = useCallback(() => {
    clearInputs();
    outputRef.current = null;
    accessRef.current = null;
    midiParameterService.setOutput(null);
    setConnected(false);
    setOutputs([]);
    setSelectedOutputId("");
    setStatusText("Disconnected");
  }, [clearInputs]);

  const setSysexId = useCallback((id: number) => {
    const c = Math.max(0, Math.min(127, Math.round(id)));
    setSysexIdState(c);
    midiParameterService.setSysexId(c);
  }, []);

  useEffect(() => () => clearInputs(), [clearInputs]);

  return {
    connected,
    connecting,
    error,
    outputs,
    selectedOutputId,
    inputPortName,
    sysexId,
    statusText,
    output: outputRef.current,
    inputs: inputsRef.current,
    connect,
    disconnect,
    setSelectedOutputId: (id: string) => {
      const access = accessRef.current;
      if (access && id) void selectOutput(access, id);
    },
    setSysexId,
  };
}
