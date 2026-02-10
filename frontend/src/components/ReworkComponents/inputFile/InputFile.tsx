import React, { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './InputFile.module.css';

interface InputFileProps {
  placeholder?: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  disable: boolean;
  required?: boolean;
}

const InputFile = ({
  placeholder,
  onChange,
  disable,
  required = true,
}: InputFileProps) => {
  const { t } = useTranslation();
  const effectiveplaceholder = placeholder ?? t('DragOrSelectFiles');
  // Generate a unique ID for each input to avoid conflicts
  const inputId = React.useId();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files;
    if (file === null) {
      return;
    }

    if (file?.length === 1) {
      const fileArea = e.target.closest(`.${styles.fileArea}`);
      if (fileArea) {
        const fileDummyDefault = fileArea.querySelector(
          `.${styles.fileDummy} .${styles.default}`,
        );
        if (fileDummyDefault) {
          fileDummyDefault.innerHTML = file[0].name; // Set the innerHTML to the name of the selected file
          onChange(e);
        }
      }
    }
  };

  return (
    <div className={styles.fileArea}>
      <label htmlFor={inputId} className={styles.visuallyHidden}>
        {effectiveplaceholder}
      </label>
      <input
        type="file"
        name={t('Images')}
        id={inputId}
        onChange={handleFileSelect}
        disabled={disable}
        required={required}
        aria-label={effectiveplaceholder}
      />
      <div className={styles.fileDummy} aria-hidden="true">
        <div className={styles.default}>{effectiveplaceholder}</div>
      </div>
    </div>
  );
};

export default InputFile;
