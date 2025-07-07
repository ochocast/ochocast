import React, { useCallback, useEffect, useState } from 'react';
import style from './profile.module.css';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import Toast from '../../components/ReworkComponents/generic/Toast/Toast';

import { FC } from 'react';
import {
  getSuggestions,
  getUsers,
  getVideosByUser,
  deleteVideo,
} from '../../utils/api';

import { User, Video } from '../../utils/VideoProperties';

import LoadingCircle from '../../components/ReworkComponents/LoadingCircle/LoadingCircle';
import Thumbnail from '../../components/ReworkComponents/video/Thumbnail/Thumbnail';
import ProfileDescription, {
  ProfileDescriptionState,
} from '../../components/ReworkComponents/profil/ProfileDescription/ProfileDescription';
import NotFoundPage from '../notFound/notFound';
import SearchBar, {
  SearchBarIcon,
} from '../../components/ReworkComponents/navigation/SearchBar/SearchBar';

const PERSONA_IMAGE = '/persona.png';

interface ProfileProps {}

const Profile: FC<ProfileProps> = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [toast, setToast] = useState<{
    message: string;
    type?: 'success' | 'error' | 'info';
  } | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const userString = localStorage.getItem('backendUser');
  const [isLoading, setIsLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const getMe = useCallback(async () => {
    setIsLoading(true);
    try {
      const backendUser = JSON.parse(userString!);
      const videosResponse = await getVideosByUser(backendUser.id);
      setVideos(videosResponse.data || []);

      const userResponse = await getUsers();
      const user = userResponse.data.find((u: User) => u.id === backendUser.id);
      setCurrentUser(user || null);
    } catch (error) {
      console.error('Error fetching videos:', error);
    }
    setIsLoading(false);
  }, [userString]);

  useEffect(() => {
    getMe();
  }, [getMe]);

  useEffect(() => {
    if (location.state?.toast) {
      setToast(location.state.toast);
      navigate(location.pathname, { replace: true, state: {} });
    }
    const timer = setTimeout(() => setToast(null), 2000);

    return () => clearTimeout(timer);
  }, [location.state, navigate, location.pathname]);

  const ArchivedVideo = (id: string) => {
    deleteVideo(id).then(() => {
      window.location.reload();
    });
  };

  const handleSearch = async (keywords: string[]) => {
    try {
      if (keywords[0] !== '') {
        const response = await getSuggestions(keywords[0]);
        setVideos(response.data || []);
      } else {
        const backendUser = JSON.parse(userString!);
        const videosResponse = await getVideosByUser(backendUser.id);
        setVideos(videosResponse.data || []);
      }
    } catch (error) {
      console.error('Error fetching suggestions:', error);
    }
  };

  if (userString === null) {
    return <NotFoundPage />;
  }

  if (isLoading) {
    return <LoadingCircle />;
  }

  return (
    <div className={style.videos}>
      <div className={style.display}>
        <ProfileDescription
          firstname={currentUser ? currentUser.firstName : t('unknown')}
          lastname=""
          email={currentUser ? currentUser.email : t('unknownEmail')}
          description={
            currentUser ? currentUser.description : t('noDescription')
          }
          image={
            currentUser
              ? currentUser.picture_id || PERSONA_IMAGE
              : PERSONA_IMAGE
          }
          state={ProfileDescriptionState.large}
        />

        <div className={style.display1}>
          <SearchBar
            onClick={(query) => {
              handleSearch([query]);
            }}
            needInput={true}
            placeholder={t('noDescription')}
            icon={SearchBarIcon.SEARCH}
          />
        </div>

        <div className={style.video_row}>
          {videos.length > 0 ? (
            videos.map((video) => (
              <Thumbnail
                key={video.id}
                Id={video.id}
                title={video.title}
                createBy={video.creator.firstName}
                views={video.views}
                createdAt={video.createdAt.toString()}
                tags={video.tags && video.tags?.map((tag) => tag.name)}
                onArchived={ArchivedVideo}
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

export default Profile;
