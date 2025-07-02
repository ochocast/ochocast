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
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files;
    if (file === null) {
      return;
    }

    if (file?.length === 1) {
      const fileArea = e.target.closest(`.${styles.fileArea}`);
      if (fileArea) {
        const fileDummyDefault = fileArea.querySelector(
          `.${styles.fileDummy} .default`,
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
      {/* <label>Upload Your File <span className="required">*</span></label> */}
      <input
        type="file"
        name={t('Images')}
        id="images"
        onChange={handleFileSelect}
        disabled={disable}
        required={required}
      />
      <div className={styles.fileDummy}>
        <div className="default">{effectiveplaceholder}</div>
      </div>
    </div>
  );
};

export default InputFile;
