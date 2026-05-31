/// <reference types="vite/client" />

interface MIDIAccess {
  readonly inputs: MIDIInputMap;
  readonly outputs: MIDIOutputMap;
  onstatechange: ((event: MIDIConnectionEvent) => void) | null;
}

interface Navigator {
  requestMIDIAccess(options?: { sysex?: boolean }): Promise<MIDIAccess>;
}
