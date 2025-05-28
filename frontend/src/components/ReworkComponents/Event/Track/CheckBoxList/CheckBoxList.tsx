import React, { useState } from 'react';

import { User } from '../../../../../utils/EventsProperties';
import { useTranslation } from 'react-i18next';
import styles from './CheckBoxList.module.css';

interface CheckBoxListProps {
  allUsers: User[];
  category: User[];
  setCategory: (speakers: User[]) => void;
  title: string;
  disabled: boolean;
}

const CheckBoxList = (props: CheckBoxListProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const { t } = useTranslation();

  const filteredUsers = props.allUsers.filter((user) => {
    if (searchTerm.length == 0 || props.category.includes(user)) return;
    const fullName = `${user.firstName} ${user.lastName}`;
    return fullName.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const searchResult = (
    <div className={styles.result}>
      {filteredUsers.map((user) => (
        <button
          key={user.id}
          onClick={() => {
            if (!props.category.includes(user)) {
              props.setCategory([...props.category, user]);
            }
            setSearchTerm('');
          }}
          className={styles.searchResult}
        >
          {user.firstName} {user.lastName}
        </button>
      ))}
    </div>
  );

  const selectedUsersComp = (
    <div className={styles.usersContainer}>
      {props.category.length === 0 ? (
        <p>{t('NoItemsSelected')}</p>
      ) : (
        props.category.map((user) => (
          <div key={user.id} className={styles.user}>
            <span className={styles.userSelected}>
              {user.firstName} {user.lastName}
            </span>
            {!props.disabled && (
              <span
                className={styles.userSelectedRmButton}
                onClick={() =>
                  props.setCategory(
                    props.category.filter((cUser) => cUser.id !== user.id),
                  )
                }
              >
                &times;
              </span>
            )}
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className={styles.container}>
      <div className={styles.top}>
        <h3 className={styles.title}>{props.title}</h3>
        <div>
          {!props.disabled && (
            <input
              type="text"
              placeholder={t('SearchToAdd')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={styles.searchBar}
            />
          )}
          {searchResult}
        </div>
      </div>
      {selectedUsersComp}
    </div>
  );
};

export default CheckBoxList;
