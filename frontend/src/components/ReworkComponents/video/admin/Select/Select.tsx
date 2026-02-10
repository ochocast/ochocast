import React from 'react';
import ReactSelect from 'react-select';
import styles from './Select.module.scss';

interface Option {
  value: string;
  label: string;
}

interface MultiSelectProps {
  label: string;
  options: Option[];
  isLoading?: boolean;
  value: Option[];
  onChange: (value: readonly Option[]) => void;
}

export default function MultiSelect({
  label,
  options,
  isLoading,
  value,
  onChange,
}: MultiSelectProps) {
  const placeHolderSelect = 'Choisir une option';
  const noOption = 'Aucune option';

  return (
    <label>
      {label}
      <ReactSelect
        aria-label={placeHolderSelect}
        aria-errormessage={noOption}
        className={styles.select}
        placeholder={placeHolderSelect}
        options={options}
        isLoading={isLoading}
        classNamePrefix="select"
        value={value}
        onChange={onChange}
        isMulti={true}
      />
    </label>
  );
}
