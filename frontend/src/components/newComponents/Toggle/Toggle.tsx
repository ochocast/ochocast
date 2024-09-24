import React, { FC, ChangeEvent } from 'react';
import './Toggle.css';

export interface ToggleProps {
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

const Toggle: FC<ToggleProps> = ({
  onChange,
  
}) => {
  return (
    <div>
      <label className="switch">
        <input type="checkbox" onChange={onChange}/>
        <span className="slider round"></span>
      </label>
    </div>
  );
};

export default Toggle;