import React, { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import './InputFile.css';

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
  required = true
}: InputFileProps) => {
  const { t } = useTranslation();
  const effectiveplaceholder = placeholder ?? t('DragOrSelectFiles');
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files;
    if (file === null) {
      return;
    }

    if (file?.length === 1) {
      const fileArea = e.target.closest('.file-area');
      if (fileArea) {
        const fileDummyDefault = fileArea.querySelector('.file-dummy .default');
        if (fileDummyDefault) {
          fileDummyDefault.innerHTML = file[0].name; // Set the innerHTML to the name of the selected file
          onChange(e);
        }
      }
    }
  };

  return (
    <div className="form-group file-area">
      {/* <label>Upload Your File <span className="required">*</span></label> */}
      <input
        type="file"
        name={t('Images')}
        id="images"
        onChange={handleFileSelect}
        disabled={disable}
        required={required}
      />
      <div className="file-dummy">
        <div className="default">{effectiveplaceholder}</div>
      </div>
    </div>
  );
};

export default InputFile;
