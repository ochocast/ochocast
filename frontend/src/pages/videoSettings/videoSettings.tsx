import './videoSettings.css';

import { useState, ChangeEvent, FC, useEffect } from 'react';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/newComponents/Card/Card';

import Button from '../../components/buttons/button/button';
import Toggle from '../../components/newComponents/Toggle/Toggle';
import InputFile from '../../components/newComponents/inputFile/InputFile';
import UserProfile from '../../components/newComponents/User profile/UserProfile';
import Tag from '../../components/newComponents/Tag/Tag';
import Lock_Open from '../../assets/Opened_PNG.png';
import Lock_Close from '../../assets/Locked_PNG.png';
import PreviewMinia from '../../components/newComponents/Preview miniature/PrewiewMinia';
import { v4 as uuidv4 } from 'uuid';
import {
  createVideo,
  getVideoByTitle,
  getUsers,
  getTags,
  createTag,
} from '../../utils/api';
import { Tag_video, User } from '../../utils/VideoProperties';
import CompletionBar from '../../components/newComponents/CompletionBar/CompletionBar';

interface VideoSettingsProps {}

const VideoSettings: FC<VideoSettingsProps> = () => {
  const navigate = useNavigate();
  const userId = localStorage.getItem('backendUser');

  const [title, setTitle] = useState('');
  const handleTitleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
  };

  const [privacy, setPrivacy] = useState(false);
  const handlePrivacyChange = () => {
    setPrivacy(!privacy);
  };

  const [description, setDescription] = useState('');
  const handleDescriptionChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value);
  };

  const [media, setMedia] = useState<File>();
  const handleMediaChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files != null && e.target.files != undefined) {
      const media_tmp = e.target.files[0];
      if (media_tmp != undefined) setMedia(media_tmp);
    }
  };

  /*
  const [support, setSupport] = useState<File>();
  const handleSupportChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files != null && e.target.files != undefined)
      setSupport(e.target.files[0]);
  };*/

  const [miniature, setMiniature] = useState<File>();
  const handleMiniatureChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files != null && e.target.files != undefined) {
      const miniature_tmp = e.target.files[0];
      if (miniature_tmp != undefined) setMiniature(miniature_tmp);
    }
  };

  const [user_list, setUserList] = useState<User[]>([]);
  const [intern_speakers, setIntern_Speakers] = useState<User[]>([]);
  const [intern_tags, setIntern_tags] = useState<string[]>([]);
  const intern_filter = () => {
    const list: string[] = [];
    user_list.forEach((obj) => {
      if (!intern_speakers.includes(obj)) {
        list.push(obj.firstName + ' ' + obj.lastName);
      }
    });
    return list;
  };
  const selectIntern = (str: string) => {
    const user = user_list.find((obj) => {
      return obj.firstName + ' ' + obj.lastName === str;
    });
    if (user) {
      setIntern_Speakers([...intern_speakers, user]);
      setIntern_tags([...intern_tags, str]);
    }
  };

  const [tag_list, setTagList] = useState<Tag_video[]>([]);
  const [tags, setTags] = useState<Tag_video[]>([]);
  const [tags_tags, setTags_tags] = useState<string[]>([]);
  const tag_filter = () => {
    const list: string[] = [];
    tag_list.forEach((obj) => {
      if (!tags.includes(obj)) list.push(obj.name);
    });
    return list;
  };
  const selectTag = (str: string) => {
    const tag = tag_list.find((obj) => {
      return obj.name === str;
    });
    if (tag !== undefined) {
      setTags([...tags, tag]);
      setTags_tags([...intern_tags, str]);
    }
  };
  const addTag = async (str: string) => {
    await createTag({"name": str});
    const response = await getTags();
    if (response != null && response.status === 200)
      setTagList([...response.data]);
    else
      setTagList([]);
  }

  const publishVideo = async () => {
    setTags([...tags, { id: uuidv4(), name: 'Tag1' }]);
    const list_by_title = (await getVideoByTitle(title)).data;
    if (
      media == undefined ||
      title == '' ||
      tags.length == 0 ||
      list_by_title.length != 0
    ) {
      alert('Les conditions de publications ne sont pas remplies');
      return;
    }
    //search title in DB
    const form = new FormData();
    if (media != undefined) {
      form.append('file', media);
      form.append('media_id', media.name);
    }
    if (miniature != undefined) {
      form.append('miniature', miniature);
      form.append('miniature_id', miniature.name);
    }
    form.append('title', title);
    form.append('description', description);
    const backendUser = localStorage.getItem('backendUser');
    if (backendUser != null && backendUser != undefined) {
      form.append('creator', JSON.parse(backendUser).id);
    }

    // Ajoutez les champs qui sont des objets ou des tableaux sous forme de JSON
    form.append('tags', JSON.stringify(tags));
    form.append('internal_speakers', JSON.stringify(intern_tags));
    form.append('external_speakers', 'External Speaker Names');
    form.append(
      'comments',
      JSON.stringify([{ id: uuidv4(), content: 'Great video!' }]),
    );

    await createVideo(form);
    navigate('/videos');
  };

  useEffect(() => {
    const get_users_list = async () => {
      const response = await getUsers();
      if (response != null && response.status === 200)
        setUserList([...response.data]);
      else
        setUserList([]);
    };
    const get_tags_list = async () => {
      const response = await getTags();
      if (response != null && response.status === 200)
        setTagList([...response.data]);
      else
        setTagList([]);
    };
    get_users_list();
    get_tags_list();
  }, [userId]);

  return (
    <div className="mainvideo">
      <div className="container">
        <Card style={{ flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              flexDirection: 'row',
              height: 'fit-content',
            }}
          >
            <div></div>
            <Card
              style={{
                height: 'fit-content',
                width: 'fit-content',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <input placeholder="Title" onChange={handleTitleChange} />
            </Card>
            <img className="Closed Lock" src={Lock_Close} alt="Closed Lock" />
            <Toggle onChange={handlePrivacyChange} />
            <img className="Opened Lock" src={Lock_Open} alt="Opened Lock" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'row' }}>
            <Card>
              <InputFile
                placeholder="Glissez ou choisissez votre Média"
                onChange={handleMediaChange}
              />
              <InputFile
                placeholder="Glissez ou choisissez votre Miniature"
                onChange={handleMiniatureChange}
              />
            </Card>
          </div>
          <div style={{ display: 'flex', flexDirection: 'row' }}>
            <Card style={{ flexDirection: 'column', height: 'auto' }}>
              <CompletionBar
                name="Tags"
                filter={tag_filter}
                select={selectTag}
                add={addTag}
              />
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: '10px',
                }}
              >
                {tags_tags.map((tag, index) => (
                  <Tag
                    className={tag}
                    style={{ flex: '25%' }}
                    tsize="10px"
                    marginTop="0px"
                    key={index}
                  >
                    {tag}
                  </Tag>
                ))}
              </div>
            </Card>
            <Card style={{ flexDirection: 'column', height: 'auto' }}>
              <CompletionBar
                name="Intern"
                filter={intern_filter}
                select={selectIntern}
              />
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: '10px',
                }}
                id="intern-container"
              >
                {intern_tags.map((tag, index) => (
                  <Tag
                    className={tag}
                    style={{ flex: '25%' }}
                    tsize="10px"
                    marginTop="0px"
                    key={index}
                  >
                    {tag}
                  </Tag>
                ))}
              </div>
            </Card>
            <Card style={{ flexDirection: 'column', height: 'auto' }}>
              <div>Externe</div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: '10px',
                  width: '100%',
                  height: '100%',
                }}
              >
                <textarea style={{ resize: 'none' }}></textarea>
              </div>
            </Card>
          </div>
          <Card bcolor="#EDEDED">
            <textarea
              placeholder="Description"
              style={{ resize: 'none' }}
              onChange={handleDescriptionChange}
            />
          </Card>
          <div className="buttonContainer">
            <Button>Enregistrer en Brouillon</Button>
            <Button onClick={publishVideo}>Publier la vidéo</Button>
          </div>
        </Card>
      </div>
      <div className="generalinfo">
        <UserProfile></UserProfile>
        <PreviewMinia></PreviewMinia>
      </div>
      {/* 
      <Tag className='primary' >Test Primary</Tag>
      <Tag className='secondary' tsize='15px' >Test Secondary</Tag> */}
    </div>
  );
};

export default VideoSettings;
