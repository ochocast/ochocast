import React, { ChangeEvent } from 'react';
import style from './TextBox.module.css';

export interface TextBoxProps {
  type: 'text' | 'number' | 'email' | 'password';
  label: string;
  value: string | number;
  name: string;
  placeholder: string;
  error: boolean;
  disabled?: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

const TextBox = ({
  type,
  label,
  value,
  name,
  placeholder,
  error,
  disabled,
  onChange,
}: TextBoxProps) => {
  return (
    <div className={style.inputWrapper}>
      <label htmlFor={label}>{label}</label>
      <input
        type={type}
        id={label}
        value={value}
        name={name}
        placeholder={placeholder}
        onChange={onChange}
        disabled={disabled}
      />
      {error && <p className={style.error}>Le champ ne peut pas être vide!</p>}
    </div>
  );
};

export default TextBox;
