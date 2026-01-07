import styles from './videoSettings.module.css';

import { useState, ChangeEvent, FC, useEffect } from 'react';
import type { ApiResponse } from 'apisauce';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import Card from '../../components/ReworkComponents/generic/Cards/Card';
import { useParams } from 'react-router-dom';
import NavigateBackButton from '../../components/ReworkComponents/Button/NavigateBackButton/NavigateBackButton';

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

const IMAGE_TUILE_EVENT = '/branding/exemple/image_tuile_event.png';
type BackendMsgKey = 'videonotallowdeleted' | 'videonotallowmodify';
const isBackendMsgKey = (val: unknown): val is BackendMsgKey =>
  val === 'videonotallowdeleted' || val === 'videonotallowmodify';
interface VideoSettingsProps {}

const VideoSettings: FC<VideoSettingsProps> = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const auth = useAuth();
  const { videoId } = useParams();
  const [baseVideo, setBaseVideo] = useState<Video>();

  // LocalStorage helpers
  const STORAGE_KEY = 'videoSettings_draft';

  const saveToLocalStorage = (
    key: string,
    value: string | number | boolean | object,
  ) => {
    try {
      const draft = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      draft[key] = value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  };

  const removeFromLocalStorage = (key: string) => {
    try {
      const draft = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      delete draft[key];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch (error) {
      console.error('Error removing from localStorage:', error);
    }
  };

  const clearLocalStorage = () => {
    localStorage.removeItem(STORAGE_KEY);
  };

  const [title, setTitle] = useState('');
  const handleTitleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    saveToLocalStorage('title', e.target.value);
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
    saveToLocalStorage('description', e.target.value);
  };

  const [media, setMedia] = useState<File>();
  const [videoMetadata, setVideoMetadata] = useState<{
    size: string;
    duration: string;
  } | null>(null);
  const [manualMiniatureSelected, setManualMiniatureSelected] = useState(false);
  const [mediaInputKey, setMediaInputKey] = useState(0);
  const [miniatureInputKey, setMiniatureInputKey] = useState(0);
  const [subtitleInputKey, setSubtitleInputKey] = useState(0);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const handleMediaChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files != null && e.target.files !== undefined) {
      const media_tmp = e.target.files[0];
      if (media_tmp !== undefined) {
        // Validate video format before proceeding
        const allowed_formats = ['mp4', 'mkv', 'mov', 'avi'];
        const file_extension = media_tmp.name.split('.').pop()?.toLowerCase();

        if (file_extension && !allowed_formats.includes(file_extension)) {
          setToast({
            message: t('videoFormatErrorDetailed'),
            type: 'error',
          });
          setMediaInputKey((prev) => prev + 1); // Reset input to clear selection
          return;
        }

        setMedia(media_tmp);
        saveToLocalStorage('media', media_tmp.name);

        // Extract metadata
        const sizeFormatted = formatFileSize(media_tmp.size);

        if (manualMiniatureSelected) {
          setVideoMetadata({ size: sizeFormatted, duration: '' });
          return;
        }

        const objectUrl = URL.createObjectURL(media_tmp);
        const videoElement = document.createElement('video');
        videoElement.src = objectUrl;
        videoElement.muted = true;
        videoElement.playsInline = true;

        const captureThumbnail = () => {
          const width = videoElement.videoWidth;
          const height = videoElement.videoHeight;
          if (!width || !height) {
            URL.revokeObjectURL(objectUrl);
            return;
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d');
          if (context) {
            context.drawImage(videoElement, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg');
            setMiniatureUrl(dataUrl);
          }
          URL.revokeObjectURL(objectUrl);
        };

        videoElement.addEventListener('loadedmetadata', () => {
          // Use 2-3 seconds instead of first frame
          const targetTime = Math.min(2.0, videoElement.duration || 0.1);
          videoElement.currentTime = targetTime;

          // Store duration metadata
          const duration = Math.floor(videoElement.duration);
          const minutes = Math.floor(duration / 60);
          const seconds = duration % 60;
          setVideoMetadata({
            size: sizeFormatted,
            duration: `${minutes}:${seconds.toString().padStart(2, '0')}`,
          });
        });

        videoElement.addEventListener('seeked', () => {
          captureThumbnail();
        });

        // Lance le chargement
        videoElement.load();
      }
    }
  };

  const handleRemoveMedia = () => {
    setMedia(undefined);
    setVideoMetadata(null);
    if (!manualMiniatureSelected) {
      setMiniatureUrl(null);
    }
    removeFromLocalStorage('media');
    setMediaInputKey((prev) => prev + 1); // Force input reset
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

      // Validate miniature format before proceeding
      const allowed_formats = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
      const file_extension = miniature_tmp.name.split('.').pop()?.toLowerCase();

      if (file_extension && !allowed_formats.includes(file_extension)) {
        setToast({
          message: t('miniatureFormatErrorDetailed'),
          type: 'error',
        });
        setMiniatureInputKey((prev) => prev + 1); // Reset input to clear selection
        return;
      }

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
      if (miniature_tmp !== undefined) {
        setMiniature(miniature_tmp);
        saveToLocalStorage('miniature', miniature_tmp.name);
      }
      setManualMiniatureSelected(true);
    }
  };

  const handleRemoveMiniature = () => {
    setMiniature(undefined);
    setMiniatureUrl(null);
    setManualMiniatureSelected(false);
    removeFromLocalStorage('miniature');
    setMiniatureInputKey((prev) => prev + 1); // Force input reset
  };

  const [subtitle, setSubtitle] = useState<File>();
  const handleSubtitleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files != null && e.target.files !== undefined) {
      const subtitle_tmp = e.target.files[0];
      if (subtitle_tmp !== undefined) {
        // Validate subtitle file format
        const allowed_subtitle_formats = ['srt', 'vtt'];
        const file_extension = subtitle_tmp.name
          .split('.')
          .pop()
          ?.toLowerCase();

        if (
          file_extension &&
          !allowed_subtitle_formats.includes(file_extension)
        ) {
          setToast({
            message: t('subtitleFormatError'),
            type: 'error',
          });
          setSubtitleInputKey((prev) => prev + 1); // Reset input to clear selection
          return;
        }

        setSubtitle(subtitle_tmp);
        saveToLocalStorage('subtitle', subtitle_tmp.name);
      }
    }
  };

  const handleRemoveSubtitle = () => {
    setSubtitle(undefined);
    removeFromLocalStorage('subtitle');
    setSubtitleInputKey((prev) => prev + 1); // Force input reset
  };

  const [intern_list, setInternList] = useState<User[]>([]);
  const selectIntern = (userChoosen: Suggestion) => {
    setInternList([...intern_list, userChoosen as User]);
  };
  const [tags, setTags] = useState<Tag_video[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Tag validation constants
  const MAX_TAGS = 10;
  const MIN_TAG_LENGTH = 2;
  const MAX_TAG_LENGTH = 20;
  const TAG_REGEX = /^[a-zA-Z0-9\s\-_]+$/;

  const handleTagInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setTagInput(e.target.value);
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      console.log('Enter pressed, calling processTagInput with:', tagInput);
      processTagInput();
    }
  };

  const processTagInput = async () => {
    console.log('processTagInput called with tagInput:', tagInput);
    // Support both comma and semicolon as separators
    const tagNames = tagInput
      .split(/[,;]/) // Split by comma or semicolon
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    console.log('Split tags:', tagNames);

    if (tagNames.length === 0) return;

    const currentTags = [...tags]; // Work with a local copy
    const errorMessages: string[] = [];

    for (const tagName of tagNames) {
      console.log('Processing tag:', tagName, 'length:', tagName.length);

      // Check if we've reached the max tags limit
      if (currentTags.length >= MAX_TAGS) {
        errorMessages.push(`${tagName}: ${t('maxTagsError')}`);
        continue;
      }

      // Validate tag length
      if (tagName.length < MIN_TAG_LENGTH || tagName.length > MAX_TAG_LENGTH) {
        errorMessages.push(`${tagName}: ${t('tagLengthError')}`);
        continue;
      }

      // Validate tag characters
      if (!TAG_REGEX.test(tagName)) {
        errorMessages.push(`${tagName}: ${t('tagCharactersError')}`);
        continue;
      }

      // Check for duplicate in current tags
      if (
        currentTags.some(
          (tag) => tag.name.toLowerCase() === tagName.toLowerCase(),
        )
      ) {
        errorMessages.push(`${tagName}: ${t('tagAlreadyExists')}`);
        continue;
      }

      // Try to find or create the tag
      try {
        const existingTagResponse = await findTag(tagName);
        let tagToAdd: Tag_video | null = null;

        if (existingTagResponse.data && existingTagResponse.data.length > 0) {
          // Check for EXACT match
          tagToAdd =
            existingTagResponse.data.find(
              (tag: Tag_video) =>
                tag.name.toLowerCase() === tagName.toLowerCase(),
            ) || null;
        }

        // If tag doesn't exist, create it
        if (!tagToAdd) {
          console.log('Creating new tag:', tagName);
          const response = await createTag({ name: tagName });

          if (
            response.status === 202 ||
            response.status === 201 ||
            response.status === 204 ||
            response.status === 200
          ) {
            // Fetch the newly created tag
            const newTagResponse = await findTag(tagName);
            if (newTagResponse.data && newTagResponse.data.length > 0) {
              tagToAdd =
                newTagResponse.data.find(
                  (tag: Tag_video) =>
                    tag.name.toLowerCase() === tagName.toLowerCase(),
                ) || null;
            }
          }
        }

        // Add the tag to our local list
        if (tagToAdd) {
          console.log('Tag added to list:', tagToAdd.name);
          currentTags.push(tagToAdd);
        }
      } catch (error) {
        console.error('Error processing tag:', tagName, error);
        errorMessages.push(`${tagName}: ${t('failedLoadingVideo')}`);
      }
    }

    // Update state with all new tags at once
    if (currentTags.length > tags.length) {
      setTags(currentTags);
      saveToLocalStorage('tags', currentTags);
    }

    // Show all error messages if any
    if (errorMessages.length > 0) {
      setToast({
        message: errorMessages.join('\n'),
        type: 'error',
      });
    }

    setTagInput('');
  };

  const handleDeleteTag = (name: string) => {
    const newTags = tags.filter((tag) => tag.name !== name);
    setTags(newTags);
    saveToLocalStorage('tags', newTags);
  };

  const handleDeleteUser = (fullName: string) => {
    setInternList(
      intern_list.filter(
        (user) => `${user.firstName} ${user.lastName}` !== fullName,
      ),
    );
  };

  const publishVideo = async () => {
    const accepted_media_formats = ['mp4', 'mkv', 'mov', 'avi']; //maybe move this somewhere else ?
    const accepted_minature_formats = ['jpg', 'jpeg', 'png', 'gif', 'webp']; //maybe move this somewhere else ?
    const accepted_subtitle_formats = ['srt', 'vtt'];
    const list_by_title = (await getVideoByTitle(title)).data;

    let err = '';
    // conditions publication
    if (media === undefined) err += '- ' + t('missingVideoFile') + '\n';
    else if (
      media?.name.split('.').pop() !== undefined &&
      !accepted_media_formats.includes(media?.name.split('.').pop() as string)
    )
      err += '- ' + t('videoFormatErrorDetailed') + '\n';
    if (title === '') err += '- ' + t('unknownTitle') + '\n';
    if (tags.length === 0) err += '- ' + t('missingTag') + '\n';
    if (list_by_title.length > 0) err += '- ' + t('titleAlreadyExists') + '\n';
    if (description.split('\n').some((line) => line.trim().startsWith('# ')))
      err += '- ' + t('h1Error') + '\n';
    if (
      miniature &&
      !accepted_minature_formats.includes(
        miniature?.name.split('.').pop() as string,
      )
    )
      err += '- ' + t('miniatureFormatErrorDetailed') + '\n';
    // Validate subtitle format if provided
    if (
      subtitle &&
      subtitle.name.split('.').pop() !== undefined &&
      !accepted_subtitle_formats.includes(
        subtitle.name.split('.').pop() as string,
      )
    )
      err +=
        '- ' +
        (t('subtitleFormatError') ||
          'Format de sous-titres non valide (.srt, .vtt)') +
        '\n';
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
    if (subtitle !== undefined) {
      form.append('subtitle', subtitle);
      form.append('subtitle_id', subtitle.name);
    }
    form.append('title', title);
    form.append('description', description);
    const backendUser = localStorage.getItem('backendUser');
    if (backendUser !== null && backendUser !== undefined) {
      form.append('creator', JSON.parse(backendUser)?.id || '');
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
          clearLocalStorage(); // Clear saved draft after successful upload
          // Redirect to the created video page
          const createdVideoId = response.data?.id || response.data;
          if (createdVideoId && typeof createdVideoId === 'string') {
            navigate(`/video/${createdVideoId}`, {
              state: {
                toast: {
                  message: t('successVideo'),
                  type: 'success',
                },
              },
            });
          } else {
            // Fallback to videos list if no ID
            navigate('/videos', {
              state: {
                toast: {
                  message: t('successVideo'),
                  type: 'success',
                },
              },
            });
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
    const accepted_subtitle_formats = ['srt', 'vtt'];
    const list_by_title = (await getVideoByTitle(title)).data;

    let err = '';
    // conditions publication
    if (baseVideo?.media_id === undefined && media === undefined)
      err += '- ' + t('missingVideoFile') + '\n';
    else if (
      baseVideo?.media_id === undefined &&
      media?.name.split('.').pop() !== undefined &&
      !accepted_media_formats.includes(media?.name.split('.').pop() as string)
    )
      err += '- ' + t('videoFormatErrorDetailed') + '\n';
    if (title === '') err += '- ' + t('unknownTitle') + '\n';
    if (tags.length === 0) err += '- ' + t('missingTag') + '\n';
    if (title !== baseVideo?.title && list_by_title.length > 0)
      err += '- ' + t('titleAlreadyExists') + '\n';
    if (description.split('\n').some((line) => line.trim().startsWith('# ')))
      err += '- ' + t('h1Error') + '\n';
    if (
      baseVideo?.miniature_id === undefined &&
      miniature &&
      !accepted_minature_formats.includes(
        miniature.name.split('.').pop() as string,
      )
    )
      err += '- ' + t('miniatureFormatErrorDetailed') + '\n';
    // Validate subtitle format if provided
    if (
      subtitle &&
      subtitle.name.split('.').pop() !== undefined &&
      !accepted_subtitle_formats.includes(
        subtitle.name.split('.').pop() as string,
      )
    )
      err +=
        '- ' +
        (t('subtitleFormatError') ||
          'Format de sous-titres non valide (.srt, .vtt)') +
        '\n';
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
    if (subtitle !== undefined) {
      form.append('subtitle', subtitle);
      form.append('subtitle_id', subtitle.name);
    } else if (baseVideo?.subtitle_id !== undefined) {
      form.append('subtitle_id', baseVideo.subtitle_id);
    }
    form.append('title', title);
    form.append('description', description);
    const backendUser = localStorage.getItem('backendUser');
    if (backendUser !== null && backendUser !== undefined) {
      form.append('creator', JSON.parse(backendUser)?.id || '');
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
    saveToLocalStorage('externSpeakers', e.target.value);
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

  // Add beforeunload event listener to warn user about unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Only show warning if there are files uploaded (media, miniature, or subtitle)
      if (media || miniature || subtitle) {
        e.preventDefault();
        e.returnValue = ''; // Chrome requires returnValue to be set
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [media, miniature, subtitle]);

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
    } else {
      // Load from localStorage only when creating new video (not editing)
      try {
        const draft = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        if (draft.title) setTitle(draft.title);
        if (draft.description) setDescription(draft.description);
        if (draft.externSpeakers) setExternUserList(draft.externSpeakers);
        if (draft.tags && Array.isArray(draft.tags)) setTags(draft.tags);
        if (draft.internSpeakers && Array.isArray(draft.internSpeakers))
          setInternList(draft.internSpeakers);
      } catch (error) {
        console.error('Error loading from localStorage:', error);
      }
    }
  }, [videoId]);

  useEffect(() => {
    const set_video = () => {
      // Load from localStorage first (for refresh scenario)
      const draft = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

      // Set values from baseVideo or localStorage (localStorage takes precedence for unsaved changes)
      if (draft.title || baseVideo?.title !== undefined) {
        setTitle(draft.title || (baseVideo?.title ?? ''));
      }
      if (draft.description || baseVideo?.description !== undefined) {
        setDescription(draft.description || (baseVideo?.description ?? ''));
      }
      if (draft.externSpeakers || baseVideo?.external_speakers !== undefined) {
        setExternUserList(
          draft.externSpeakers || (baseVideo?.external_speakers ?? ''),
        );
      }
      if (draft.tags || baseVideo?.tags !== undefined) {
        setTags(draft.tags || (baseVideo?.tags ?? []));
      }
      if (draft.internSpeakers || baseVideo?.internal_speakers !== undefined) {
        setInternList(
          draft.internSpeakers || (baseVideo?.internal_speakers ?? []),
        );
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
    <>
      <div className={styles.header}>
        <NavigateBackButton />
        <h1 className={styles.title}>
          {videoId !== undefined ? t('modifyVideo') : t('publish')}
        </h1>
        {videoId !== undefined && (
          <div className={styles.headerButtons}>
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
          </div>
        )}
      </div>

      <div className={styles.videoSettings}>
        <div className={styles.contentWrapper}>
          <div className={styles.addVideoForm}>
            <div className={styles.requiredNotice}>
              {t('requiredFieldsNotice')}
            </div>

            {/* TITLE ROW - Full width */}
            <div className={styles.titleRow}>
              <div className={styles.inputWrapper}>
                <label>
                  {t('Titre')}
                  <span className={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  placeholder={t('Titre')}
                  value={title}
                  onChange={handleTitleChange}
                  required
                />
              </div>
            </div>

            {/* TWO COLUMNS */}
            <div className={styles.twoColumnsRow}>
              {/* LEFT COLUMN */}
              <div className={styles.leftColumn}>
                <div className={`${styles.inputWrapper} ${styles.required}`}>
                  <label>
                    {t('addMedia')}
                    <span className={styles.required}>*</span>
                  </label>
                  <div className={styles.fileInputWrapperMedia}>
                    {media && (
                      <button
                        className={styles.fileRemoveButton}
                        onClick={handleRemoveMedia}
                        title={t('removeFile')}
                        type="button"
                      >
                        ✕
                      </button>
                    )}
                    <InputFile
                      key={mediaInputKey}
                      placeholder={
                        media
                          ? media.name
                          : baseVideo?.media_id !== undefined
                            ? baseVideo.media_id
                            : t('addMedia')
                      }
                      onChange={handleMediaChange}
                      disable={baseVideo?.media_id !== undefined}
                    />
                  </div>
                  <span className={styles.formatHint}>
                    Formats acceptés : .mp4, .mkv, .mov, .avi
                  </span>
                  {videoMetadata && (
                    <div className={styles.videoMetadata}>
                      {t('videoSize')} {videoMetadata.size}
                      {videoMetadata.duration && ` • ${videoMetadata.duration}`}
                    </div>
                  )}
                </div>

                <div className={styles.inputWrapper}>
                  <label>{t('addMiniature')}</label>
                  <div className={styles.fileInputWrapper}>
                    {(miniature || miniatureUrl) && (
                      <button
                        className={styles.fileRemoveButton}
                        onClick={handleRemoveMiniature}
                        title={t('removeFile')}
                        type="button"
                      >
                        ✕
                      </button>
                    )}
                    <InputFile
                      key={miniatureInputKey}
                      placeholder={
                        miniature
                          ? miniature.name
                          : baseVideo?.miniature_id !== undefined
                            ? baseVideo.miniature_id
                            : t('addMiniature')
                      }
                      onChange={handleMiniatureChange}
                      disable={baseVideo?.miniature_id !== undefined}
                    />
                  </div>
                  <span className={styles.formatHint}>
                    Formats acceptés : .jpg, .jpeg, .png, .gif, .webp
                  </span>
                </div>

                <div className={styles.inputWrapper}>
                  <label>{t('addSubtitle')}</label>
                  <div className={styles.fileInputWrapper}>
                    {subtitle && (
                      <button
                        className={styles.fileRemoveButton}
                        onClick={handleRemoveSubtitle}
                        title={t('removeFile')}
                        type="button"
                      >
                        ✕
                      </button>
                    )}
                    <InputFile
                      key={subtitleInputKey}
                      placeholder={
                        subtitle
                          ? subtitle.name
                          : baseVideo?.subtitle_id !== undefined
                            ? baseVideo.subtitle_id
                            : t('addSubtitle')
                      }
                      onChange={handleSubtitleChange}
                      disable={baseVideo?.subtitle_id !== undefined}
                      required={false}
                    />
                  </div>
                  <span className={styles.formatHint}>
                    Formats acceptés : .srt, .vtt
                  </span>
                </div>
              </div>

              {/* RIGHT COLUMN */}
              <div className={styles.rightColumn}>
                <div className={`${styles.inputWrapper} ${styles.required}`}>
                  <label>
                    Tags
                    <span className={styles.required}>*</span>
                  </label>
                  <div className={styles.tagUserCard}>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        processTagInput();
                      }}
                      style={{ display: 'flex', gap: '0.5rem' }}
                    >
                      <input
                        type="text"
                        value={tagInput}
                        onChange={handleTagInputChange}
                        onKeyDown={handleTagInputKeyDown}
                        placeholder="Créer des tags (séparez par des virgules)"
                        style={{ flex: 1 }}
                      />
                      {tagInput.trim() && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            processTagInput();
                          }}
                          style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: 'var(--primary-color)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '1.2rem',
                            fontWeight: 'bold',
                          }}
                        >
                          +
                        </button>
                      )}
                    </form>
                    <div className={styles.tagContainer}>
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
                    <span className={styles.formatHint}>
                      {tags.length} / {MAX_TAGS} tags • 2-20 caractères
                    </span>
                  </div>
                </div>

                <div className={styles.inputWrapper}>
                  <label>{t('internalSpeakers')}</label>
                  <Card
                    styleAddon={{
                      flexDirection: 'column',
                      height: 'auto',
                      boxShadow: 'none',
                    }}
                  >
                    <div className={styles.tagUserCard}>
                      <SuggestionBar
                        onClick={selectIntern}
                        placeholder={t('internalSpeaker')}
                        type={SuggestionType.USER}
                        name="suggestionUser"
                      />
                      <div
                        className={styles.tagContainer}
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
                    </div>
                  </Card>
                </div>

                <div className={styles.inputWrapper}>
                  <label>{t('externSpeaker')}</label>
                  <textarea
                    className={styles.externalSpeakersTextarea}
                    value={extern_User_List}
                    onChange={handleExternUserChange}
                    placeholder={t('externSpeaker')}
                  />
                </div>
              </div>
            </div>

            {/* DESCRIPTION ROW - Full width across both columns */}
            <div className={styles.descriptionRow}>
              <div className={styles.inputWrapper}>
                <label>Description</label>
                <textarea
                  className={styles.descriptionInput}
                  placeholder="Description"
                  value={description}
                  onChange={handleDescriptionChange}
                  style={{ marginBottom: '50px' }}
                />
              </div>
            </div>
          </div>

          {/* PREVIEW COLUMN */}
          <div className={styles.preview}>
            <h2>{t('Preview')}</h2>
            <div style={{ pointerEvents: 'none' }}>
              <Thumbnail
                Id=""
                title={title || t('Titre')}
                imageSrc={
                  miniatureUrl !== null ? miniatureUrl : IMAGE_TUILE_EVENT
                }
                createBy={auth.user?.profile.given_name || 'Non connecté'}
                createdAt={new Date().toString()}
                tags={tags.flatMap((tag) => {
                  return tag.name;
                })}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                marginTop: '20px',
                gap: '10px',
              }}
            >
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

          <div className={styles.preview}>
            <h2>{t('Preview')}</h2>
            <Thumbnail
              Id="1"
              title={title || t('Titre')}
              imageSrc={
                miniatureUrl !== null ? miniatureUrl : IMAGE_TUILE_EVENT
              }
              createBy={auth.user?.profile.given_name || 'Non connecté'}
              createdAt={new Date().toString()}
              tags={tags.flatMap((tag) => {
                return tag.name;
              })}
            />
          </div>

          <div className={`${styles.buttonVideoCreation} ${styles.mobileOnly}`}>
            {videoId !== undefined ? (
              <>
                <Button
                  onClick={deleteThisVideo}
                  label={t('archiveVideo')}
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

        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </div>
    </>
  );
};

export default VideoSettings;
