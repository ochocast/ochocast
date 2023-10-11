import React, { FC } from 'react';
import './modal.css';

export interface ModalProps {
  children?: React.ReactNode;
  isOpen: boolean;
  toggle: () => void;
}

const Modal: FC<ModalProps> = ({ children, isOpen, toggle }) => (
  <>
    {isOpen && (
      <div className="overlay" onClick={toggle}>
        <div onClick={(e) => e.stopPropagation()} className="box">
          {children}
        </div>
      </div>
    )}
  </>
);

export default Modal;
