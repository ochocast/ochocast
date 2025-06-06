import React, { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './NavigateBackButton.module.css';

import defaultImageUrl from '../../../assets/gaucheAigu.svg';

export interface NavigateBackButtonProps {
  className?: string;
  customPageUrl?: string;
}

const NavigateBackButton: FC<NavigateBackButtonProps> = ({ customPageUrl }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    // Redirige vers la page spécifiée ou vers la page précédente
    const destination = customPageUrl || null;
    if (destination) {
      navigate(destination);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className={styles.NavigateBackButtonContainer}>
      <img
        className={styles.NavigateBackImage}
        src={defaultImageUrl}
        alt="iconeSelect"
      />
      <button
        className={styles.NavigateBackButton}
        type="button"
        onClick={handleClick}
      />
    </div>
  );
};

export default NavigateBackButton;
