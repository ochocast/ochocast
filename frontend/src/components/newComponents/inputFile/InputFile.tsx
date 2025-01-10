import React, { FC, ChangeEvent } from 'react';
import './InputFile.css';

interface InputFileProps {
  placeholder?: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  disable: boolean;
}

const InputFile: FC<InputFileProps> = ({
  placeholder = 'Please drop or select some files',
  onChange,
  disable,
}) => {
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
        name="images"
        id="images"
        required
        onChange={handleFileSelect}
        disabled={disable}
      />
      <div className="file-dummy">
        <div className="default">{placeholder}</div>
      </div>
    </div>
  );
};

export default InputFile;
