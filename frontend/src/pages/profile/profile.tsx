import React, { useCallback, useEffect, useState } from 'react';
import style from './profile.module.css';

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
import LoadingCircle from '../../components/newComponents/LoadingCircle/LoadingCircle';
import PreviewMiniture from '../../components/ReworkComponents/PreviewMiniture/PreviewMiniture';
import ProfilDescription, {
  ProfilDescriptionState,
} from '../../components/ReworkComponents/ProfilDescription/ProfilDescription';
import NotFoundPage from '../notFound/notFound';
import { deleteVideo } from '../../utils/api';
import SearchBar, {
  SearchBarIcon,
} from '../../components/ReworkComponents/SearchBar/SearchBar';

interface ProfileProps {}

const Profile: FC<ProfileProps> = () => {
  const [videos, setVideo] = useState<Video[]>([]);
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
    deleteVideo(id);
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
        <ProfilDescription
          name={currentUser ? currentUser.firstName : 'Inconnu'}
          email={
            currentUser ? currentUser.email : 'Adresse mail non renseignée'
          }
          description={
            currentUser ? currentUser.description : 'Aucune description'
          }
          image={
            currentUser
              ? currentUser.picture_id || '/persona.png'
              : '/persona.png'
          }
          state={ProfilDescriptionState.large}
        />

        <div className={style.display1}>
          <SearchBar
            onClick={(query) => {
              handleSearch([query], []);
            }}
            needInput={true}
            placeholder="Exemple: DevOps"
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
              <PreviewMiniture
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
            <h1>Aucune vidéo trouvée</h1>
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;
