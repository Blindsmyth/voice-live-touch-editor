import type { ParameterDef } from "@vlt/core";

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
        {value}
        {unit}
      </span>
    </div>
  );
}
