import React, { useCallback, useEffect, useState } from 'react';
import style from './profile.module.css';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Toast from '../../components/ReworkComponents/generic/Toast/Toast';

import { FC } from 'react';
import {
  searchVideos,
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

const PERSONA_IMAGE = '/branding/persona.png';

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
  const { username } = useParams<{ username?: string }>();
  const [cardsPerRow] = useState<number>(
    parseInt(localStorage.getItem('cardsPerRow') || '6'),
  );

  const fetchUserData = useCallback(
    async (userId: string, isCurrentUserProfile: boolean = false) => {
      try {
        const videosResponse = await getVideosByUser(userId);
        setVideos(videosResponse.data || []);

        const userResponse = await getUsers();
        const user = userResponse.data.find((u: User) => u.id === userId);
        setCurrentUser(user || null);

        // Si l'utilisateur a un username, on met à jour l'URL
        if (user?.username && !username && isCurrentUserProfile) {
          console.log(username);
          navigate(`/profile/${user.username}`, { replace: true });
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    },
    [username, navigate],
  );

  const getMe = useCallback(async () => {
    setIsLoading(true);
    try {
      if (username) {
        // Si on a un firstName dans l'URL, on cherche l'utilisateur correspondant
        const userResponse = await getUsers();
        const user = userResponse.data.find(
          (u: User) => u.username?.toLowerCase() === username.toLowerCase(),
        );
        if (user) {
          await fetchUserData(user.id, false);
        } else {
          // Si l'utilisateur n'est pas trouvé, on redirige vers la page 404
          navigate('/404', { replace: true });
        }
      } else if (userString) {
        // Si pas de firstName dans l'URL mais utilisateur connecté, on utilise son ID
        const backendUser = JSON.parse(userString);
        await fetchUserData(backendUser.id, true);
      }
    } catch (error) {
      console.error('Error fetching user:', error);
    }
    setIsLoading(false);
  }, [userString, username, fetchUserData, navigate]);

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
        const response = await searchVideos(keywords[0]);
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

  if (!userString && !username) {
    return <NotFoundPage />;
  }

  if (isLoading) {
    return <LoadingCircle />;
  }

  // Vérifier si c'est l'utilisateur courant
  const isCurrentUser = userString
    ? JSON.parse(userString).id === currentUser?.id
    : false;

  return (
    <div className={style.videos}>
      <div className={style.display}>
        <ProfileDescription
          firstname={currentUser ? currentUser.firstName : t('unknown')}
          lastname=""
          username={currentUser ? currentUser.username : t('unknown')}
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
          isCurrentUser={isCurrentUser}
        />

        <div className={style.videoTitle}>
          <h1>{t('videos')}</h1>
        </div>

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

        <div className={style.video_row} data-cards-per-row={cardsPerRow}>
          {videos.length > 0 ? (
            videos.map((video) => (
              <Thumbnail
                key={video.id}
                Id={video.id}
                title={video.title}
                createBy={
                  video.creator.username ||
                  `${video.creator.firstName} ${video.creator.lastName}`
                }
                createdAt={video.createdAt.toString()}
                tags={
                  video.tags &&
                  video.tags
                    ?.map((tag) => tag.name)
                    .sort((a, b) => a.localeCompare(b))
                }
                onArchived={ArchivedVideo}
                showEditButton={isCurrentUser}
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

export default Profile;
