import React, { ChangeEvent, FC } from 'react';
import './TextArea.css';

export interface TextAreaProps {
  label: string;
  value: string | number;
  name: string;
  cols?: number;
  placeholder: string;
  error?: boolean;
  disabled?: boolean;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
}

const TextArea: FC<TextAreaProps> = ({
  label,
  value,
  name,
  cols,
  placeholder,
  error,
  disabled,
  onChange,
}) => {
  return (
    <div className="area-wrapper">
      <label htmlFor={label}>{label}</label>
      <textarea
        id={label}
        value={value}
        cols={cols}
        name={name}
        placeholder={placeholder}
        disabled={disabled}
        onChange={onChange}
      />
      {error && <p className="error">Le champ ne peut pas être vide!</p>}
    </div>
  );
};

export default TextArea;
