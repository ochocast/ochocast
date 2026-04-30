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
      logger.error({ err: error }, 'Error fetching users and tags');
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
    if (!hasSugestion || !inputRef.current) return;

    const suggestionsList = document.getElementById(
      'suggestions_list',
    ) as HTMLUListElement;
    if (!suggestionsList) return;

    suggestionsList.innerHTML = '';

    if (tag_suggestions.length === 0 && user_suggestions.length === 0) {
      suggestionsList.style.display = 'none';
      return;
    }

    suggestionsList.style.display = 'block';

    const combinedSuggestions: { name: string; img: string }[] = [
      ...tag_suggestions.map((t) => ({
        name: t.name,
        img: '/ochoIconFull.svg',
      })), // Fallback icons
      ...user_suggestions.map((u) => ({
        name: u.username || u.firstName,
        img: u.picture_id || '/ochoIconFull.svg',
      })),
    ];

    combinedSuggestions.forEach((obj) => {
      const li = document.createElement('li');
      li.style.display = 'flex';
      li.style.alignItems = 'center';
      li.style.gap = '8px';
      li.style.padding = '8px';
      li.style.cursor = 'pointer';

      const img = document.createElement('img');
      img.src = obj.img;
      img.alt = obj.name;
      img.style.width = '24px';
      img.style.height = '24px';
      img.style.borderRadius = '50%';

      const text = document.createElement('span');
      text.innerText = obj.name;

      li.appendChild(img);
      li.appendChild(text);

      li.onclick = () => {
        setQuery('');
        setTag([]);
        setUser([]);
        suggestionsList.style.display = 'none';
        onClick(obj.name);
      };

      suggestionsList.appendChild(li);
    });
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
