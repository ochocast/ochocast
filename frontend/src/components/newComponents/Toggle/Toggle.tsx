import React, { FC } from 'react';
import './Toggle.css';

export interface ToggleProps { }

const Toggle: FC<ToggleProps> = () => {
  return (
    <div>
      <label className="switch">
        <input type="checkbox" />
        <span className="slider round"></span>
      </label>
    </div>
  );
};

export default Toggle;