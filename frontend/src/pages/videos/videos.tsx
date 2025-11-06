import React, { useEffect, useState } from 'react';
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
import SharedButtonIcon from '../../assets/sharedButton.svg';

interface VideosProps {}

interface SearchState {
  q: string;
  tags: string[];
  users: string[];
  dateFrom: string | null;
  dateTo: string | null;
  favoris: boolean;
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
  }>({
    tags: [],
    users: [],
    startDate: null,
    endDate: null,
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
  });

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
      logger.error('Error fetching suggestions:', error);
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
        logger.error('Error fetching videos:', error);
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

    setFilteredVideos(result);
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
      logger.error('Error toggling favorite filter:', error);
    }
  };

  const handleSearchWithUrl = (query: string) => {
    setSearchQuery(query);
    setSearchState({ q: query });
    handleSearch([query]);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setToast({
        message: 'Lien copié dans le presse-papiers',
        type: 'success',
      });
      setTimeout(() => setToast(null), 500);
    });
  };

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
            />
            <button
              className={style.filterToggleButton}
              onClick={() => setShowFilters(!showFilters)}
            >
              <img src={FilterIcon} alt="Filter icon" />
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
              className={`${style.sharedButtonIcon} ${style.smallButton}`}
              src={SharedButtonIcon}
              alt="Partager les filtres"
              onClick={handleShare}
            />
          </div>
          {showFilters && (
            <div className={style.filterPanelWrapper}>
              <FilterPanel
                onTagsChange={handleTagsChange}
                onUsersChange={handleUsersChange}
                onDateFilter={handleDateFilter}
                closePanel={() => setShowFilters(false)}
                initialTags={filters.tags}
                initialUsers={filters.users}
                initialStartDate={filters.startDate}
                initialEndDate={filters.endDate}
              />
            </div>
          )}
        </div>

        <div className={style.video_row}>
          {filteredVideos.length > 0 ? (
            filteredVideos.map((video) => (
              <Thumbnail
                key={video.id}
                Id={video.id}
                title={video.title}
                createBy={
                  video.creator?.username ||
                  `${video.creator?.firstName ?? ''} ${video.creator?.lastName ?? ''}`.trim()
                }
                views={video.views}
                createdAt={video.createdAt.toString()}
                tags={video.tags?.map((tag) => tag.name)}
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
