import React, { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
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

const TextArea = ({
  label,
  value,
  name,
  cols,
  placeholder,
  error,
  disabled,
  onChange,
}: TextAreaProps) => {
  const { t } = useTranslation();
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
      {error && <p className="error">{t('FieldCannotBeEmpty')}</p>}
    </div>
  );
};

export default TextArea;
