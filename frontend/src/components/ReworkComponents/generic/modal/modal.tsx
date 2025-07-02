import React from 'react';
import styles from './modal.module.css';

export interface ModalProps {
  children?: React.ReactNode;
  isOpen: boolean;
  toggle: () => void;
}

const Modal = (props: ModalProps) => {
  return (
    <>
      {props.isOpen && (
        <div className={styles.overlay} onClick={props.toggle}>
          <div onClick={(e) => e.stopPropagation()} className={styles.box}>
            {props.children}
          </div>
        </div>
      )}
    </>
  );
};

export default Modal;
