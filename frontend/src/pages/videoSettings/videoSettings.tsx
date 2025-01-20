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
  createTag,
  getVideo,
  modifyVideo,
  findTag,
} from '../../utils/api';
import { Tag_video, User } from '../../utils/VideoProperties';

import { Video } from '../../utils/VideoProperties';

import PreviewMiniture from '../../components/ReworkComponents/PreviewMiniture/PreviewMiniture';
import { useAuth } from 'react-oidc-context';
import HomeCardButton, {
  ButtonState,
} from '../../components/ReworkComponents/Button/HomeCardButton/HomeCardButton';
import SuggestionBar, { SuggestionType, Suggestion } from '../../components/ReworkComponents/SuggestionBar/SuggestionBar';
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

  const [intern_list, setInternList] = useState<User[]>([]);
  const selectIntern = (userChoosen: Suggestion) => {
    setInternList([...intern_list, userChoosen as User ]);
  };

  const [tags, setTags] = useState<Tag_video[]>([]);
  const selectTag = (tagChoosen: Suggestion) => {
    setTags([...tags, tagChoosen as Tag_video]);
  };
  const addTag = (query: string) => {
    createTag({name: query})
    .then( async (response) => { 
      if (
        response.status === 202 ||
        response.status === 201 ||
        response.status === 204 ||
        response.status === 200
      ) {
        alert('Tag crée avec succès !');
        const response = await findTag(query);
        setTags([...tags, response.data[0]]);
      } else {
        alert(`Échec du téléchargement : ${response}`);
      }
    })
    .catch((error) => {
      console.error('Erreur lors du chargement de la vidéo :', error);
      alert('Une erreur est survenue lors du chargement de la vidéo.');
    });
  };

  const publishVideo = async () => {
    const accepted_media_formats = ['mp4', 'mkv', 'mov', 'avi'];                //maybe move this somewhere else ?
    const accepted_minature_formats = ['jpg', 'jpeg', 'png', 'gif', 'webp'];            //maybe move this somewhere else ?
    const list_by_title = (await getVideoByTitle(title)).data;

    let err = "";
    // conditions publication
    if (media == undefined)
      err += "- Fichier vidéo non renseigné\n";
    else if ( media?.name.split('.').pop() != undefined &&                     //could be moved to handleMediaChange
      !accepted_media_formats.includes(media?.name.split('.').pop() as string))
      err += "- Format de vidéo non supporté\n";
    if (title=="")
      err += "- Titre non renseigné\n";
    if (tags.length == 0)
      err += "- Minimum 1 tag est requis\n";
    if (list_by_title.length > 0)
      err += "- Une vidéo du même titre existe déjà :/\n";
    if (!accepted_minature_formats.includes(miniature?.name.split('.').pop() as string))
      err += "- Format de miniature non supporté\n";
    if (err != "") {
      alert('Une ou plusieurs conditions ne sont pas remplies : \n' + err);
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
    form.append('internal_speakers', JSON.stringify(intern_list));
    form.append('external_speakers', extern_User_List);
    form.append(
      'comments',
      JSON.stringify([{ id: uuidv4(), content: 'Super vidéo!' }]),
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
      createVideo(form)
        .then((response) => {
          if (
            response.status === 202 ||
            response.status === 201 ||
            response.status === 204 ||
            response.status === 200
          ) {
            alert('Vidéo téléchargée avec succès !');
          } else {
            alert(`Échec du téléchargement : ${response}`);
          }
        })
        .catch((error) => {
          console.error('Erreur lors du chargement de la vidéo :', error);
          alert('Une erreur est survenue lors du chargement de la vidéo.');
        });
    }
    navigate('/videos');
  };

  const updateVideo = async () => {
    const accepted_media_formats = ['mp4', 'mkv', 'mov', 'avi'];                //maybe move this somewhere else ?
    const accepted_minature_formats = ['jpg', 'jpeg', 'png', 'gif', 'webp'];            //maybe move this somewhere else ?
    const list_by_title = (await getVideoByTitle(title)).data;

    let err = "";
    // conditions publication
    if (baseVideo?.media_id === undefined && media == undefined)
      err += "- Fichier vidéo non renseigné\n";
    else if (baseVideo?.media_id === undefined && media?.name.split('.').pop() != undefined &&                     //could be moved to handleMediaChange
      !accepted_media_formats.includes(media?.name.split('.').pop() as string))
      err += "- Format de vidéo non supporté\n";
    if (title=="")
      err += "- Titre non renseigné\n";
    if (tags.length == 0)
      err += "- Minimum 1 tag est requis\n";
    if (title !== baseVideo?.title  && list_by_title.length > 0)
      err += "- Une vidéo du même titre existe déjà :/\n";
    if (baseVideo?.miniature_id === undefined && !accepted_minature_formats.includes(miniature?.name.split('.').pop() as string))
      err += "- Format de miniature non supporté\n";
    if (err != "") {
      alert('Une ou plusieurs conditions ne sont pas remplies : \n' + err);
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
    form.append('internal_speakers', JSON.stringify(intern_list));
    form.append('external_speakers', extern_User_List);
    form.append(
      'comments',
      JSON.stringify([{ id: uuidv4(), content: 'Super vidéo!' }]),
    );


    form.append('createdAt', JSON.stringify(baseVideo?.createdAt));
    form.append('views', JSON.stringify((baseVideo?.views !== undefined)? baseVideo?.views : 0));
    form.append('updatedAt', JSON.stringify((baseVideo?.updatedAt !== undefined)? baseVideo?.updatedAt : null));

    await modifyVideo(form).then((response) => {
      if (
        response.status === 202 ||
        response.status === 201 ||
        response.status === 204 ||
        response.status === 200
      ) {
        alert('Vidéo modifié avec succès !');
      } else {
        alert(`Échec du téléchargement : ${response}`);
      }
    })
    .catch((error) => {
      console.error('Erreur lors du chargement de la vidéo :', error);
      alert('Une erreur est survenue lors du chargement de la vidéo.');
    });
    navigate('/videos');
  };

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
    const get_video = async () => {
      const response = await getVideo(videoId);
      if (response) {
        setBaseVideo(response.data[0]); // Mets à jour baseVideo
        console.log(response.data[0]); // Vérifie les données reçues
      }
    };

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
      }
      if (baseVideo?.internal_speakers !== undefined) {
        setInternList(baseVideo.internal_speakers);
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
              styleAddon={{
                height: '3rem',
                width: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0',
              }}
            >
              <input
                placeholder={title === '' ? 'Titre' : title}
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
                    : 'Glissez ou choisissez votre média'
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
                    : 'Glissez ou choisissez votre miniature'
                }
                onChange={handleMiniatureChange}
                disable={baseVideo?.miniature_id !== undefined}
              />
            </Card>
          </div>
          <div style={{ display: 'flex', flexDirection: 'row', gap: '1rem' }}>
            <Card styleAddon={{ flexDirection: 'column', height: 'auto' }}>
              <SuggestionBar
                onClick={selectTag}
                placeholder="Tags"
                type={SuggestionType.TAG}
                name="suggestionTag"
                onAdd={addTag}
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
                {tags.map((tag, index) => (
                  <Tag
                    className={tag.name}
                    style={{ flex: '25%' }}
                    tsize="10px"
                    marginTop="0px"
                    key={index}
                  >
                    {tag.name}
                  </Tag>
                ))}
              </div>
            </Card>
            <Card
              styleAddon={{
                flexDirection: 'column',
                height: 'auto',
              }}
            >
              <SuggestionBar
                onClick={selectIntern}
                placeholder="User"
                type={SuggestionType.USER}
                name="suggestionUser"
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
                {intern_list.map((user, index) => (
                  <Tag
                    className={user.firstName + " " + user.lastName}
                    style={{ flex: '25%' }}
                    tsize="10px"
                    marginTop="0px"
                    key={index}
                  >
                    {user.firstName + " " + user.lastName}
                  </Tag>
                ))}
              </div>
            </Card>
            <Card styleAddon={{ flexDirection: 'column', height: 'auto' }}>
              <div>Intervenant externe</div>
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
            placeholder={description === '' ? 'Description' : description}
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
          title={title || 'Titre'}
          imageSrc={
            miniatureUrl !== null
              ? miniatureUrl
              : '/exemple/image_tuile_event.png'
          }
          createBy={auth.user?.profile.given_name || 'Non connecté'}
          views={0}
          createdAt={new Date().toString()}
          tags={tags.flatMap((tag) => {return tag.name;})}
        />
      </div>
      {/* 
      <Tag className='primary' >Test Primary</Tag>
      <Tag className='secondary' tsize='15px' >Test Secondary</Tag> */}
    </div>
  );
};

export default VideoSettings;
