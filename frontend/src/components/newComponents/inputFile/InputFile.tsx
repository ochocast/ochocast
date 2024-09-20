import React, { FC } from 'react';
import './InputFile.css';
import { createVideo } from '../../../utils/api';
import { v4 as uuidv4 } from 'uuid';

interface InputFileProps {
  placeholder?: string;
}

const InputFile: FC<InputFileProps> = ({
  placeholder = 'Please drop or select some files',
}) => {
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files;
    if (file === null) {
      return;
    }

    if (file?.length === 1) {
      const fileArea = e.target.closest('.file-area');
      if (fileArea) {
        const fileDummyDefault = fileArea.querySelector('.file-dummy .success');
        if (fileDummyDefault) {
          fileDummyDefault.innerHTML = file[0].name; // Set the innerHTML to the name of the selected file

          const form = new FormData();
          form.append("file", file[0]);
          form.append('media_id', file[0].name);
          form.append('title', 'Your Video Title');
          form.append('description', 'Your Video Description');
          const blob = localStorage.getItem('backendUser');
          // Ajoutez les champs qui sont des objets ou des tableaux sous forme de JSON
          form.append('tags', JSON.stringify([{ id: uuidv4(), name: 'Tag1' }]));
          if(blob != null && blob != undefined){
            form.append('creator', JSON.parse(blob).id);
          }
          form.append('internal_speakers', 'Internal Speaker Names');
          form.append('external_speakers', 'External Speaker Names');
          form.append('comments', JSON.stringify([{ id: uuidv4(), content: 'Great video!' }]));
          createVideo(form);
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
      />
      <div className="file-dummy">
        <div className="success">Great, your files are selected. Keep on.</div>
        <div className="default">{placeholder}</div>
      </div>
    </div>
  );
};

export default InputFile;
