import React, { useEffect, useState, useRef, useCallback } from 'react';
import style from './videos.module.css';
import { useTranslation } from 'react-i18next';

import { FC } from 'react';
import { getVideos, searchVideos } from '../../utils/api';
import { Video } from '../../utils/VideoProperties';
import LoadingCircle from '../../components/ReworkComponents/LoadingCircle/LoadingCircle';
import Thumbnail from '../../components/ReworkComponents/video/Thumbnail/Thumbnail';
import logger from '../../utils/logger';
import SearchBar, {
  SearchBarIcon,
} from '../../components/ReworkComponents/navigation/SearchBar/SearchBar';
import FilterPanel from '../../components/ReworkComponents/navigation/FilterPanel/FilterPanel';
import FilterIcon from '../../assets/filter_icon.svg';
import FavorisFilterNotSelected from '../../assets/FavorisFilterNotSelected.svg';
import FavorisFilterSelected from '../../assets/FavorisFilterSelected.svg';
import { getFavoriteVideos } from '../../utils/api';
import Toast from '../../components/ReworkComponents/generic/Toast/Toast';
import { useLocation, useNavigate } from 'react-router-dom';
import CopyButtonIcon from '../../assets/copy.svg';

interface VideosProps {}

interface SearchState {
  q: string;
  tags: string[];
  users: string[];
  dateFrom: string | null;
  dateTo: string | null;
  favoris: boolean;
  archived: boolean | null;
}

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

const useUrlStateSync = (initialState: SearchState) => {
  const [state, setState] = useState<SearchState>(initialState);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const parsedState = parseQueryParams(location.search);
    setState(parsedState);
  }, [location.search]);

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

