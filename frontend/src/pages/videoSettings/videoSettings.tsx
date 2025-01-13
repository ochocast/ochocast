import './videoSettings.css';

import { useState, ChangeEvent, FC, useEffect } from 'react';
import React from 'react';
import { useNavigate } from 'react-router-dom';


import Card from '../../components/ReworkComponents/Cards/Card';
import { useParams } from 'react-router-dom';
// import Button from '../../components/buttons/button/button';

// import Toggle from '../../components/newComponents/Toggle/Toggle';
import InputFile from '../../components/newComponents/inputFile/InputFile';
import Tag from '../../components/newComponents/Tag/Tag';
// import Lock_Open from '../../assets/Opened_PNG.png';
// import Lock_Close from '../../assets/Locked_PNG.png';

// import PreviewMinia from '../../components/newComponents/Preview miniature/PrewiewMinia';

import { v4 as uuidv4 } from 'uuid';
import {
  createVideo,
  getVideoByTitle,
  getUsers,
  getTags,
  createTag,
  getVideo,
  modifyVideo,
} from '../../utils/api';
import { Tag_video, User } from '../../utils/VideoProperties';
import CompletionBar from '../../components/newComponents/CompletionBar/CompletionBar';

import { Video } from '../../utils/VideoProperties';

import PreviewMiniture from '../../components/ReworkComponents/PreviewMiniture/PreviewMiniture';
import { useAuth } from 'react-oidc-context';
import HomeCardButton, {
  ButtonState,
} from '../../components/ReworkComponents/Button/HomeCardButton/HomeCardButton';

// import PreviewMiniture from '../../components/ReworkComponents/PreviewMiniture/PreviewMiniture';
// import { useAuth } from 'react-oidc-context';

interface VideoSettingsProps {}

