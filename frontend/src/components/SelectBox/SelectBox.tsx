import React, { ChangeEvent, FC } from 'react';
import './SelectBox.css';
type Option = {
  label: string;
  value: string;
};

export interface SelectBoxProps {
  title: string;
  value?: string;
  disabled?: boolean;
  className?: string;
  options: Option[];
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
}

const SelectBox: FC<SelectBoxProps> = ({
  title,
  value,
  disabled,
  className,
  options,
  onChange,
}) => {
  return (
    <div className="select-wrapper">
      <label htmlFor={title}>{title}</label>
      <select
        className={className}
        disabled={disabled}
        onChange={onChange}
        value={value}
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
