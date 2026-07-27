import React, { useEffect, useRef, useState } from 'react';
import styles from './GlobalSearchBar.module.css';
import { Tag_video, User } from '../../../../utils/VideoProperties';
import { findTags, findUsers } from '../../../../utils/api';
import logger from '../../../../utils/logger';
import { useTranslation } from 'react-i18next';
import BrandingImage from '../../BrandingImage/BrandingImage';
import FilterIcon from '../../../../assets/filter_icon.svg';
import CopyButtonIcon from '../../../../assets/copy.svg';

export interface GlobalSearchBarProps {
  onSearch: (query: string) => void;
  onClear?: () => void;
  placeholder?: string;
  initialValue?: string;
  hasSuggestion?: boolean;
  onFilterClick?: () => void;
  onShareClick?: () => void;
  activeFiltersCount?: number;
  selectedTags?: string[];
  onRemoveTag?: (tag: string) => void;
  hideTagsRow?: boolean;
}

const GlobalSearchBar = ({
  onSearch,
  onClear,
  placeholder,
  initialValue,
  hasSuggestion = true,
  onFilterClick,
  onShareClick,
  activeFiltersCount = 0,
  selectedTags = [],
  onRemoveTag,
  hideTagsRow = false,
}: GlobalSearchBarProps) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState(initialValue || '');
  const [tagSuggestions, setTagSuggestions] = useState<Tag_video[]>([]);
  const [userSuggestions, setUserSuggestions] = useState<User[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionRequestRef = useRef(0);

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

  useEffect(
    () => () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
      suggestionRequestRef.current += 1;
    },
    [],
  );

  const findSuggestions = async (queryEntered: string, requestId: number) => {
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

      if (requestId !== suggestionRequestRef.current) return;

      if (
        !tagResponse.ok ||
        !userResponse.ok ||
        !Array.isArray(tagResponse.data) ||
        !Array.isArray(userResponse.data)
      ) {
        throw new Error(
          `Suggestion request failed (${tagResponse.status ?? 'network'}/${
            userResponse.status ?? 'network'
          })`,
        );
      }

      setTagSuggestions(tagResponse.data);
      setUserSuggestions(userResponse.data);
      setShowSuggestions(true);
    } catch (error) {
      if (requestId !== suggestionRequestRef.current) return;
      logger.error(`Error fetching users and tags: ${error}`);
      setTagSuggestions([]);
      setUserSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    const requestId = ++suggestionRequestRef.current;

    if (value.trim() === '') {
      setTagSuggestions([]);
      setUserSuggestions([]);
      setShowSuggestions(false);
      onSearch('');
      return;
    }

    searchTimerRef.current = setTimeout(() => {
      findSuggestions(value, requestId);
      onSearch(value);
    }, 300);
  };

  const handleSubmit = () => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    const requestId = ++suggestionRequestRef.current;
    findSuggestions(query, requestId);
    onSearch(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  const handleClear = () => {
    // If input is empty, simply trigger onClear (navigate home)
    if (query.trim() === '') {
      onClear?.();
      return;
    }

    // clear local state and suggestions, then notify host to handle navigation
    setQuery('');
    setTagSuggestions([]);
    setUserSuggestions([]);
    setShowSuggestions(false);
    suggestionRequestRef.current += 1;
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    onClear?.();
  };

  const handleSearchBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    if (target.closest('button')) {
      return;
    }

    inputRef.current?.focus();
    if (hasSuggestion) {
      setShowSuggestions(tagSuggestions.length + userSuggestions.length > 0);
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
    suggestionRequestRef.current += 1;
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    onSearch(value);
  };

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <div className={styles.searchContainer}>
        <div className={styles.searchBar} onClick={handleSearchBarClick}>
          <div className={styles.searchIconSlot}>
            <BrandingImage
              className={styles.searchIcon}
              alt="Search"
              imageKey="search"
              fallbackSrc="search.svg"
            />
          </div>

          <input
            ref={inputRef}
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

          <button
            type="button"
            className={styles.copyButton}
            onClick={onShareClick}
            aria-label="Open filters"
          >
            <img
              className={styles.copyIcon}
              src={CopyButtonIcon}
              alt="Partager les filtres"
            />
          </button>

          <button
            type="button"
            className={styles.clearButton}
            onClick={handleClear}
            aria-label="Clear search"
          >
            ×
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

      {!hideTagsRow && selectedTags.length > 0 && (
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
