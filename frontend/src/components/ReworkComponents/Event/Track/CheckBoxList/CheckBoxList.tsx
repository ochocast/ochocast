import React, { useState } from 'react';

import { User } from '../../../../../utils/EventsProperties';

import './CheckBoxList.css';

interface CheckBoxListProps {
  allUsers: User[];
  category: User[];
  setCategory: (speakers: User[]) => void;
  title: string;
  disabled: boolean;
}

const CheckBoxList = (props: CheckBoxListProps) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredUsers = props.allUsers.filter((user) => {
    if (searchTerm.length == 0 || props.category.includes(user)) return;
    const fullName = `${user.firstName} ${user.lastName}`;
    return fullName.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const searchResult = (
    <div className="drop-down-result">
      {filteredUsers.map((user) => (
        <button
          key={user.id}
          onClick={() => {
            if (!props.category.includes(user)) {
              props.setCategory([...props.category, user]);
            }
            setSearchTerm('');
          }}
          className="search-result-user"
        >
          {user.firstName} {user.lastName}
        </button>
      ))}
    </div>
  );

  const selectedUsersComp = (
    <div className="users-container">
      {props.category.length === 0 ? (
        <p>Aucun élément sélectionné</p>
      ) : (
        props.category.map((user) => (
          <div key={user.id} className="user-container">
            <span className="user-selected-text">
              {user.firstName} {user.lastName}
            </span>
            <span
              className="user-selected-rm-button"
              onClick={() =>
                props.setCategory(
                  props.category.filter((cUser) => cUser.id !== user.id),
                )
              }
            >
              &times;
            </span>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="checkListContainer">
      <div className="topContainer">
        <h3 className="categoryTitle">{props.title}</h3>
        <div>
          <input
            type="text"
            placeholder="Chercher pour ajouter..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-bar"
          />
          {searchResult}
        </div>
      </div>
      {selectedUsersComp}
    </div>
  );
};

export default CheckBoxList;
