import './videoSettings.css';

import { useState, ChangeEvent, FC } from 'react';
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
import { createVideo, getVideoByTitle } from '../../utils/api';
import { Tag_video } from '../../utils/VideoProperties';


interface VideoSettingsProps {}

const VideoSettings: FC<VideoSettingsProps> = () => {
  const navigate = useNavigate();


  const [title, setTitle] = useState('');
  const handleTitleChange= (e: ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
  };

  const [privacy, setPrivacy] = useState(false);
  const handlePrivacyChange = () => {
    setPrivacy(!privacy);
  };

  const[description, setDescription] = useState('');
  const handleDescriptionChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value);
  };

  const [media, setMedia] = useState<File>();
  const handleMediaChange = (e: ChangeEvent<HTMLInputElement>) => {
    if(e.target.files != null && e.target.files != undefined){
      const media_tmp = e.target.files[0];
      if(media_tmp != undefined)
        setMedia(media_tmp);
    }
  };

  /*
  const [support, setSupport] = useState<File>();
  const handleSupportChange = (e: ChangeEvent<HTMLInputElement>) => {
    if(e.target.files != null && e.target.files != undefined)
      setSupport(e.target.files[0]);
  };

  const [miniature, setMiniature] = useState<File>();
  const handleMiniatureChange = (e: ChangeEvent<HTMLInputElement>) => {
    if(e.target.files != null && e.target.files != undefined){
      const miniature_tmp = e.target.files[0];
      if(miniature_tmp != undefined)
        setMiniature(miniature_tmp);
    }
  };*/

  const [tags, setTags] = useState<Tag_video[]>([]); //je crois c'est pas ca
  const publishVideo = async () => {
    setTags([{ id: uuidv4(), name: 'Tag1' }]);
    const list_by_title = (await getVideoByTitle(title)).data;
    if (media == undefined || title == '' || tags.length == 0 || list_by_title.length != 0){
      alert("Les conditions de publications ne sont pas remplies");
      return;
    }
    //search title in DB
    const form = new FormData();
    if(media != undefined){
      form.append('file', media);
      form.append('media_id', media.name);
    }
    form.append('title', title);
    form.append('description', description);
    const backendUser = localStorage.getItem('backendUser');
    if(backendUser != null && backendUser != undefined){
      form.append('creator', JSON.parse(backendUser).id);
    }
    
    // Ajoutez les champs qui sont des objets ou des tableaux sous forme de JSON
    form.append('tags', JSON.stringify(tags));

    form.append('internal_speakers', 'Internal Speaker Names');
    form.append('external_speakers', 'External Speaker Names');
    form.append('comments', JSON.stringify([{ id: uuidv4(), content: 'Great video!' }]));


    await createVideo(form);
    navigate('/videos');
  };

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
              <input placeholder="Title" onChange={handleTitleChange}/>
            </Card>
            <img className="Closed Lock" src={Lock_Close} alt="Closed Lock" />
            <Toggle onChange={handlePrivacyChange} />
            <img className="Opened Lock" src={Lock_Open} alt="Opened Lock" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'row' }}>
            <Card>
              <InputFile placeholder="Glissez ou choisissez votre Média" onChange={handleMediaChange}/>
            </Card>
          </div>
          <div style={{ display: 'flex', flexDirection: 'row' }}>
            <Card style={{ flexDirection: 'column', height: 'auto' }}>
              <div style={{ display: 'flex' }}>
                <input
                  placeholder="Tags"
                  style={{
                    marginBottom: '10px',
                    width: '100%',
                  }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: '10px',
                }}
              >
                <Tag
                  className="primary"
                  style={{ flex: '25%' }}
                  tsize="10px"
                  marginTop="0px"
                >
                  Test Primary
                </Tag>
                <Tag
                  className="primary"
                  style={{ flex: '25%' }}
                  tsize="10px"
                  marginTop="0px"
                >
                  Test Primary
                </Tag>
                <Tag
                  className="primary"
                  style={{ flex: '25%' }}
                  tsize="10px"
                  marginTop="0px"
                >
                  Test Primary
                </Tag>
                <Tag
                  className="primary"
                  style={{ flex: '25%' }}
                  tsize="10px"
                  marginTop="0px"
                >
                  Test Primary
                </Tag>
                <Tag
                  className="primary"
                  style={{ flex: '25%' }}
                  tsize="10px"
                  marginTop="0px"
                >
                  Test Primary
                </Tag>
              </div>
            </Card>
            <Card style={{ flexDirection: 'column', height: 'auto' }}>
              <div style={{ display: 'flex' }}>
                <input
                  placeholder="Intern"
                  style={{ marginBottom: '10px', width: '100%' }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: '10px',
                }}
              >
                <Tag
                  className="primary"
                  style={{ flex: '25%' }}
                  tsize="10px"
                  marginTop="0px"
                >
                  Test Primary
                </Tag>
                <Tag
                  className="primary"
                  style={{ flex: '25%' }}
                  tsize="10px"
                  marginTop="0px"
                >
                  Test Primary
                </Tag>
                <Tag
                  className="primary"
                  style={{ flex: '25%' }}
                  tsize="10px"
                  marginTop="0px"
                >
                  Test Primary
                </Tag>
                <Tag
                  className="primary"
                  style={{ flex: '25%' }}
                  tsize="10px"
                  marginTop="0px"
                >
                  Test Primary
                </Tag>
                <Tag
                  className="primary"
                  style={{ flex: '25%' }}
                  tsize="10px"
                  marginTop="0px"
                >
                  Test Primary
                </Tag>
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
            <textarea placeholder="Description" style={{ resize: 'none' }} onChange={handleDescriptionChange}/>
          </Card>
          <div className="buttonContainer">
            <Button>Enregistrer en Brouillon</Button>
            <Button  onClick={publishVideo} >Publier la vidéo</Button>
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
