import React from 'react';
import SearchBar from '../../components/ReworkComponents/navigation/SearchBar/SearchBar';
import { useTranslation } from 'react-i18next';
import Button, { ButtonType } from '../../components/ReworkComponents/generic/Button/Button';

import styles from './eventsHome.module.css';

const EventsHomePage = () => {
  const { t } = useTranslation();

  return (
    <header className={styles.header}>
      <div className={styles.searchContainer}>
        <SearchBar
          onClick={() => {} /* TODO*/}
          needInput={true}
          placeholder={t('searchAnEvent')}
          hasSugestion={false}
        />
      </div>
      <div className={styles.checkBoxSubscribeEventWrapper}>
        <input
          className={styles.checkBoxSubscribeEvent}
          type="checkbox"
          checked={false}
          onChange={() => {
            /*TODO*/
          }}
        />
        Cochez-moi
      </div>

      <Button label={'mes events TODO' /*TODO*/} type={ButtonType.primary} />
    </header>
  );
};

export default EventsHomePage;
