import { useMemo } from "react";
import type { DisplayedParameter } from "@vlt/core";
import { PARAMETER_SECTION_HELP } from "@vlt/core";
import { ParameterControl } from "./ParameterControl.js";
import { CustomScaleMapEditor } from "./CustomScaleMapEditor.js";

const HARMONY_MAP_IDS = new Set([
  936, 937, 938, 939, 940, 941, 942, 943, 944, 945, 946, 947, 948, 949, 950,
  951, 952, 953, 954, 955, 956, 957, 958, 959,
]);
const HARMONY_SCALE_ID = 108;
const HARMONY_KEY_ID = 107;

export interface ParameterPanelProps {
  parameters: DisplayedParameter[];
  getValue: (id: number) => number;
  setValue: (id: number, value: number) => void;
  disabled?: boolean;
}

function compareParameters(a: DisplayedParameter, b: DisplayedParameter): number {
  const orderA = a.sectionOrder ?? 50;
  const orderB = b.sectionOrder ?? 50;
  if (orderA !== orderB) return orderA - orderB;
  const dispA = a.displayOrder ?? a.offset;
  const dispB = b.displayOrder ?? b.offset;
  if (dispA !== dispB) return dispA - dispB;
  if (a.offset !== b.offset) return a.offset - b.offset;
  return a.uiKey.localeCompare(b.uiKey);
}

export function ParameterPanel({
  parameters,
  getValue,
  setValue,
  disabled,
}: ParameterPanelProps) {
  const sections = useMemo(() => {
    const sorted = [...parameters].sort(compareParameters);
    const map = new Map<string, DisplayedParameter[]>();
    for (const p of sorted) {
      const key = p.section ?? "General";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()];
  }, [parameters]);

  if (parameters.length === 0) {
    return <p className="vlt-empty">No parameters in this group.</p>;
  }

  return (
    <div className="vlt-panel">
      {sections.map(([section, params]) => (
        <section key={section} className="vlt-subgroup-section">
          {sections.length > 1 && (
            <>
              <h3 className="vlt-subgroup-heading">
                {section} <span className="vlt-count">({params.length})</span>
              </h3>
              {PARAMETER_SECTION_HELP[section] && (
                <p className="vlt-section-help">{PARAMETER_SECTION_HELP[section]}</p>
              )}
            </>
          )}
          {section === "Custom scale map" &&
          params.every((p) => HARMONY_MAP_IDS.has(p.id)) ? (
            <CustomScaleMapEditor
              getValue={getValue}
              setValue={setValue}
              harmonyKey={getValue(HARMONY_KEY_ID)}
              harmonyScale={getValue(HARMONY_SCALE_ID)}
              disabled={disabled}
            />
          ) : (
            <ul className="vlt-param-list">
              {params
                .filter((p) => !HARMONY_MAP_IDS.has(p.id))
                .map((param) => (
                  <li key={param.uiKey} className="vlt-param-row">
                    <div className="vlt-param-label">
                      <strong>{param.label}</strong>
                      <span className="vlt-param-meta">
                        ID {param.id} · {param.name}
                        {param.mirroredFrom ? ` · also in ${param.mirroredFrom}` : ""}
                      </span>
                    </div>
                    <ParameterControl
                      param={param}
                      value={getValue(param.id)}
                      onChange={(v) => setValue(param.id, v)}
                      disabled={disabled}
                    />
                  </li>
                ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
