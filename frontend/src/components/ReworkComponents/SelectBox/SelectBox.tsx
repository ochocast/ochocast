import React, { ChangeEvent } from 'react';
import './SelectBox.css';
type Option = {
  label: string;
  value: string;
};

export interface SelectBoxProps {
  title: string;
  value?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  options: Option[];
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
}

const SelectBox = ({
  title,
  value,
  required,
  disabled,
  className,
  options,
  onChange,
}: SelectBoxProps) => {
  return (
    <div className="select-wrapper">
      <label htmlFor={title}>{title}</label>
      <select
        className={className}
        disabled={disabled}
        onChange={onChange}
        value={value}
        required={required}
      >
        {options.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
};

export { SelectBox };
export type { Option };
