import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './NavigateBackButton.module.css';

import ArrowIcon from '../../Event/EventsList/ArrowIcon';

export interface NavigateBackButtonProps {
  className?: string;
  customPageUrl?: string;
}

const NavigateBackButton = (props: NavigateBackButtonProps) => {
  // Redirige vers la page spécifiée ou vers la page précédente
  const navigate = useNavigate();
  const handleClick = () => {
    const destination = props.customPageUrl || null;
    if (destination) {
      navigate(destination);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className={styles.NavigateBackButtonContainer}>
      <ArrowIcon
        direction="left"
        color="var(--navigate-back-arrow-color)"
        size={24}
        className={styles.NavigateBackImage}
        onClick={handleClick}
      />
    </div>
  );
};

export default NavigateBackButton;
