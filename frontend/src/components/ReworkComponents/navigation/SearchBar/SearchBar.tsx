import styles from './SearchBar.module.css';
import { Tag_video, User } from '../../../../utils/VideoProperties';
import { findTags, findUsers } from '../../../../utils/api';
import logger from '../../../../utils/logger';
import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import BrandingImage from '../../BrandingImage/BrandingImage';

export enum SearchBarIcon {
  SEARCH = 'search',
  ADD = 'add',
}

export interface SearchBarProps {
  onClick: (query: string) => void;
  placeholder?: string;
  needInput?: boolean;
  icon?: SearchBarIcon;
  hasSugestion?: boolean;
  initialValue?: string;
}

const SearchBar = ({
  onClick,
  needInput,
  placeholder,
  icon,
  hasSugestion,
  initialValue,
}: SearchBarProps) => {
  const [query, setQuery] = useState(initialValue || '');
  const inputRef = useRef<HTMLInputElement>(null); // Référence pour l'élément d'entrée
  const [tag_suggestions, setTag] = useState<Tag_video[]>([]);
  const [user_suggestions, setUser] = useState<User[]>([]);

  // Synchroniser avec initialValue quand il change
  useEffect(() => {
    if (initialValue !== undefined) {
      setQuery(initialValue);
    }
  }, [initialValue]);

  if (needInput === undefined) {
    needInput = true;
  }

  if (hasSugestion === undefined) {
    hasSugestion = true;
  }

  const findSuggestions = async (query_enter: string) => {
    try {
      if (query_enter !== '') {
        const tagResponse = await findTags(query_enter);
        const userResponse = await findUsers(query_enter);
        setTag(tagResponse.data);
        setUser(userResponse.data);
      }
    } catch (error) {
      logger.error('Error fetching users and tags:', error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    if (value !== '') {
      findSuggestions(value);
    } else {
      findSuggestions('');
    }
    onClick(value);
  };

  const handleClick = () => {
    if (!needInput || query !== '') onClick(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleClick();
    }
  };

  useEffect(() => {
    const suggestionsList = hasSugestion
      ? (document.getElementById('suggestions_list') as HTMLUListElement)
      : undefined;
    if (suggestionsList && (tag_suggestions.length || user_suggestions)) {
      suggestionsList.innerHTML = '';
      const filteredObjects: { name: string; img: string }[] = [];

      suggestionsList.style.display = 'none';
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
    } else if (suggestionsList) {
      suggestionsList.style.display = 'none';
    }
  }, [tag_suggestions, user_suggestions, onClick, hasSugestion]);
  const { t } = useTranslation();

  return (
    <>
      <div className={styles.searchBar}>
        {needInput && (
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ? placeholder : t('Searching')}
            className={styles.searchInput}
            ref={inputRef} // Associe la référence à l'élément d'entrée
          />
        )}
        <button onClick={handleClick} className={styles.searchButton}>
          <BrandingImage
            className={styles.searchIcon}
            alt="Search"
            imageKey={
              icon === SearchBarIcon.ADD
                ? SearchBarIcon.ADD
                : SearchBarIcon.SEARCH
            }
            fallbackSrc={
              icon === SearchBarIcon.ADD
                ? SearchBarIcon.ADD + '.svg'
                : SearchBarIcon.SEARCH + '.svg'
            }
          />
        </button>
      </div>
      {hasSugestion && (
        <ul id={`suggestions_list`} className="suggestions_list"></ul>
      )}
    </>
  );
};

export default SearchBar;
