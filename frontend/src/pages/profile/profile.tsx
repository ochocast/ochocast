import React, { useCallback, useEffect, useState } from 'react';
import style from './profile.module.css';
import { useTranslation } from 'react-i18next';

import { FC } from 'react';
import {
  // getTags,
  getUsers,
  getVideosByUser,
} from '../../utils/api';
import {
  // Tag_video,
  User,
  Video,
} from '../../utils/VideoProperties';
import LoadingCircle from '../../components/ReworkComponents/LoadingCircle/LoadingCircle';
import Thumbnail from '../../components/ReworkComponents/video/Thumbnail/Thumbnail';
import ProfileDescription, {
  ProfileDescriptionState,
} from '../../components/ReworkComponents/profil/ProfileDescription/ProfileDescription';
import NotFoundPage from '../notFound/notFound';
import { deleteVideo } from '../../utils/api';
import SearchBar, {
  SearchBarIcon,
} from '../../components/ReworkComponents/video/navigation/SearchBar/SearchBar';

interface ProfileProps {}

const Profile: FC<ProfileProps> = () => {
  const [videos, setVideo] = useState<Video[]>([]);
  const { t } = useTranslation();
  // const [tags_list, setTagList] = useState<Tag_video[]>([]);
  const userString = localStorage.getItem('backendUser');
  const [isLoading, setIsLoading] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Simuler un appel API pour récupérer des vidéos
  const getMe = useCallback(async () => {
    setIsLoading(true);
    try {
      const videosResponse = await getVideosByUser(JSON.parse(userString!).id);
      setVideo(videosResponse.data || []);
      // const tagResponse = await getTags();
      // setTagList(tagResponse.data);
      const userResponse = await getUsers();

      if (userString) {
        const backendUser = JSON.parse(userString);
        const userId = backendUser.id;
        const user = userResponse.data.find((u: User) => u.id === userId);
        setCurrentUser(user || null);
      }
    } catch (error) {
      console.error('Error fetching videos:', error);
    }
    setIsLoading(false);
  }, [userString]);

  useEffect(() => {
    getMe();
  }, [getMe]);

  const filteredVideos = videos.filter((video) => {
    console.log(videos);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const videoTagsList: any = video.tags.map((tag) => tag.name);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const temp_title = video.title.toLowerCase();
    const matchesKeywords = keywords.every((keyword) =>
      temp_title.includes(keyword.toLowerCase()),
    );
    const matchesTags = tags.every((tag) => videoTagsList.includes(tag));
    return matchesKeywords && matchesTags;
  });

  const ArchivedVideo = (id: string) => {
    deleteVideo(id).then(() => {
      window.location.reload();
    });
    getMe();
  };

  const handleSearch = (keywords: string[], tags: string[]) => {
    setKeywords(keywords);
    setTags(tags);
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
          name={currentUser ? currentUser.firstName : t('unknown')}
          email={currentUser ? currentUser.email : t('unknownEmail')}
          description={
            currentUser ? currentUser.description : t('noDescription')
          }
          image={
            currentUser
              ? currentUser.picture_id || '/persona.png'
              : '/persona.png'
          }
          state={ProfileDescriptionState.large}
        />

        <div className={style.display1}>
          <SearchBar
            onClick={(query) => {
              handleSearch([query], []);
            }}
            needInput={true}
            placeholder={t('exemple')}
            icon={SearchBarIcon.SEARCH}
          />

          {/* <SideSearchBar
            onSearch={handleSearch}
            tags={tags_list}
            users={user_list}
          /> */}
        </div>

        <div className={style.video_row}>
          {filteredVideos.length > 0 ? (
            filteredVideos.map((video) => (
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
    </div>
  );
};

export default Profile;
