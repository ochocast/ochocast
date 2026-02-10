import React, { ChangeEvent } from 'react';
import style from './TextBox.module.css';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
      {error && <p className={style.error}>{t('FieldCannotBeEmpty')}</p>}
    </div>
  );
};

export default TextBox;
