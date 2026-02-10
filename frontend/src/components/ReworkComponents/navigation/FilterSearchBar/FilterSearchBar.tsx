import styles from './FilterSearchBar.module.css';
import { Tag_video, User } from '../../../../utils/VideoProperties';
import { findTags, findUsers } from '../../../../utils/api';
import logger from '../../../../utils/logger';
import React, { useState, useRef, useEffect } from 'react';
import BrandingImage from '../../BrandingImage/BrandingImage';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<{ name: string }[]>([]);
  const [noResults, setNoResults] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Gérer les clics en dehors pour cacher les suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const findSuggestions = async (input: string) => {
    try {
      if (input.trim() === '') {
        setSuggestions([]);
        setNoResults(false);
        return;
      }

      if (type === 'tag') {
        const tagResponse = await findTags(input);
        const tags = tagResponse.data.slice(0, 5).map((tag: Tag_video) => ({
          name: tag.name,
        }));
        setSuggestions(tags);
        setNoResults(tags.length === 0);
        setShowSuggestions(true);
      } else if (type === 'user') {
        const userResponse = await findUsers(input);
        const users = userResponse.data.slice(0, 5).map((user: User) => ({
          name: `${user.firstName}`,
        }));
        setSuggestions(users);
        setNoResults(users.length === 0);
        setShowSuggestions(true);
      }
    } catch (error) {
      logger.error('Error fetching suggestions:', error);
      setNoResults(true);
      setShowSuggestions(true);
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
    setNoResults(false);
    setShowSuggestions(false);
    onSelect?.(name); // 👈 Notify parent
  };

  const handleInputFocus = () => {
    if (suggestions.length > 0 || noResults) {
      setShowSuggestions(true);
    }
  };

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <div className={styles.searchBar}>
        {needInput && (
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleInputFocus}
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

      {showSuggestions && suggestions.length > 0 && (
        <ul className={styles.suggestions_list}>
          {suggestions.map((sugg, idx) => (
            <li key={idx} onClick={() => handleSuggestionClick(sugg.name)}>
              {sugg.name}
            </li>
          ))}
        </ul>
      )}

      {showSuggestions && noResults && query.trim() !== '' && (
        <div className={styles.noResults}>{t('filterPanel.noResults')}</div>
      )}
    </div>
  );
};

export default FilterSearchBar;
