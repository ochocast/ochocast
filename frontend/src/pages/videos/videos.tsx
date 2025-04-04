import React, { useEffect, useState } from 'react';
import style from './videos.module.css';

import { FC } from 'react';
import {
  // getTags,
  // getUsers,
  getVideos,
} from '../../utils/api';
import {
  // Tag_video,
  // User,
  Video,
} from '../../utils/VideoProperties';
import LoadingCircle from '../../components/ReworkComponents/LoadingCircle/LoadingCircle';
// import SideSearchBar from '../../components/ReworkComponents/SideSearchBar/SideSearchBar';
// import Card from '../../components/ReworkComponents/Cards/Card';
import Thumbnail from '../../components/ReworkComponents/video/Thumbnail/Thumbnail';
import logger from '../../utils/logger';
import SearchBar, {
  SearchBarIcon,
} from '../../components/ReworkComponents/video/navigation/SearchBar/SearchBar';

interface VideosProps {}

const Videos: FC<VideosProps> = () => {
  const [videos, setVideo] = useState<Video[]>([]);
  // const [tags_list, setTagList] = useState<Tag_video[]>([]);
  // const [user_list, setUserList] = useState<User[]>([]);
  const userString = localStorage.getItem('backendUser');
  const [isLoading, setIsLoading] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [users, setUsers] = useState<string[]>([]);

  // Simuler un appel API pour récupérer des vidéos
  const getMe = async () => {
    setIsLoading(true);
    try {
      const videosResponse = await getVideos();
      setVideo(videosResponse.data || []);
      // const tagResponse = await getTags();
      // setTagList(tagResponse.data);
      // const userResponse = await getUsers();
      // setUserList(userResponse.data);
    } catch (error) {
      logger.error('Error fetching videos:', error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    getMe();
  }, [userString]);

  const filteredVideos = Array.isArray(videos)
    ? videos.filter((video) => {
        const videoTagsList = video.tags?.map((tag) => tag.name);
        let videoUsersList: string[] = [];
        if (video.internal_speakers != undefined) {
          videoUsersList = video.internal_speakers.map((user) => {
            return user.firstName + ' ' + user.lastName;
          });
        }
        const temp_title = video.title.toLowerCase();
        const matchesKeywords = keywords.every((keyword) =>
          temp_title.includes(keyword.toLowerCase()),
        );
        const matchesTags = tags.every((tag) => videoTagsList.includes(tag));
        const matchesUsers = users.every((user) =>
          videoUsersList.includes(user),
        );
        return matchesKeywords && matchesTags && matchesUsers;
      })
    : [];

  const handleSearch = (
    keywords: string[],
    tags: string[],
    users: string[],
  ) => {
    setKeywords(keywords);
    setTags(tags);
    setUsers(users);
  };

  if (isLoading) {
    return <LoadingCircle />;
  }

  return (
    <div className={style.videos}>
      <div className={style.display}>
        <div className={style.display1}>
          <SearchBar
            onClick={(query) => {
              handleSearch([query], [], []);
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
              <Thumbnail
                key={video.id}
                Id={video.id}
                title={video.title}
                createBy={video.creator.firstName}
                views={video.views}
                createdAt={video.createdAt.toString()}
                tags={video.tags && video.tags?.map((tag) => tag.name)}
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

export default Videos;
