import { useMemo } from "react";
import type { ParameterDef } from "@vlt/core";
import { ParameterControl } from "./ParameterControl.js";

export interface ParameterPanelProps {
  parameters: ParameterDef[];
  getValue: (id: number) => number;
  setValue: (id: number, value: number) => void;
  disabled?: boolean;
}

export function ParameterPanel({
  parameters,
  getValue,
  setValue,
  disabled,
}: ParameterPanelProps) {
  const bySubgroup = useMemo(() => {
    const map = new Map<string, ParameterDef[]>();
    for (const p of parameters) {
      const key = p.subgroup ?? "General";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [parameters]);

  if (parameters.length === 0) {
    return <p className="vlt-empty">No parameters in this group.</p>;
  }

  return (
    <div className="vlt-panel">
      {bySubgroup.map(([sub, params]) => (
        <section key={sub} className="vlt-subgroup-section">
          {bySubgroup.length > 1 && (
            <h3 className="vlt-subgroup-heading">
              {sub} <span className="vlt-count">({params.length})</span>
            </h3>
          )}
          <ul className="vlt-param-list">
            {params.map((param) => (
              <li key={param.id} className="vlt-param-row">
                <div className="vlt-param-label">
                  <strong>{param.label}</strong>
                  <span className="vlt-param-meta">
                    ID {param.id} · {param.name}
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
        </section>
      ))}
    </div>
  );
}
