import styles from './SearchBar.module.css';
import { Tag_video, User} from '../../../utils/VideoProperties';
import { findTags, findUsers } from '../../../utils/api';
import logger from '../../../utils/logger';
import Tag_Logo from '../../../assets/Tag_Logo.png';
import React, { useEffect, useState, useRef } from 'react';

export enum SearchBarIcon {
  SEARCH = 'search.svg',
  ADD = 'add.svg',
}

export interface SearchBarProps {
  onClick: (query: string) => void;
  placeholder?: string;
  needInput?: boolean;
  icon?: SearchBarIcon;
}

const SearchBar = ({
  onClick,
  needInput,
  placeholder,
  icon,
}: SearchBarProps) => {
  const [query, setQuery] = useState('');
  const [tag_suggestions, setTag] = useState<Tag_video[]>([]);
  const [user_suggestions, setUser] = useState<User[]>([]);
  const inputRef = useRef<HTMLInputElement>(null); // Référence pour l'élément d'entrée

  if (needInput === undefined) {
    needInput = true;
  }

  const findSuggestions = async (query_enter: string) => {
    try {
      const tagResponse = await findTags(query_enter);
      const userResponse = await findUsers(query_enter);
      setTag(tagResponse.data);
      setUser(userResponse.data);
    } catch (error) {
      logger.error('Error fetching users and tags:', error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value !== '')
      findSuggestions(e.target.value);
    else{
      const suggestionsList = document.getElementById('suggestions_list') as HTMLUListElement;
      suggestionsList.style.display = 'none';
    }
    setQuery(e.target.value);
  };

  const handleClick = () => {
    if (!needInput || query !== '') onClick(query);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleClick();
    }
  };

  useEffect(() => {
    const suggestionsList = document.getElementById('suggestions_list') as HTMLUListElement;

    if (tag_suggestions.length || user_suggestions.length) {
      suggestionsList.innerHTML = '';
      const filteredObjects: { name: string; img: string }[] = [];

      tag_suggestions.slice(0, 3).forEach((tag) => {
        const obj = { name: tag.name, img: Tag_Logo };
        filteredObjects.push(obj);
      });

      user_suggestions.slice(0, 3).forEach((usr) => {
        const obj = { name: usr.firstName + ' ' + usr.lastName, img: 'imgTag' };
        filteredObjects.push(obj);
      });

      suggestionsList.style.display = 'block';
      suggestionsList.innerHTML = '';

      filteredObjects.forEach((obj) => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.alignItems = 'center';
        li.style.gap = '8px';

        const img = document.createElement('img');
        img.src = obj.img;
        img.alt = obj.name;
        img.style.width = '24px';
        img.style.height = '24px';
        img.style.borderRadius = '50%';

        li.innerText = obj.name;

        li.onclick = () => {
          if (inputRef.current) {
            inputRef.current.value = ''; // Utilisation de la référence pour manipuler l'élément
          }
          suggestionsList.style.display = 'none';
          setQuery('');
          onClick(li.innerHTML);
        };

        li.prepend(img);

        suggestionsList.appendChild(li);
      });
    } else {
      suggestionsList.style.display = 'none';
    }
  }, [tag_suggestions, user_suggestions]);

  return (
    <>
      <div className={styles.searchBar}>
        {needInput && (
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ? placeholder : 'Recherche ...'}
            className={styles.searchInput}
            ref={inputRef} // Associe la référence à l'élément d'entrée
          />
        )}
        <button onClick={handleClick} className={styles.searchButton}>
          <img
            className={styles.searchIcon}
            alt="Search"
            src={
              icon === SearchBarIcon.ADD ? SearchBarIcon.ADD : SearchBarIcon.SEARCH
            }
          />
        </button>
      </div>
      <ul id={`suggestions_list`} className="suggestions_list"></ul>
    </>
  );
};

export default SearchBar;
