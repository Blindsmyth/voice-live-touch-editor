import { enumLabel, type ParameterDef } from "@vlt/core";

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

  const options = param.options;
  if (options?.length) {
    return (
      <div className="vlt-param-control vlt-param-select">
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="vlt-param-value vlt-enum-hint">{value}</span>
      </div>
    );
  }

  return (
    <div className="vlt-param-control">
      <input
        type="range"
        min={param.min}
        max={param.max}
        step={1}
        value={value}
        disabled={disabled}
        onInput={(e) => onChange(Number(e.currentTarget.value))}
      />
      <span className="vlt-param-value">
        {param.options ? enumLabel(param.id, value) : `${value}${unit}`}
      </span>
    </div>
  );
}
