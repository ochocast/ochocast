import './videoSettings.css';

import { useState, ChangeEvent, FC, useEffect } from 'react';
import type { ApiResponse } from 'apisauce';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/ReworkComponents/generic/Cards/Card';
import { useParams } from 'react-router-dom';

// import Toggle from '../../components/newComponents/Toggle/Toggle';
import InputFile from '../../components/ReworkComponents/inputFile/InputFile';
//import Tag from '../../components/newComponents/Tag/Tag';
import Tag, {
  TagType,
} from '../../components/ReworkComponents/generic/Tag/Tag';
import Toast from '../../components/ReworkComponents/generic/Toast/Toast';
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
  deleteVideo,
} from '../../utils/api';
import { Tag_video, User } from '../../utils/VideoProperties';

import { Video } from '../../utils/VideoProperties';

import Thumbnail from '../../components/ReworkComponents/video/Thumbnail/Thumbnail';
import { useTranslation } from 'react-i18next';
import { useAuth } from 'react-oidc-context';
import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';
import SuggestionBar, {
  SuggestionType,
  Suggestion,
} from '../../components/ReworkComponents/video/admin/SuggestionBar/SuggestionBar';
import LoadingCircle from '../../components/ReworkComponents/LoadingCircle/LoadingCircle';
// import PreviewMiniture from '../../components/ReworkComponents/PreviewMiniture/PreviewMiniture';
// import { useAuth } from 'react-oidc-context';

const IMAGE_TUILE_EVENT = '/exemple/image_tuile_event.png';
type BackendMsgKey = 'videonotallowdeleted' | 'videonotallowmodify';
const isBackendMsgKey = (val: unknown): val is BackendMsgKey =>
  val === 'videonotallowdeleted' || val === 'videonotallowmodify';
interface VideoSettingsProps {}

