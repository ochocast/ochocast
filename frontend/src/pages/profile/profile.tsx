import React, { useEffect, useState } from 'react';
import './profile.css';
import { FC } from 'react';
import { getTags, getUsers, getVideos } from '../../utils/api';
import { Tag_video, User, Video } from '../../utils/VideoProperties';
import LoadingCircle from '../../components/newComponents/LoadingCircle/LoadingCircle';
import SideSearchBar from '../../components/ReworkComponents/SideSearchBar/SideSearchBar';
import Card from '../../components/ReworkComponents/Cards/Card';
import PreviewMiniture from '../../components/ReworkComponents/PreviewMiniture/PreviewMiniture';
import ProfilDescription, {
  ProfilDescriptionState,
} from '../../components/ReworkComponents/ProfilDescription/ProfilDescription';

interface ProfileProps {}

const Profile: FC<ProfileProps> = () => {
  const [videos, setVideo] = useState<Video[]>([]);
  const [tags_list, setTagList] = useState<Tag_video[]>([]);
  const [user_list, setUserList] = useState<User[]>([]);
  const userString = localStorage.getItem('backendUser');
  const [isLoading, setIsLoading] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [users, setUsers] = useState<string[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Simuler un appel API pour récupérer des vidéos
  const getMe = async () => {
    setIsLoading(true);
    try {
      const videosResponse = await getVideos();
      setVideo(videosResponse.data || []);
      const tagResponse = await getTags();
      setTagList(tagResponse.data);
      const userResponse = await getUsers();
      setUserList(userResponse.data);

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
  };

  useEffect(() => {
    getMe();
  }, [userString]);

  const filteredVideos = videos.filter((video) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const videoTagsList: any = []; // video.tags.map((tag) => tag.name);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const videoUsersList: any = []; //video.internal_speakers.map((user) => {
    //   return user.firstName + ' ' + user.lastName;
    // });
    const temp_title = video.title.toLowerCase();
    const matchesKeywords = keywords.every((keyword) =>
      temp_title.includes(keyword.toLowerCase()),
    );
    const matchesTags = tags.every((tag) => videoTagsList.includes(tag));
    const matchesUsers = users.every((user) => videoUsersList.includes(user));
    return matchesKeywords && matchesTags && matchesUsers;
  });

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
    <div className="videos">
      <div className="display">
        <div className="display1">
          <SideSearchBar
            onSearch={handleSearch}
            tags={tags_list}
            users={user_list}
          />
        </div>
        <div className="RightFlexUpDown">
          <ProfilDescription
            name={currentUser ? currentUser.firstName : 'Unknown'}
            email={currentUser ? currentUser.email : 'No email'}
            description={
              currentUser ? currentUser.description : 'No description'
            }
            image={
              currentUser
                ? currentUser.picture_id || '/persona.png'
                : '/persona.png'
            }
            state={ProfilDescriptionState.large}
          />
          <Card>
            <h1>Last Published</h1>
            <div className="video_row">
              {filteredVideos.length > 0 ? (
                filteredVideos.map((video) => (
                  <PreviewMiniture
                    key={video.id}
                    Id={video.id}
                    title={video.title}
                    imageSrc={video.miniature_id}
                    createBy={video.creator.firstName}
                    views={video.views}
                    createdAt={video.createdAt.toString()}
                    tags={video.tags && video.tags?.map((tag) => tag.name)}
                  />
                ))
              ) : (
                <h1>No Video Found</h1>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Profile;
