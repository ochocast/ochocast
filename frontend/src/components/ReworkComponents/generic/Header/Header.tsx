import React, { FC, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './Header.module.css';
import navStyles from './NavItems/NavItems.module.css';
import { getVideos, searchVideos } from '../../../../utils/api';
import { useUser } from '../../../../context/UserContext';
import { UserBadge } from './UserBadge/UserBadge';
import NavItems from './NavItems/NavItems';
import Button from '../Button/Button';
import { useBrandingContext } from '../../../../context/BrandingContext';
import BrandingImage from '../../BrandingImage/BrandingImage';
import GlobalSearchBar from '../../navigation/GlobalSearchBar/GlobalSearchBar';
import FilterPanel from '../../navigation/FilterPanel/FilterPanel';
import { Video } from '@/utils/VideoProperties';
import logger from '../../../../utils/logger';

export interface HeaderProps {}

interface SearchState {
  q: string;
  tags: string[];
  users: string[];
  dateFrom: string | null;
  dateTo: string | null;
  favoris: boolean;
  archived: boolean | null;
}

const Header: FC<HeaderProps> = () => {
  const { user, isAdmin } = useUser();
  const username = user?.username || user?.firstName;
  const navigate = useNavigate();
  const { t } = useTranslation();
  const branding = useBrandingContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [videos, setVideos] = useState<Video[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [, setFilteredVideos] = useState<Video[]>([]);
  const filterPanelRef = useRef<HTMLDivElement | null>(null);
  const location = useLocation();
  const [showFavorites, setShowFavorites] = useState(false);
  const [, setToast] = useState<{
    message: string;
    type?: 'success' | 'error' | 'info';
  } | null>(null);
  const searchWrapperRef = useRef<HTMLDivElement>(null);
  const [searchWrapperHeight, setSearchWrapperHeight] = useState(0);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showFilters &&
        filterPanelRef.current &&
        !filterPanelRef.current.contains(event.target as Node)
      ) {
        setShowFilters(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFilters]);

  const useUrlStateSync = (initialState: SearchState) => {
    const [state, setState] = useState<SearchState>(initialState);
    const navigate = useNavigate();
    const location = useLocation();

    const parseQueryParams = (search: string): SearchState => {
      const params = new URLSearchParams(search);

      return {
        q: params.get('q') || '',
        tags: params.get('tags')?.split(',').filter(Boolean) || [],
        users: params.get('users')?.split(',').filter(Boolean) || [],
        dateFrom: params.get('dateFrom') || null,
        dateTo: params.get('dateTo') || null,
        favoris: params.get('favoris') === 'true',
        archived:
          params.get('archived') === 'true'
            ? true
            : params.get('archived') === 'false'
              ? false
              : null,
      };
    };

    useEffect(() => {
      const parsedState = parseQueryParams(location.search);
      setState(parsedState);
    }, [location.search]);

    const serializeSearchState = (state: SearchState): string => {
      const params = new URLSearchParams();

      if (state.q) params.set('q', state.q);
      if (state.tags.length > 0) params.set('tags', state.tags.join(','));
      if (state.users.length > 0) params.set('users', state.users.join(','));
      if (state.dateFrom) params.set('dateFrom', state.dateFrom);
      if (state.dateTo) params.set('dateTo', state.dateTo);
      if (state.favoris) params.set('favoris', 'true');
      if (state.archived !== null) {
        params.set('archived', String(state.archived));
      }

      return params.toString();
    };

    const updateUrl = (newState: SearchState) => {
      const queryString = serializeSearchState(newState);
      navigate(`${location.pathname}?${queryString}`, { replace: true });
    };

    const setSearchState = (newState: Partial<SearchState>) => {
      const updatedState = { ...state, ...newState };
      setState(updatedState);
      updateUrl(updatedState);
    };

    return [state, setSearchState] as const;
  };

  const [, setSearchState] = useUrlStateSync({
    q: '',
    tags: [],
    users: [],
    dateFrom: null,
    dateTo: null,
    favoris: false,
    archived: false,
  });

  const toggleMenu = () => setMenuOpen(!menuOpen);
  const closeMenu = () => setMenuOpen(false);

  const handleSearch = React.useCallback(async (keywords: string[]) => {
    try {
      if (keywords[0] !== '') {
        const response = await searchVideos(keywords[0]);

        const result = response.data || [];
        setVideos(result);
      } else {
        const response = await getVideos();
        const result = response.data || [];
        setVideos(result);
      }
    } catch (error) {
      logger.error(`Error fetching suggestions: ${error}`);
    }
  }, []);

  const handleSearchWithUrl = useCallback(
    (query: string) => {
      setSearchQuery(query);

      if (location.pathname !== '/videos') {
        navigate(`/videos?q=${encodeURIComponent(query)}`);
      } else {
        setSearchState({ q: query });
        handleSearch([query]);
      }
    },
    [location.pathname, navigate, setSearchState, handleSearch],
  );

  const applyFilters = (newFilters = filters) => {
    let result = [...videos];

    if (newFilters.tags.length > 0) {
      result = result.filter((video) =>
        video.tags?.some((tag) => newFilters.tags.includes(tag.name)),
      );
    }

    if (newFilters.users.length > 0) {
      result = result.filter((video) => {
        const uname = video.creator?.username;
        const fullname =
          `${video.creator?.firstName ?? ''} ${video.creator?.lastName ?? ''}`.trim();
        return newFilters.users.includes(uname || fullname);
      });
    }

    if (newFilters.startDate && newFilters.endDate) {
      result = result.filter((video) => {
        const createdAt = new Date(video.createdAt);
        return (
          createdAt >= newFilters.startDate! && createdAt <= newFilters.endDate!
        );
      });
    }
    if (newFilters.archived !== null) {
      result = result.filter((video) => video.archived === newFilters.archived);
    }

    result.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    setFilteredVideos(result);
  };

  const navigateToVideosWithFilters = (overrides: {
    tags?: string[];
    users?: string[];
    startDate?: Date | null;
    endDate?: Date | null;
  }) => {
    const merged = { ...filters, ...overrides };
    const params = new URLSearchParams();
    if (merged.tags.length > 0) params.set('tags', merged.tags.join(','));
    if (merged.users.length > 0) params.set('users', merged.users.join(','));
    if (merged.startDate)
      params.set('dateFrom', merged.startDate.toISOString());
    if (merged.endDate) params.set('dateTo', merged.endDate.toISOString());
    navigate(`/videos?${params.toString()}`);
  };

  const handleTagsChange = (tags: string[]) => {
    const updated = { ...filters, tags };
    setFilters(updated);
    applyFilters(updated);

    if (location.pathname !== '/videos') {
      const params = new URLSearchParams();
      if (tags.length > 0) params.set('tags', tags.join(','));
      navigateToVideosWithFilters({ tags });
    } else {
      setSearchState({
        tags,
        dateFrom: updated.startDate?.toISOString() || null,
        dateTo: updated.endDate?.toISOString() || null,
      });
    }
  };

  const handleUsersChange = (users: string[]) => {
    const updated = { ...filters, users };
    setFilters(updated);
    applyFilters(updated);

    if (location.pathname !== '/videos') {
      const params = new URLSearchParams();
      if (users.length > 0) params.set('users', users.join(','));
      navigateToVideosWithFilters({ users });
    } else {
      setSearchState({
        users,
        dateFrom: updated.startDate?.toISOString() || null,
        dateTo: updated.endDate?.toISOString() || null,
      });
    }
  };

  const handleDateFilter = (startDate: Date | null, endDate: Date | null) => {
    const updated = { ...filters, startDate, endDate };
    setFilters(updated);
    applyFilters(updated);

    if (location.pathname !== '/videos') {
      const params = new URLSearchParams();
      if (startDate) params.set('dateFrom', startDate.toISOString());
      if (endDate) params.set('dateTo', endDate.toISOString());
      navigateToVideosWithFilters({ startDate, endDate });
    } else {
      setSearchState({
        dateFrom: startDate?.toISOString() || null,
        dateTo: endDate?.toISOString() || null,
      });
    }
  };

  const handleResetFilters = () => {
    const updated = {
      tags: [],
      users: [],
      startDate: null,
      endDate: null,
      archived: null,
    };

    setFilters(updated);
    setFilteredVideos(videos);
    setSearchState({
      tags: [],
      users: [],
      dateFrom: null,
      dateTo: null,
      favoris: false,
      archived: false,
    });
  };

  const [filters, setFilters] = useState<{
    tags: string[];
    users: string[];
    startDate: Date | null;
    endDate: Date | null;
    archived: boolean | null;
  }>({
    tags: [],
    users: [],
    startDate: null,
    endDate: null,
    archived: null,
  });

  const activeFiltersCount =
    filters.tags.length +
    filters.users.length +
    (filters.startDate || filters.endDate ? 1 : 0) +
    (filters.archived !== null ? 1 : 0);

  const handleToggleFavorites = () => {
    const nextState = !showFavorites;
    setShowFavorites(nextState);

    if (location.pathname !== '/videos') {
      navigate(`/videos?favoris=${nextState}`);
    } else {
      setSearchState({ favoris: nextState });
    }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setToast({
        message: t('linkCopied'),
        type: 'success',
      });
      setTimeout(() => setToast(null), 500);
    });
  };

  useEffect(() => {
    if (!searchWrapperRef.current) return;

    const observer = new ResizeObserver((entries) => {
      setSearchWrapperHeight(entries[0].contentRect.height);
    });

    observer.observe(searchWrapperRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.Header}>
      <div className={styles.LogoDiv}>
        <BrandingImage
          imageKey="logo"
          alt={`${branding.appName} logo`}
          className={styles.Logo}
          onClick={() => navigate('/')}
          fallbackSrc={`ochoIconFull.svg`}
        />
      </div>

      {/* Desktop menu */}
      <div className={styles.SearchWrapper} ref={filterPanelRef}>
        <GlobalSearchBar
          onSearch={(query) => handleSearchWithUrl(query)}
          placeholder={t('exemple')}
          initialValue={searchQuery}
          onFilterClick={() => setShowFilters(!showFilters)}
          onFavoriteClick={() => handleToggleFavorites()}
          isFavoriteActive={showFavorites}
          onShareClick={() => handleShare()}
          activeFiltersCount={activeFiltersCount}
          selectedTags={filters.tags}
          onRemoveTag={(tag) =>
            handleTagsChange(filters.tags.filter((t) => t !== tag))
          }
        />
        {showFilters && (
          <div
            className={styles.FilterPanelWrapper}
            style={{ top: `calc(${searchWrapperHeight}px + 0.5rem)` }}
          >
            <div className={styles.FilterPanelContainer}>
              <FilterPanel
                onTagsChange={handleTagsChange}
                onUsersChange={handleUsersChange}
                onDateFilter={handleDateFilter}
                closePanel={() => setShowFilters(false)}
                onResetFilters={handleResetFilters}
                initialTags={filters.tags}
                initialUsers={filters.users}
                initialStartDate={filters.startDate}
                initialEndDate={filters.endDate}
              />
            </div>
          </div>
        )}
      </div>

      <div className={styles.RightActions}>
        <div className={styles.NavBadge}>
          <NavItems />
        </div>
        <div className={styles.ProfilBadge}>
          {username && <UserBadge username={username} />}
        </div>
      </div>

      {/* Hamburger icon for mobile */}
      <div className={styles.Hamburger} onClick={toggleMenu}>
        <div />
        <div />
        <div />
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className={styles.MobileMenu}>
          <div className={navStyles.navItem}>
            <button
              type="button"
              className={navStyles.navItem1}
              onClick={() => {
                navigate('/events-home');
                closeMenu();
              }}
            >
              {t('streaming')}
            </button>
          </div>
          <div className={navStyles.navItem}>
            <button
              type="button"
              className={navStyles.navItem1}
              onClick={() => {
                navigate('/videos');
                closeMenu();
              }}
            >
              {t('videos')}
            </button>
          </div>
          {isAdmin && (
            <div className={navStyles.navItem}>
              <button
                type="button"
                className={navStyles.navItem1}
                onClick={() => {
                  navigate('/admin');
                  closeMenu();
                }}
              >
                {t('adminPanel')}
              </button>
            </div>
          )}
          <Button
            label={t('publishVideo')}
            onClick={() => {
              navigate('/video/video-settings');
              closeMenu();
            }}
          />
          {username && <UserBadge username={username} />}
        </div>
      )}
    </div>
  );
};

export default Header;
