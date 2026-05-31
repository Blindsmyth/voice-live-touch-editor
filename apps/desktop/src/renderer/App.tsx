import { useMidi } from "./hooks/useMidi";
import { harmVol } from "@vlt/core";

export function App() {
  const midi = useMidi();

  return (
    <div className="app">
      <h1>Voice Live Touch Editor</h1>
      <p className="subtitle">Proof of concept — Harm Vol (SysEx param 193)</p>

      <div className="row">
        {!midi.connected ? (
          <button onClick={() => void midi.connect()} disabled={midi.connecting}>
            {midi.connecting ? "Connecting…" : "Connect MIDI"}
          </button>
        ) : (
          <button className="secondary" onClick={midi.disconnect}>
            Disconnect
          </button>
        )}
        {midi.connected && (
          <button className="secondary" onClick={midi.requestHarmVol}>
            Refresh
          </button>
        )}
      </div>

      {midi.error && <p className="error">{midi.error}</p>}

      {midi.connected && (
        <>
          <div className="field">
            <label htmlFor="midi-output">MIDI output</label>
            <select
              id="midi-output"
              value={midi.selectedOutputId}
              onChange={(e) => midi.setSelectedOutputId(e.target.value)}
            >
              {midi.outputs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name || o.id}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="sysex-id">SysEx ID (device MIDI menu)</label>
            <input
              id="sysex-id"
              type="number"
              min={0}
              max={127}
              value={midi.sysexId}
              onChange={(e) => midi.setSysexId(Number(e.target.value))}
            />
          </div>

          <div className="slider-row">
            <div className="slider-header">
              <strong>{harmVol.name}</strong>
              <span className="slider-value">{midi.harmVolValue} dB</span>
            </div>
            <input
              type="range"
              min={harmVol.min}
              max={harmVol.max}
              value={midi.harmVolValue}
              onChange={(e) => midi.setHarmVolValue(Number(e.target.value))}
            />
            <p className="subtitle" style={{ marginTop: "0.35rem", marginBottom: 0 }}>
              Range {harmVol.min} … {harmVol.max} dB (centre {harmVol.centre})
            </p>
          </div>
        </>
      )}

      <div className="status">
        <div>
          <strong>Status:</strong> {midi.statusText}
        </div>
        {midi.lastSent && (
          <div style={{ marginTop: "0.5rem" }}>
            <strong>Last sent:</strong> {midi.lastSent}
          </div>
        )}
        {midi.lastReceived && (
          <div style={{ marginTop: "0.25rem" }}>
            <strong>Last received:</strong> {midi.lastReceived}
          </div>
        )}
      </div>
    </div>
  );
}
