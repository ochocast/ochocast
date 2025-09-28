import styles from './FilterSearchBar.module.css';
import { Tag_video, User } from '../../../../utils/VideoProperties';
import { findTags, findUsers } from '../../../../utils/api';
import logger from '../../../../utils/logger';
import React, { useState, useRef } from 'react';
import BrandingImage from '../../BrandingImage/BrandingImage';

export enum FilterSearchBarIcon {
  SEARCH = 'plus',
  ADD = 'add',
}

export interface FilterSearchBarProps {
  onClick: (query: string) => void;
  onSelect?: (selected: string) => void;
  placeholder?: string;
  needInput?: boolean;
  icon?: FilterSearchBarIcon;
  type: 'tag' | 'user';
}

const FilterSearchBar = ({
  onClick,
  onSelect,
  needInput = true,
  placeholder,
  icon,
  type,
}: FilterSearchBarProps) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<{ name: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const findSuggestions = async (input: string) => {
    try {
      if (input.trim() === '') {
        setSuggestions([]);
        return;
      }

      if (type === 'tag') {
        const tagResponse = await findTags(input);
        const tags = tagResponse.data.slice(0, 5).map((tag: Tag_video) => ({
          name: tag.name,
        }));
        setSuggestions(tags);
      } else if (type === 'user') {
        const userResponse = await findUsers(input);
        const users = userResponse.data.slice(0, 5).map((user: User) => ({
          name: `${user.firstName}`,
        }));
        setSuggestions(users);
      }
    } catch (error) {
      logger.error('Error fetching suggestions:', error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    findSuggestions(value);
  };

  const handleClick = () => {
    if (!needInput || query.trim() !== '') onClick(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleClick();
  };

  const handleSuggestionClick = (name: string) => {
    if (inputRef.current) inputRef.current.value = '';
    setQuery('');
    setSuggestions([]);
    onSelect?.(name); // 👈 Notify parent
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.searchBar}>
        {needInput && (
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? 'Recherche ...'}
            className={styles.searchInput}
            ref={inputRef}
          />
        )}
        <button onClick={handleClick} className={styles.searchButton}>
          <BrandingImage
            className={styles.searchIcon}
            alt="Search"
            imageKey={
              icon === FilterSearchBarIcon.ADD
                ? FilterSearchBarIcon.ADD
                : FilterSearchBarIcon.SEARCH
            }
            fallbackSrc={
              icon === FilterSearchBarIcon.ADD
                ? FilterSearchBarIcon.ADD + '.svg'
                : FilterSearchBarIcon.SEARCH + '.svg'
            }
          />
        </button>
      </div>

      {suggestions.length > 0 && (
        <ul className={styles.suggestions_list}>
          {suggestions.map((sugg, idx) => (
            <li key={idx} onClick={() => handleSuggestionClick(sugg.name)}>
              {sugg.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default FilterSearchBar;