const Videos: FC<VideosProps> = () => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [filteredVideos, setFilteredVideos] = useState<Video[]>([]);
  const userString = localStorage.getItem('backendUser');
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();
  const [showFavorites, setShowFavorites] = useState(false);
  const user = userString ? JSON.parse(userString) : null;
  const location = useLocation();
  const navigate = useNavigate();
  const [toast, setToast] = useState<{
    message: string;
    type?: 'success' | 'error' | 'info';
  } | null>(null);
  const [cardsPerRow, setCardsPerRow] = useState<number>(
    parseInt(localStorage.getItem('cardsPerRow') || '6'),
  );
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (location.state?.toast) {
      setToast(location.state.toast);
      navigate(location.pathname, { replace: true, state: {} });
    }
    const timer = setTimeout(() => setToast(null), 2000);

    return () => clearTimeout(timer);
  }, [location.state, navigate, location.pathname]);

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

  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [searchState, setSearchState] = useUrlStateSync({
    q: '',
    tags: [],
    users: [],
    dateFrom: null,
    dateTo: null,
    favoris: false,
    archived: false,
  });

  const isFirstLoadRef = useRef(true);

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
      logger.error({ err: error }, 'Error fetching suggestions');
    }
  }, []);

  useEffect(() => {
    applyFilters(filters);
  });

  // Synchroniser les filtres avec l'état URL
  useEffect(() => {
    const updatedFilters = {
      tags: searchState.tags,
      users: searchState.users,
      startDate: searchState.dateFrom ? new Date(searchState.dateFrom) : null,
      endDate: searchState.dateTo ? new Date(searchState.dateTo) : null,
      archived: searchState.archived,
    };
    setFilters(updatedFilters);
    setShowFavorites(searchState.favoris);
    setSearchQuery(searchState.q);

    if (searchState.q !== searchQuery) {
      handleSearch([searchState.q]);
    }
  }, [
    searchState.q,
    searchState.tags,
    searchState.users,
    searchState.dateFrom,
    searchState.dateTo,
    searchState.favoris,
    searchState.archived,
    searchQuery,
    handleSearch,
  ]);

  useEffect(() => {
    const fetchVideos = async () => {
      setIsLoading(true);
      try {
        const res = await getVideos();
        const allVideos = res.data || [];
        setVideos(allVideos);
        setFilteredVideos(allVideos);
      } catch (error) {
        logger.error({ err: error }, 'Error fetching videos');
      }
      setIsLoading(false);
    };

    fetchVideos();
  }, [userString]);

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

    // Sort by creation date descending
    result.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    setFilteredVideos(result);
  };

  const handleTagClick = (tag: string) => {
    const updatedTags = filters.tags.includes(tag)
      ? filters.tags.filter((t) => t !== tag)
      : [...filters.tags, tag];
    handleTagsChange(updatedTags);
  };

  const handleCardsPerRowChange = (value: number) => {
    const clampedValue = Math.max(5, Math.min(8, value));
    setCardsPerRow(clampedValue);
    localStorage.setItem('cardsPerRow', clampedValue.toString());
  };

  const handleTagsChange = (tags: string[]) => {
    const updated = { ...filters, tags };
    setFilters(updated);
    applyFilters(updated);
    setSearchState({
      tags,
      dateFrom: updated.startDate?.toISOString() || null,
      dateTo: updated.endDate?.toISOString() || null,
    });
  };

  const handleUsersChange = (users: string[]) => {
    const updated = { ...filters, users };
    setFilters(updated);
    applyFilters(updated);
    setSearchState({
      users,
      dateFrom: updated.startDate?.toISOString() || null,
      dateTo: updated.endDate?.toISOString() || null,
    });
  };

  const handleDateFilter = (startDate: Date | null, endDate: Date | null) => {
    const updated = { ...filters, startDate, endDate };
    setFilters(updated);
    applyFilters(updated);
    setSearchState({
      dateFrom: startDate?.toISOString() || null,
      dateTo: endDate?.toISOString() || null,
    });
  };

  const handleToggleFavorites = async () => {
    if (!user?.id) return;

    const nextState = !showFavorites;
    setShowFavorites(nextState);
    setSearchState({ favoris: nextState });

    try {
      const response = nextState
        ? await getFavoriteVideos()
        : await getVideos();

      setVideos(response.data || []);
    } catch (error) {
      logger.error({ err: error }, 'Error toggling favorite filter');
    }
  };

  const handleResetFilters = () => {
    setFilters({
      tags: [],
      users: [],
      startDate: null,
      endDate: null,
      archived: null,
    });
    setSearchState({
      q: '',
      tags: [],
      users: [],
      dateFrom: null,
      dateTo: null,
      favoris: false,
      archived: null,
    });
    setShowFavorites(false);
  };

  const handleSearchWithUrl = useCallback(
    (query: string) => {
      setSearchQuery(query);
      setSearchState({ q: query });
      handleSearch([query]);
    },
    [handleSearch, setSearchState],
  );

  // On first load, wait for initial fetch to finish then simulate a user search once
  useEffect(() => {
    if (
      isFirstLoadRef.current &&
      !isLoading &&
      searchState.q &&
      searchState.q.trim() !== ''
    ) {
      handleSearchWithUrl(searchState.q);
      console.log('Initial search with query from URL:', searchState.q);
      isFirstLoadRef.current = false;
    }
  }, [isLoading, searchState.q, handleSearchWithUrl]);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setToast({
        message: t('linkCopied'),
        type: 'success',
      });
      setTimeout(() => setToast(null), 500);
    });
  };

  // Calculer le nombre de filtres actifs
  const activeFiltersCount =
    filters.tags.length +
    filters.users.length +
    (filters.startDate || filters.endDate ? 1 : 0) +
    (filters.archived !== null ? 1 : 0);

  if (isLoading) {
    return <LoadingCircle />;
  }

  return (
    <div className={style.videos}>
      <div className={style.display}>
        <div className={style.display1}>
          <div className={style.searchBarRow}>
            <SearchBar
              onClick={(query) => handleSearchWithUrl(query)}
              needInput={true}
              placeholder={t('exemple')}
              icon={SearchBarIcon.SEARCH}
              initialValue={searchQuery}
            />
            <button
              ref={filterButtonRef}
              className={style.filterToggleButton}
              onClick={() => setShowFilters(!showFilters)}
            >
              <img src={FilterIcon} alt="Filter icon" />
              {activeFiltersCount > 0 && (
                <span className={style.filterBadge}>{activeFiltersCount}</span>
              )}
            </button>
            <img
              className={style.starIconFilterContainer}
              src={
                showFavorites ? FavorisFilterSelected : FavorisFilterNotSelected
              }
              onClick={handleToggleFavorites}
              alt="Filtrer par favoris"
            />
            <img
              className={`${style.copyButtonIcon} ${style.smallButton}`}
              src={CopyButtonIcon}
              alt="Partager les filtres"
              onClick={handleShare}
            />
          </div>
          {showFilters && (
            <div
              className={style.filterPanelWrapper}
              onClick={() => setShowFilters(false)}
            >
              <div ref={filterPanelRef} onClick={(e) => e.stopPropagation()}>
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
                  onCardsPerRowChange={handleCardsPerRowChange}
                  initialCardsPerRow={cardsPerRow}
                />
              </div>
            </div>
          )}
        </div>

        <div className={style.video_row} data-cards-per-row={cardsPerRow}>
          {filteredVideos.length > 0 ? (
            filteredVideos.map((video) => (
              <Thumbnail
                key={video.id}
                Id={video.id}
                title={video.title}
                creatorId={video.creator?.id || ''}
                createBy={
                  video.creator?.username ||
                  `${video.creator?.firstName ?? ''} ${video.creator?.lastName ?? ''}`.trim()
                }
                createdAt={video.createdAt.toString()}
                tags={video.tags
                  ?.map((tag) => tag.name)
                  .sort((a, b) => a.localeCompare(b))}
                onTagClick={handleTagClick}
                cropTags={true}
                duration={video.duration}
              />
            ))
          ) : (
            <h1>{t('noVideoFound')}</h1>
          )}
        </div>
      </div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default Videos;
