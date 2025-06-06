import React, { FC } from 'react';
import styles from './modal.module.css';

export interface ModalProps {
  children?: React.ReactNode;
  isOpen: boolean;
  toggle: () => void;
}

const Modal: FC<ModalProps> = ({ children, isOpen, toggle }) => (
  <>
    {isOpen && (
      <div className={styles.overlay} onClick={toggle}>
        <div onClick={(e) => e.stopPropagation()} className={styles.box} >
          {children}
        </div>
      </div>
    )}
  </>
);

export default Modal;
