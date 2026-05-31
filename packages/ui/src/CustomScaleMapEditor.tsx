import { useMemo, useState } from "react";
import {
  HARMONY_CUSTOM_MAP_ROWS,
  HARMONY_SCALE_CUSTOM,
  degreeTabLabel,
  formatVoiceTarget,
  pianoKeyDisplayForMap,
  pitchClassName,
  inputPitchClassForRow,
  pianoIndexToWire,
  readVoiceWire,
  wireToPianoIndex,
  writeVoiceWire,
  PIANO_ROLL_MIN,
  PIANO_ROLL_MAX,
  type HarmonyVoiceIndex,
} from "@vlt/core";

export interface CustomScaleMapEditorProps {
  getValue: (id: number) => number;
  setValue: (id: number, value: number) => void;
  harmonyKey: number;
  harmonyScale: number;
  disabled?: boolean;
}

const VOICE_LABELS = ["Voice 1", "Voice 2", "Voice 3", "Voice 4"] as const;

export function CustomScaleMapEditor({
  getValue,
  setValue,
  harmonyKey,
  harmonyScale,
  disabled,
}: CustomScaleMapEditorProps) {
  const [inputRow, setInputRow] = useState(0);

  const row = HARMONY_CUSTOM_MAP_ROWS[inputRow]!;
  const sungNote = pitchClassName(inputPitchClassForRow(harmonyKey, inputRow));
  const keyName = pitchClassName(harmonyKey);
  const packedV12 = getValue(row.v12Id);
  const packedV34 = getValue(row.v34Id);

  const voiceWires = useMemo(
    () =>
      ([0, 1, 2, 3] as const).map((v) =>
        readVoiceWire(packedV12, packedV34, v as HarmonyVoiceIndex)
      ),
    [packedV12, packedV34]
  );

  const setVoice = (voice: HarmonyVoiceIndex, pianoIndex: number) => {
    if (disabled) return;
    const wire = pianoIndexToWire(pianoIndex);
    const next = writeVoiceWire(packedV12, packedV34, voice, wire);
    setValue(row.v12Id, next.v12);
    setValue(row.v34Id, next.v34);
  };

  const pianoKeys = useMemo(() => {
    const keys: number[] = [];
    for (let i = PIANO_ROLL_MIN; i <= PIANO_ROLL_MAX; i++) keys.push(i);
    return keys;
  }, []);

  return (
    <div className="custom-scale-map">
      {harmonyScale !== HARMONY_SCALE_CUSTOM && (
        <p className="custom-scale-map-warn">
          Harmony Scale is not <strong>Custom</strong> — this map is stored in the
          preset but may be ignored until Scale = Custom.
        </p>
      )}

      <p className="custom-scale-map-intro">
        Preset key: <strong>{keyName}</strong> — each row is the note you sing in
        that key; the piano roll shows <strong>absolute</strong> harmony targets
        (C, D, …) and <strong>relative</strong> shifts (+3 st, −5 st). Stored
        values are still semitone offsets; labels follow{" "}
        <strong>Harmony Key</strong>.
      </p>

      <div className="custom-scale-map-step">
        <span className="custom-scale-map-step-label">1) Input note (scale degree)</span>
        <div className="custom-scale-map-degrees" role="tablist">
          {HARMONY_CUSTOM_MAP_ROWS.map((r, i) => (
            <button
              key={r.v12Id}
              type="button"
              role="tab"
              aria-selected={i === inputRow}
              className={i === inputRow ? "degree-btn active" : "degree-btn"}
              disabled={disabled}
              title={`${r.degree} — sung note ${pitchClassName(inputPitchClassForRow(harmonyKey, i))} in key ${keyName}`}
              onClick={() => setInputRow(i)}
            >
              {degreeTabLabel(harmonyKey, i)}
            </button>
          ))}
        </div>
        <p className="custom-scale-map-degree-name">
          Editing: <strong>{row.degree}</strong> — you sing <strong>{sungNote}</strong>{" "}
          (in key {keyName})
          <span className="custom-scale-map-packed">
            V1–2 word {packedV12} · V3–4 word {packedV34}
          </span>
        </p>
      </div>

      <div className="custom-scale-map-step">
        <span className="custom-scale-map-step-label">
          2) Output note per voice (piano roll)
        </span>
        {VOICE_LABELS.map((label, vi) => {
          const voice = vi as HarmonyVoiceIndex;
          const activeIndex = wireToPianoIndex(voiceWires[vi]!);
          return (
            <div key={label} className="custom-scale-map-voice-row">
              <span className="custom-scale-map-voice-label">{label}</span>
              <span className="custom-scale-map-voice-value">
                {formatVoiceTarget(voiceWires[vi]!, harmonyKey, inputRow)}
              </span>
              <div className="custom-scale-map-piano" role="group" aria-label={label}>
                {pianoKeys.map((keyIdx) => {
                  const display = pianoKeyDisplayForMap(
                    keyIdx,
                    harmonyKey,
                    inputRow
                  );
                  const active = keyIdx === activeIndex;
                  const showLabel =
                    display.isNoChange ||
                    display.isUnison ||
                    display.semitonesFromInput % 12 === 0;
                  return (
                    <button
                      key={keyIdx}
                      type="button"
                      className={[
                        "piano-key",
                        display.isUnison ? "piano-key-uni" : "",
                        display.isNoChange ? "piano-key-nc" : "",
                        active ? "piano-key-active" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      disabled={disabled}
                      title={display.title}
                      onClick={() => setVoice(voice, keyIdx)}
                    >
                      {showLabel ? display.short : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <details className="custom-scale-map-raw">
        <summary>Show raw SysEx words (advanced)</summary>
        <ul>
          {HARMONY_CUSTOM_MAP_ROWS.map((r) => (
            <li key={r.v12Id}>
              {r.degree}: V12={getValue(r.v12Id)}, V34={getValue(r.v34Id)}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
