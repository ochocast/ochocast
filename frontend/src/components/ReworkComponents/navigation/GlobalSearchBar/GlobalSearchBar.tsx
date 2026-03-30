import React, { useEffect, useRef, useState } from 'react';
import styles from './GlobalSearchBar.module.css';
import { Tag_video, User } from '../../../../utils/VideoProperties';
import { findTags, findUsers } from '../../../../utils/api';
import logger from '../../../../utils/logger';
import { useTranslation } from 'react-i18next';
import BrandingImage from '../../BrandingImage/BrandingImage';
import FilterIcon from '../../../../assets/filter_icon.svg';

export interface GlobalSearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  initialValue?: string;
  hasSuggestion?: boolean;
  onFilterClick?: () => void;
  activeFiltersCount?: number;
  selectedTags?: string[];
  onRemoveTag?: (tag: string) => void;
}

const GlobalSearchBar = ({
  onSearch,
  placeholder,
  initialValue,
  hasSuggestion = true,
  onFilterClick,
  activeFiltersCount = 0,
  selectedTags = [],
  onRemoveTag,
}: GlobalSearchBarProps) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState(initialValue || '');
  const [tagSuggestions, setTagSuggestions] = useState<Tag_video[]>([]);
  const [userSuggestions, setUserSuggestions] = useState<User[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialValue !== undefined) {
      setQuery(initialValue);
    }
  }, [initialValue]);

  useEffect(() => {
    const onOutsideClick = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', onOutsideClick);
    return () => {
      document.removeEventListener('mousedown', onOutsideClick);
    };
  }, []);

  const findSuggestions = async (queryEntered: string) => {
    if (!hasSuggestion) return;

    try {
      if (queryEntered.trim() === '') {
        setTagSuggestions([]);
        setUserSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      const [tagResponse, userResponse] = await Promise.all([
        findTags(queryEntered),
        findUsers(queryEntered),
      ]);

      setTagSuggestions(tagResponse.data || []);
      setUserSuggestions(userResponse.data || []);
      setShowSuggestions(true);
    } catch (error) {
      logger.error('Error fetching users and tags:', error);
      setTagSuggestions([]);
      setUserSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    findSuggestions(value);
    onSearch(value);
  };

  const handleSubmit = () => {
    onSearch(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  const combinedSuggestions: {
    name: string;
    img: string;
    isSearchIcon?: boolean;
  }[] = [
    ...tagSuggestions.map((tag) => ({
      name: tag.name,
      img: '/branding/search.svg',
      isSearchIcon: true,
    })),
    ...userSuggestions.map((user) => ({
      name: user.username || user.firstName,
      img: user.picture_id || '/branding/search.svg',
      isSearchIcon: !user.picture_id,
    })),
  ];

  const onSuggestionClick = (value: string) => {
    setQuery(value);
    setShowSuggestions(false);
    setTagSuggestions([]);
    setUserSuggestions([]);
    onSearch(value);
  };

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <div className={styles.searchContainer}>
        <div className={styles.searchBar}>
          <div className={styles.searchIconSlot}>
            <BrandingImage
              className={styles.searchIcon}
              alt="Search"
              imageKey="search"
              fallbackSrc="search.svg"
            />
          </div>

          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(combinedSuggestions.length > 0)}
            placeholder={placeholder || t('Searching')}
            className={styles.searchInput}
          />

          <button
            type="button"
            className={styles.filterButton}
            onClick={onFilterClick}
            aria-label="Open filters"
          >
            <img
              src={FilterIcon}
              alt="Filter icon"
              className={styles.filterIcon}
            />
            {activeFiltersCount > 0 && (
              <span className={styles.filterBadge}>{activeFiltersCount}</span>
            )}
          </button>
        </div>

        {hasSuggestion && showSuggestions && combinedSuggestions.length > 0 && (
          <ul className={styles.suggestionsList}>
            {combinedSuggestions.slice(0, 8).map((item) => (
              <li key={`${item.name}-${item.img}`}>
                <button
                  type="button"
                  className={styles.suggestionButton}
                  onClick={() => onSuggestionClick(item.name)}
                >
                  <img
                    src={item.img}
                    alt=""
                    className={
                      item.isSearchIcon
                        ? styles.suggestionSearchIcon
                        : undefined
                    }
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = '/branding/search.svg';
                      e.currentTarget.className =
                        styles.suggestionSearchIcon || '';
                    }}
                  />
                  <span>{item.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedTags.length > 0 && (
        <div className={styles.selectedTagsContainer}>
          <div className={styles.selectedTagsLeft}>
            <span className={styles.selectedTagsTitle}>
              {t('Selected tags')}
            </span>
            <button
              type="button"
              className={styles.deleteAllButton}
              onClick={() => {
                const tagsToRemove = [...selectedTags];
                tagsToRemove.forEach((tag) => onRemoveTag?.(tag));
              }}
            >
              {t('Delete all')}
            </button>
          </div>
          <div className={styles.pillsRow}>
            {selectedTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={styles.tagPill}
                onClick={() => onRemoveTag?.(tag)}
                aria-label={`Remove tag ${tag}`}
              >
                <span className={styles.pillLabel}>{tag}</span>
                <span className={styles.pillCloseWrapper}>
                  <span className={styles.pillClose}>x</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default GlobalSearchBar;
