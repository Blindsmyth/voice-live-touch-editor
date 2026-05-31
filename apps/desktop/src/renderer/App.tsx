import { MidiProvider } from "./context/MidiContext.js";
import { EditorShell } from "./EditorShell.js";

export function App() {
  return (
    <MidiProvider>
      <EditorShell />
    </MidiProvider>
  );
}
