import React, { useState } from 'react';
import styles from './SearchBar.module.css';

export enum SearchBarIcon {
  SEARCH = 'search.svg',
  ADD = 'add.svg',
}

export interface SearchBarProps {
  onClick: (query: string) => void;
  placeholder?: string;
  needInput?: boolean;
  icon?: SearchBarIcon;
  filter?: () => string[];
  select?: (str: string) => void;
}

const SearchBar = ({
  onClick,
  needInput,
  placeholder,
  icon,
  select,
  filter,
}: SearchBarProps) => {
  const [query, setQuery] = useState('');

  if (needInput === undefined) {
    needInput = true;
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleClick = () => {
    if (!needInput || query !== '') onClick(query);
    setQuery('');
  };

  const handleEntryChange = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (filter === undefined || select === undefined) {
      return;
    }

    const inputElement = e.target as HTMLInputElement;
    const inputValue: string = inputElement.value.toLowerCase();
    const suggestionsList = document.getElementById(
      'suggestions-list',
    ) as HTMLUListElement;

    suggestionsList.innerHTML = '';
    const filteredObjects: string[] = filter();

    if (inputValue && filteredObjects.length != 0) {
      suggestionsList.style.display = 'block';

      filteredObjects.forEach((str) => {
        const li = document.createElement('li');
        li.innerText = str;
        li.onclick = () => {
          inputElement.value = '';
          suggestionsList.style.display = 'none';
          select(str);
        };
        suggestionsList.appendChild(li);
      });
    } else {
      suggestionsList.style.display = 'none';
    }
  };

  return (
    <div className={styles.searchBar}>
      {needInput && (
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyUp={handleEntryChange}
          placeholder={placeholder ? placeholder : 'Recherche ...'}
          className={styles.searchInput}
        />
      )}
      <button onClick={handleClick} className={styles.searchButton}>
        <img
          className={styles.searchIcon}
          alt="Search"
          src={
            icon == SearchBarIcon.ADD ? SearchBarIcon.ADD : SearchBarIcon.SEARCH
          }
        />
      </button>
      <ul id={`suggestions-list`} className="suggestions-list"></ul>
    </div>
  );
};

export default SearchBar;