const VideoSettings: FC<VideoSettingsProps> = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  // const userId = localStorage.getItem('backendUser');
  const { videoId } = useParams();
  const [baseVideo, setBaseVideo] = useState<Video>();

  // const auth = useAuth();

  // const auth = useAuth();

  const [title, setTitle] = useState('');
  const handleTitleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
  };

  // const [privacy, setPrivacy] = useState(false);
  // const handlePrivacyChange = () => {
  //   setPrivacy(!privacy);
  // };

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
  const [miniatureUrl, setMiniatureUrl] = useState<string | null>(null);
  const handleMiniatureChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files != null && e.target.files != undefined) {
      const miniature_tmp = e.target.files[0];
      const reader = new FileReader();

      reader.onload = () => {
        // Vérifie explicitement que reader.result est bien une chaîne
        if (typeof reader.result === 'string') {
          setMiniatureUrl(reader.result); // Affecte l'URL de la preview
        } else {
          console.error("Le résultat du FileReader n'est pas une chaîne !");
        }
      };

      reader.readAsDataURL(miniature_tmp);
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
    await createTag({ name: str });
    const response = await getTags();
    if (response != null && response.status === 200)
      setTagList([...response.data]);
    else setTagList([]);
  };

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
    form.append('internal_speakers', JSON.stringify(intern_speakers));
    form.append('external_speakers', extern_User_List);
    form.append(
      'comments',
      JSON.stringify([{ id: uuidv4(), content: 'Great video!' }]),
    );
    if (videoId && baseVideo !== undefined) {
      if (baseVideo.createdAt !== undefined) {
        form.append('createdAt', JSON.stringify(baseVideo.createdAt));
      }
      if (baseVideo.views !== undefined) {
        form.append('views', JSON.stringify(baseVideo.views));
      }
      if (baseVideo.updatedAt !== undefined) {
        form.append('updatedAt', JSON.stringify(baseVideo.updatedAt));
      }

      await modifyVideo(form);
    } else {
      await createVideo(form);
    }
    navigate('/videos');
  };

  const updateVideo = async () => {};

  const [extern_User_List, setExternUserList] = useState('');
  const handleExternUserChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setExternUserList(e.target.value);
  };

  /*useEffect(() => {
    console.log(videoId);
    const get_users_list = async () => {
      const response = await getUsers();
      if (response != null && response !== undefined && response?.status === 200)
        setUserList([...response.data]);
      else setUserList([]);
    };
    const get_tags_list = async () => {
      const response = await getTags();
      if (response != null && response !== undefined && response?.status === 200)
        setTagList([...response.data]);
      else setTagList([]);
    };
    const get_video = async () => {
      const response = await getVideo(videoId);
      if (response != null && response !== undefined)
        setBaseVideo(response.data[0]);
      console.log(response.data);
      console.log(baseVideo);
    };
    const set_video = async () => {
      if(baseVideo?.title !== undefined)
        setTitle(baseVideo.title);
      if(baseVideo?.description !== undefined)
        setDescription(baseVideo.description);
      if(baseVideo?.external_speakers !== undefined)
        setExternUserList(baseVideo.external_speakers);
      if(baseVideo?.tags !== undefined){
        setTags(baseVideo.tags);
        setTags_tags(baseVideo.tags.flatMap((tag)=>{
          return tag.name;
        }));
      }    
      if(baseVideo?.internal_speakers !== undefined){
        setIntern_Speakers(baseVideo.internal_speakers);
        setIntern_tags(baseVideo.internal_speakers.flatMap((user) => {
          return user.firstName + " " + user.lastName;
        }));
      }
    };
    


    get_users_list();
    get_tags_list();
    if(videoId !== undefined){
      console.log("TOOTOTO");
      get_video();
      set_video();
    }
  }, [userId, videoId]);*/

  useEffect(() => {
    const get_users_list = async () => {
      const response = await getUsers();
      if (response?.status === 200) setUserList([...response.data]);
      else setUserList([]);
    };

    const get_tags_list = async () => {
      const response = await getTags();
      if (response?.status === 200) setTagList([...response.data]);
      else setTagList([]);
    };

    const get_video = async () => {
      const response = await getVideo(videoId);
      if (response) {
        setBaseVideo(response.data[0]); // Mets à jour baseVideo
        console.log(response.data[0]); // Vérifie les données reçues
      }
    };

    get_users_list();
    get_tags_list();

    if (videoId !== undefined) {
      get_video();
    }
  }, [videoId]);

  useEffect(() => {
    const set_video = () => {
      if (baseVideo?.title !== undefined) setTitle(baseVideo.title);
      if (baseVideo?.description !== undefined)
        setDescription(baseVideo.description);
      if (baseVideo?.external_speakers !== undefined)
        setExternUserList(baseVideo.external_speakers);
      if (baseVideo?.tags !== undefined) {
        setTags(baseVideo.tags);
        setTags_tags(baseVideo.tags.flatMap((tag) => tag.name));
      }
      if (baseVideo?.internal_speakers !== undefined) {
        console.log(baseVideo);
        setIntern_Speakers(baseVideo.internal_speakers);
        setIntern_tags(
          baseVideo.internal_speakers.flatMap(
            (user) => `${user.firstName} ${user.lastName}`,
          ),
        );
      }
    };
    if (baseVideo) {
      set_video();
    }
  }, [baseVideo]);

  return (
    <div className="mainvideo">
      <div className="container">
        <div
          style={{
            flexDirection: 'column',
            display: 'flex',
            justifyContent: 'center',
            gap: '1rem',
            margin: '3rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              flexDirection: 'row',
              height: 'fit-content',
            }}
          >
            <Card
              style={{
                height: '3rem',
                width: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0',
              }}
            >
              <input
                placeholder={title === '' ? 'Title' : title}
                onChange={handleTitleChange}
                style={{
                  border: 'none',
                  borderRadius: 'inherit',
                  width: '-webkit-fill-available',
                  height: '-webkit-fill-available',
                  textAlign: 'center',
                }}
              />
            </Card>
            {/* <img className="Closed Lock" src={Lock_Close} alt="Closed Lock" />
            <Toggle onChange={handlePrivacyChange} />
            <img className="Opened Lock" src={Lock_Open} alt="Opened Lock" /> */}
          </div>
          <div style={{ display: 'flex', flexDirection: 'row', gap: '1rem' }}>
            <Card>
              <InputFile
                placeholder={
                  baseVideo?.media_id !== undefined
                    ? baseVideo.media_id
                    : 'Glissez ou choisissez votre Média'
                }
                onChange={handleMediaChange}
                disable={baseVideo?.media_id !== undefined}
              />
            </Card>

            {/* TODO : as rajouter au moment de l'implementatio du support 
            <Card>
              <InputFile
                placeholder="Glissez ou choisissez votre Support"
                onChange={handleMediaChange}
              />
            </Card> */}
            <Card>
              <InputFile
                placeholder={
                  baseVideo?.miniature_id !== undefined
                    ? baseVideo.miniature_id
                    : 'Glissez ou choisissez votre Miniature'
                }
                onChange={handleMiniatureChange}
                disable={baseVideo?.miniature_id !== undefined}
              />
            </Card>
          </div>
          <div style={{ display: 'flex', flexDirection: 'row', gap: '1rem' }}>
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
            <Card
              style={{
                flexDirection: 'column',
                height: 'auto',
              }}
            >
              <CompletionBar
                name="Interne"
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
            <Card styleAddon={{ flexDirection: 'column', height: 'auto' }}>
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
                <textarea
                  style={{ resize: 'none' }}
                  value={extern_User_List}
                  onChange={handleExternUserChange}
                />
              </div>
            </Card>
          </div>
          <textarea
            placeholder="Description"
            style={{ resize: 'vertical' }}
            onChange={handleDescriptionChange}
          />
          <div className="buttonContainer">
            <HomeCardButton Title="Archiver la video"></HomeCardButton>
            {videoId !== undefined ? (
              <HomeCardButton
                onClickFunction={updateVideo}
                Title="Modifier la vidéo"
                State={ButtonState.colored}
              ></HomeCardButton>
            ) : (
              <HomeCardButton
                onClickFunction={publishVideo}
                Title="Publier la vidéo"
                State={ButtonState.colored}
              ></HomeCardButton>
            )}
          </div>
        </div>
      </div>
      <div className="generalinfo">
        <PreviewMiniture
          Id="1"
          title={title || 'Title'}
          imageSrc={
            miniatureUrl !== null
              ? miniatureUrl
              : '/exemple/image_tuile_event.png'
          }
          createBy={auth.user?.profile.given_name || 'Not logged in'}
          views={0}
          createdAt={new Date().toString()}
          tags={tags_tags}
        />
      </div>
      {/* 
      <Tag className='primary' >Test Primary</Tag>
      <Tag className='secondary' tsize='15px' >Test Secondary</Tag> */}
    </div>
  );
};

export default VideoSettings;