const VideoSettings: FC<VideoSettingsProps> = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
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
  const [toast, setToast] = useState<{
    message: string;
    type?: 'success' | 'error' | 'info';
  } | null>(null);

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
    if (e.target.files != null && e.target.files !== undefined) {
      const media_tmp = e.target.files[0];
      if (media_tmp !== undefined) setMedia(media_tmp);
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
    if (e.target.files != null && e.target.files !== undefined) {
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
      if (miniature_tmp !== undefined) setMiniature(miniature_tmp);
    }
  };

  const [intern_list, setInternList] = useState<User[]>([]);
  const selectIntern = (userChoosen: Suggestion) => {
    setInternList([...intern_list, userChoosen as User]);
  };
  const [tags, setTags] = useState<Tag_video[]>([]);
  const selectTag = (tagChoosen: Suggestion) => {
    if (
      isTagVideo(tagChoosen) &&
      tags.some((tag) => tag.name === tagChoosen.name)
    ) {
      setToast({
        message: t('tagAlreadyExists') + '.',
        type: 'info',
      });
      return;
    }
    setTags([...tags, tagChoosen as Tag_video]);
  };
  const handleDeleteTag = (name: string) => {
    setTags(tags.filter((tag) => tag.name !== name));
  };

  const handleDeleteUser = (fullName: string) => {
    setInternList(
      intern_list.filter(
        (user) => `${user.firstName} ${user.lastName}` !== fullName,
      ),
    );
  };

  const isTagVideo = (suggestion: Suggestion): suggestion is Tag_video => {
    return 'id' in suggestion && 'name' in suggestion;
  };
  const addTag = (query: string) => {
    createTag({ name: query })
      .then(async (response) => {
        if (
          response.status === 202 ||
          response.status === 201 ||
          response.status === 204 ||
          response.status === 200
        ) {
          setToast({
            message: t('tagCreated'),
            type: 'success',
          });
          const response = await findTag(query);
          const newTag = response.data[0];
          if (!tags.some((tag) => tag.name === newTag.name)) {
            setTags([...tags, newTag]);
          }
        } else {
          setToast({
            message: t('failedLoading') + `:${response}`,
            type: 'error',
          });
        }
      })
      .catch((error) => {
        console.error('Erreur lors du chargement de la vidéo :', error);
        setToast({
          message: t('failedLoadingVideo'),
          type: 'error',
        });
      });
  };

  const publishVideo = async () => {
    const accepted_media_formats = ['mp4', 'mkv', 'mov', 'avi']; //maybe move this somewhere else ?
    const accepted_minature_formats = ['jpg', 'jpeg', 'png', 'gif', 'webp']; //maybe move this somewhere else ?
    const list_by_title = (await getVideoByTitle(title)).data;

    let err = '';
    // conditions publication
    if (media === undefined) err += '- ' + t('missingVideoFile') + '\n';
    else if (
      media?.name.split('.').pop() !== undefined && //could be moved to handleMediaChange
      !accepted_media_formats.includes(media?.name.split('.').pop() as string)
    )
      err += '- ' + t('videoFormatError') + '\n';
    if (title === '') err += '- ' + t('unknownTitle') + '\n';
    if (tags.length === 0) err += '- ' + t('missingTag') + '\n';
    if (list_by_title.length > 0) err += '- ' + t('titleAlreadyExists') + '\n';
    if (description.split('\n').some((line) => line.trim().startsWith('# ')))
      err += '- ' + t('h1Error') + '\n';
    if (!miniature) err += '- ' + t('miniatureUnknown') + '\n';
    else if (
      !accepted_minature_formats.includes(
        miniature?.name.split('.').pop() as string,
      )
    )
      err += '- ' + t('miniatureFormatError') + '\n';
    if (err !== '') {
      setToast({
        message: t('oneOrManyDisrespectedConditions') + ' : \n' + err,
        type: 'error',
      });
      return;
    }
    //search title in DB
    const form = new FormData();
    if (media !== undefined) {
      form.append('file', media);
      form.append('media_id', media.name);
    }
    if (miniature !== undefined) {
      form.append('miniature', miniature);
      form.append('miniature_id', miniature.name);
    }
    form.append('title', title);
    form.append('description', description);
    const backendUser = localStorage.getItem('backendUser');
    if (backendUser !== null && backendUser !== undefined) {
      form.append('creator', JSON.parse(backendUser).id);
    }

    // Ajoutez les champs qui sont des objets ou des tableaux sous forme de JSON
    form.append('tags', JSON.stringify(tags));
    form.append('internal_speakers', JSON.stringify(intern_list));
    form.append('external_speakers', extern_User_List);
    /*form.append(
      'comments',
      JSON.stringify([{ id: uuidv4(), content: 'Super vidéo!' }]),
    );*/
    setIsLoading(true);
    await createVideo(form)
      .then((response) => {
        if (
          response.status === 202 ||
          response.status === 201 ||
          response.status === 204 ||
          response.status === 200
        ) {
          setIsLoading(false);
          navigate('/videos', {
            state: {
              toast: {
                message: t('successVideo'),
                type: 'success',
              },
            },
          });
        } else {
          setToast({
            message: t('failedLoading') + `:${response}`,
            type: 'error',
          });
        }
      })
      .catch((error) => {
        console.error('Erreur lors du chargement de la vidéo :', error);
        setToast({
          message: t('failedLoadingVideo'),
          type: 'error',
        });
      });
    setIsLoading(false);
  };

  const deleteThisVideo = async () => {
    await deleteVideo(videoId)
      .then((response: ApiResponse<unknown>) => {
        if (
          response.status === 202 ||
          response.status === 201 ||
          response.status === 204 ||
          response.status === 200
        ) {
          setToast({
            message: t('modifyvideosucces') + '!',
            type: 'success',
          });
          navigate('/videos');
        } else {
          const backendMsg = (
            response?.data as { message?: string } | undefined
          )?.message;
          setToast({
            message: isBackendMsgKey(backendMsg)
              ? t(backendMsg)
              : `${t('failedLoading')} (${response.status})`,
            type: 'error',
          });
        }
      })
      .catch((error: unknown) => {
        console.error('Erreur lors du chargement de la vidéo :', error);
        const backendMsg =
          (error as { response?: { data?: { message?: string } } })?.response
            ?.data?.message || (error as Error)?.message;
        setToast({
          message: isBackendMsgKey(backendMsg)
            ? t(backendMsg)
            : t('failedLoadingVideo'),
          type: 'error',
        });
      });
  };

  const updateVideo = async () => {
    const accepted_media_formats = ['mp4', 'mkv', 'mov', 'avi']; //maybe move this somewhere else ?
    const accepted_minature_formats = ['jpg', 'jpeg', 'png', 'gif', 'webp']; //maybe move this somewhere else ?
    const list_by_title = (await getVideoByTitle(title)).data;

    let err = '';
    // conditions publication
    if (baseVideo?.media_id === undefined && media === undefined)
      err += '- ' + t('missingVideoFile') + '\n';
    else if (
      baseVideo?.media_id === undefined &&
      media?.name.split('.').pop() !== undefined && //could be moved to handleMediaChange
      !accepted_media_formats.includes(media?.name.split('.').pop() as string)
    )
      err += '- ' + t('videoFormatError') + '\n';
    if (title === '') err += '- ' + t('unknownTitle') + '\n';
    if (tags.length === 0) err += '- ' + t('missingTag') + '\n';
    if (title !== baseVideo?.title && list_by_title.length > 0)
      err += '- ' + t('titleAlreadyExists') + '\n';
    if (description.split('\n').some((line) => line.trim().startsWith('# ')))
      err += '- ' + t('h1Error') + '\n';
    if (
      baseVideo?.miniature_id === undefined &&
      !accepted_minature_formats.includes(
        miniature?.name.split('.').pop() as string,
      )
    )
      err += '- ' + t('miniatureFormatError') + '\n';
    if (err !== '') {
      setToast({
        message: t('oneOrManyDisrespectedConditions') + ' : \n' + err,
        type: 'error',
      });
      return;
    }

    //search title in DB
    const form = new FormData();
    if (baseVideo?.media_id !== undefined) {
      form.append('id', baseVideo?.id);
    }
    if (baseVideo?.media_id !== undefined) {
      form.append('media_id', baseVideo?.media_id);
    }
    if (miniature !== undefined) {
      form.append('miniature', miniature);
      form.append('miniature_id', miniature.name);
    }
    form.append('title', title);
    form.append('description', description);
    const backendUser = localStorage.getItem('backendUser');
    if (backendUser !== null && backendUser !== undefined) {
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
    form.append(
      'views',
      JSON.stringify(baseVideo?.views !== undefined ? baseVideo?.views : 0),
    );
    form.append(
      'updatedAt',
      JSON.stringify(
        baseVideo?.updatedAt !== undefined ? baseVideo?.updatedAt : null,
      ),
    );

    await modifyVideo(form)
      .then((response: ApiResponse<unknown>) => {
        if (
          response.status === 202 ||
          response.status === 201 ||
          response.status === 204 ||
          response.status === 200
        ) {
          navigate('/videos', {
            state: {
              toast: {
                message: t('modifyvideosucces') + '!',
                type: 'success',
              },
            },
          });
        } else {
          const backendMsg = (
            response?.data as { message?: string } | undefined
          )?.message;
          setToast({
            message: isBackendMsgKey(backendMsg)
              ? t(backendMsg)
              : `${t('failedLoading')} (${response.status})`,
            type: 'error',
          });
        }
      })
      .catch((error: unknown) => {
        console.error('Erreur lors du chargement de la vidéo :', error);
        const backendMsg =
          (error as { response?: { data?: { message?: string } } })?.response
            ?.data?.message || (error as Error)?.message;
        setToast({
          message: isBackendMsgKey(backendMsg)
            ? t(backendMsg)
            : t('failedLoading'),
          type: 'error',
        });
      });
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

  if (isLoading) {
    return <LoadingCircle />;
  }

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
                placeholder={title === '' ? t('Titre') : title}
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
                    : t('addMedia')
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
                    : t('addMiniature')
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
                    key={index}
                    content={tag.name}
                    type={TagType.DEFAULT}
                    editable={true}
                    delete={handleDeleteTag}
                    style={{ flex: '25%' }}
                  />
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
                    key={index}
                    content={`${user.firstName} ${user.lastName}`}
                    type={TagType.DEFAULT}
                    editable={true}
                    delete={handleDeleteUser}
                    style={{ flex: '25%' }}
                  />
                ))}
              </div>
            </Card>
            <Card styleAddon={{ flexDirection: 'column', height: 'auto' }}>
              <div>{t('externSpeaker')}</div>
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
            className="descriptionInput"
            placeholder="Description"
            value={description}
            onChange={handleDescriptionChange}
          />
          <div className="buttonContainer">
            {videoId !== undefined ? (
              <>
                <Button
                  onClick={deleteThisVideo}
                  label={t('archive')}
                  type={ButtonType.primary}
                ></Button>
                <Button
                  onClick={updateVideo}
                  label={t('modifyVideo')}
                  type={ButtonType.primary}
                ></Button>
              </>
            ) : (
              <Button
                onClick={publishVideo}
                label={t('publish')}
                type={ButtonType.primary}
              ></Button>
            )}
          </div>
        </div>
      </div>
      <div className="generalinfo">
        <Thumbnail
          Id="1"
          title={title || t('Titre')}
          imageSrc={miniatureUrl !== null ? miniatureUrl : IMAGE_TUILE_EVENT}
          createBy={auth.user?.profile.given_name || 'Non connecté'}
          views={0}
          createdAt={new Date().toString()}
          tags={tags.flatMap((tag) => {
            return tag.name;
          })}
        />
      </div>
      {/*
      <Tag className='primary' >Test Primary</Tag>
      <Tag className='secondary' tsize='15px' >Test Secondary</Tag> */}
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

export default VideoSettings;
