import { parameterValueLabel, type ParameterDef } from "@vlt/core";

export interface ParameterControlProps {
  param: ParameterDef;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function ParameterControl({
  param,
  value,
  onChange,
  disabled,
}: ParameterControlProps) {
  const unit =
    param.min >= -61 && param.max <= 6 && param.name.includes("Level")
      ? " dB"
      : "";

  if (param.control === "toggle") {
    return (
      <label className="vlt-toggle">
        <input
          type="checkbox"
          checked={value >= 1}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked ? 1 : 0)}
        />
        <span>{value ? "On" : "Off"}</span>
      </label>
    );
  }

  if (param.control === "select" && param.options?.length) {
    const clamped = Math.max(param.min, Math.min(param.max, value));
    return (
      <div className="vlt-param-control vlt-param-select">
        <select
          value={clamped}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          {param.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="vlt-param-value vlt-enum-hint">{clamped}</span>
      </div>
    );
  }

  const clamped = Math.max(param.min, Math.min(param.max, value));

  return (
    <div className="vlt-param-control">
      <input
        type="range"
        min={param.min}
        max={param.max}
        step={1}
        value={clamped}
        disabled={disabled}
        onInput={(e) => onChange(Number(e.currentTarget.value))}
      />
      <span className="vlt-param-value">
        {param.options?.length || /Int_(shift|scale)/.test(param.name)
          ? parameterValueLabel(param, clamped)
          : `${clamped}${unit}`}
      </span>
    </div>
  );
}
