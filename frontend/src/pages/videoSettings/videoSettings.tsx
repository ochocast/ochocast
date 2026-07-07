import styles from './videoSettings.module.css';

import { useState, ChangeEvent, FC, useEffect } from 'react';
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import NavigateBackButton from '../../components/ReworkComponents/Button/NavigateBackButton/NavigateBackButton';

import InputFile from '../../components/ReworkComponents/inputFile/InputFile';
import Tag, {
  TagType,
} from '../../components/ReworkComponents/generic/Tag/Tag';
import Toast from '../../components/ReworkComponents/generic/Toast/Toast';

import { v4 as uuidv4 } from 'uuid';
import {
  getVideoByTitle,
  createTag,
  getVideo,
  modifyVideo,
  findTag,
  deleteVideo,
  getMiniature,
} from '../../utils/api';
import { uploadVideoWithProgress } from '../../utils/uploadService';
import { useUploadContext } from '../../context/UploadContext';
import { Tag_video } from '../../utils/VideoProperties';
import { Video } from '../../utils/VideoProperties';

import Thumbnail from '../../components/ReworkComponents/video/Thumbnail/Thumbnail';
import { useTranslation } from 'react-i18next';
import { useAuth } from 'react-oidc-context';
import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';
import LoadingCircle from '../../components/ReworkComponents/LoadingCircle/LoadingCircle';
import SuggestionBar, {
  SuggestionType,
  Suggestion,
} from '../../components/ReworkComponents/video/admin/SuggestionBar/SuggestionBar';
import Card from '../../components/ReworkComponents/generic/Cards/Card';

const IMAGE_TUILE_EVENT = '/branding/exemple/image_tuile_event.png';
type BackendMsgKey = 'videonotallowdeleted' | 'videonotallowmodify';
const isBackendMsgKey = (val: unknown): val is BackendMsgKey =>
  val === 'videonotallowdeleted' || val === 'videonotallowmodify';

interface VideoSettingsProps {}

const VideoSettings: FC<VideoSettingsProps> = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isLoading] = useState(false);
  const auth = useAuth();
  const { videoId } = useParams();
  const [baseVideo, setBaseVideo] = useState<Video>();
  const [rawDuration, setRawDuration] = useState<number>(1);

  const { addUpload, updateUpload } = useUploadContext();

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
        const allowed_formats = ['mp4', 'mkv', 'mov', 'avi'];
        const file_extension = media_tmp.name.split('.').pop()?.toLowerCase();

        if (file_extension && !allowed_formats.includes(file_extension)) {
          setToast({
            message: t('videoFormatErrorDetailed'),
            type: 'error',
          });
          setMediaInputKey((prev) => prev + 1);
          return;
        }

        setMedia(media_tmp);
        saveToLocalStorage('media', media_tmp.name);

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
          const targetTime = Math.min(2.0, videoElement.duration || 0.1);
          videoElement.currentTime = targetTime;

          const duration = Math.floor(videoElement.duration);
          setRawDuration(duration);
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
    setMediaInputKey((prev) => prev + 1);
  };

  const [miniature, setMiniature] = useState<File>();
  const [miniatureUrl, setMiniatureUrl] = useState<string | null>(null);
  const handleMiniatureChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files != null && e.target.files !== undefined) {
      const miniature_tmp = e.target.files[0];

      const allowed_formats = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
      const file_extension = miniature_tmp.name.split('.').pop()?.toLowerCase();

      if (file_extension && !allowed_formats.includes(file_extension)) {
        setToast({
          message: t('miniatureFormatErrorDetailed'),
          type: 'error',
        });
        setMiniatureInputKey((prev) => prev + 1);
        return;
      }

      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setMiniatureUrl(reader.result);
          if (videoId) {
            try {
              const raw = localStorage.getItem('customMiniatures') || '{}';
              const map = JSON.parse(raw) as Record<string, string>;
              map[videoId] = reader.result;
              localStorage.setItem('customMiniatures', JSON.stringify(map));
            } catch (err) {
              console.error('Error saving custom miniature from file:', err);
            }
          }
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
    setBaseVideo((prev) =>
      prev ? { ...prev, miniature_id: '' as unknown as string } : prev,
    );
    if (videoId) {
      try {
        const raw = localStorage.getItem('customMiniatures') || '{}';
        const map = JSON.parse(raw) as Record<string, string>;
        if (map[videoId]) {
          delete map[videoId];
          localStorage.setItem('customMiniatures', JSON.stringify(map));
        }
      } catch (e) {
        console.error('Error clearing custom miniature override:', e);
      }
    }
    setMiniatureInputKey((prev) => prev + 1);
  };

  const [subtitle, setSubtitle] = useState<File>();
  const handleSubtitleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files != null && e.target.files !== undefined) {
      const subtitle_tmp = e.target.files[0];
      if (subtitle_tmp !== undefined) {
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
          setSubtitleInputKey((prev) => prev + 1);
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
    setSubtitleInputKey((prev) => prev + 1);
  };

  const [internalSpeakers, setInternalSpeakers] = useState<string[]>([]);
  const [internalSpeakerInput, setInternalSpeakerInput] = useState('');

  const [externalSpeakers, setExternalSpeakers] = useState<string[]>([]);
  const [externalSpeakerInput, setExternalSpeakerInput] = useState('');

  const MAX_SPEAKERS = 10;
  const MIN_SPEAKER_LENGTH = 2;
  const MAX_SPEAKER_LENGTH = 50;

  const processSpeakerInput = (
    input: string,
    currentList: string[],
    setList: (val: string[]) => void,
    storageKey: string,
    setInput: (val: string) => void,
  ) => {
    const names = input
      .split(/[,;]/)
      .map((name) => name.trim())
      .filter((name) => name.length > 0);

    if (names.length === 0) return;

    const newList = [...currentList];
    const errorMessages: string[] = [];

    for (const name of names) {
      if (newList.length >= MAX_SPEAKERS) {
        errorMessages.push(
          `${name}: Maximum ${MAX_SPEAKERS} personnes atteint`,
        );
        continue;
      }

      if (
        name.length < MIN_SPEAKER_LENGTH ||
        name.length > MAX_SPEAKER_LENGTH
      ) {
        errorMessages.push(
          `${name}: ${MIN_SPEAKER_LENGTH}-${MAX_SPEAKER_LENGTH} caractères requis`,
        );
        continue;
      }

      if (newList.some((s) => s.toLowerCase() === name.toLowerCase())) {
        errorMessages.push(`${name}: Déjà ajouté`);
        continue;
      }

      newList.push(name);
    }

    if (newList.length > currentList.length) {
      setList(newList);
      saveToLocalStorage(storageKey, newList);
    }

    if (errorMessages.length > 0) {
      setToast({
        message: errorMessages.join('\n'),
        type: 'error',
      });
    }

    setInput('');
  };

  const handleInternalSpeakerKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      processSpeakerInput(
        internalSpeakerInput,
        internalSpeakers,
        setInternalSpeakers,
        'internalSpeakers',
        setInternalSpeakerInput,
      );
    }
  };

  const handleExternalSpeakerKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      processSpeakerInput(
        externalSpeakerInput,
        externalSpeakers,
        setExternalSpeakers,
        'externalSpeakers',
        setExternalSpeakerInput,
      );
    }
  };

  const handleDeleteInternalSpeaker = (name: string) => {
    const newSpeakers = internalSpeakers.filter((s) => s !== name);
    setInternalSpeakers(newSpeakers);
    saveToLocalStorage('internalSpeakers', newSpeakers);
  };

  const handleDeleteExternalSpeaker = (name: string) => {
    const newSpeakers = externalSpeakers.filter((s) => s !== name);
    setExternalSpeakers(newSpeakers);
    saveToLocalStorage('externalSpeakers', newSpeakers);
  };

  const [tags, setTags] = useState<Tag_video[]>([]);
  const MAX_TAGS = 10;

  const isTagVideoSuggestion = (
    suggestion: Suggestion,
  ): suggestion is Tag_video => {
    return (
      typeof suggestion === 'object' &&
      suggestion !== null &&
      'id' in suggestion &&
      'name' in suggestion
    );
  };

  const selectTag = (tagChoosen: Suggestion) => {
    if (
      isTagVideoSuggestion(tagChoosen) &&
      tags.some((tag) => tag.name === tagChoosen.name)
    ) {
      setToast({
        message: t('tagAlreadyExists') + '.',
        type: 'info',
      });
      return;
    }
    if (tags.length >= MAX_TAGS) {
      setToast({
        message: t('maxTagsError') || 'Limite de tags atteinte',
        type: 'error',
      });
      return;
    }
    const newTags = [...tags, tagChoosen as Tag_video];
    setTags(newTags);
    saveToLocalStorage('tags', newTags);
  };

  const addTag = (query: string) => {
    createTag({ name: query })
      .then(async (response) => {
        if ([200, 201, 202, 204].includes(response?.status ?? 0)) {
          setToast({
            message: t('tagCreated') || 'Tag créé',
            type: 'success',
          });
          const responseFind = await findTag(query);
          const newTag = responseFind.data[0];
          if (newTag && !tags.some((tag) => tag.name === newTag.name)) {
            const newTags = [...tags, newTag];
            setTags(newTags);
            saveToLocalStorage('tags', newTags);
          }
        } else {
          setToast({
            message: t('failedLoading') + `:${response.status}`,
            type: 'error',
          });
        }
      })
      .catch((error) => {
        console.error('Erreur lors de la création du tag :', error);
        setToast({
          message: t('failedLoadingVideo'),
          type: 'error',
        });
      });
  };

  const handleDeleteTag = (name: string) => {
    const newTags = tags.filter((tag) => tag.name !== name);
    setTags(newTags);
    saveToLocalStorage('tags', newTags);
  };

  const getVideosMatchingTitle = async () => {
    const response = await getVideoByTitle(title);
    return Array.isArray(response.data) ? response.data : [];
  };

  const publishVideo = async () => {
    const accepted_media_formats = ['mp4', 'mkv', 'mov', 'avi'];
    const accepted_minature_formats = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const accepted_subtitle_formats = ['srt', 'vtt'];
    const list_by_title = await getVideosMatchingTitle();

    let err = '';
    if (media === undefined) err += '- ' + t('missingVideoFile') + '\n';
    else if (
      media?.name.split('.').pop() !== undefined &&
      !accepted_media_formats.includes(media?.name.split('.').pop() as string)
    )
      err += '- ' + t('videoFormatErrorDetailed') + '\n';
    if (title === '') err += '- ' + t('unknownTitle') + '\n';
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
    form.append('tags', JSON.stringify(tags));
    form.append('internal_speakers', JSON.stringify(internalSpeakers));
    form.append('external_speakers', externalSpeakers.join(', '));

    const uploadId = uuidv4();

    addUpload({
      id: uploadId,
      fileName: media!.name,
      title: title,
      progress: 0,
      status: 'uploading',
    });

    clearLocalStorage();

    setToast({
      message: t('uploadStarted'),
      type: 'info',
    });

    navigate('/videos');

    uploadVideoWithProgress(form, {
      onProgress: (progress: number) => {
        updateUpload(uploadId, {
          progress,
          status: progress === 100 ? 'processing' : 'uploading',
        });
      },
      onComplete: (response: { id: string }) => {
        updateUpload(uploadId, {
          progress: 100,
          status: 'completed',
          videoId: response.id,
        });
      },
      onError: (error: string) => {
        updateUpload(uploadId, {
          status: 'error',
          errorMessage: error,
        });
      },
    });
  };

  const handleArchiveClick = () => {
    const confirmMessage =
      'Êtes-vous sûr de vouloir archiver cette vidéo ? Cette action peut être définitive.';

    if (window.confirm(confirmMessage)) {
      void deleteThisVideo();
    }
  };

  const deleteThisVideo = async () => {
    await deleteVideo(videoId)
      .then((response) => {
        if ([200, 201, 202, 204].includes(response?.status ?? 0)) {
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
    const accepted_media_formats = ['mp4', 'mkv', 'mov', 'avi'];
    const accepted_minature_formats = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const accepted_subtitle_formats = ['srt', 'vtt'];
    const list_by_title = await getVideosMatchingTitle();

    let err = '';
    if (baseVideo?.media_id === undefined && media === undefined)
      err += '- ' + t('missingVideoFile') + '\n';
    else if (
      baseVideo?.media_id === undefined &&
      media?.name.split('.').pop() !== undefined &&
      !accepted_media_formats.includes(media?.name.split('.').pop() as string)
    )
      err += '- ' + t('videoFormatErrorDetailed') + '\n';
    if (title === '') err += '- ' + t('unknownTitle') + '\n';
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

    const form = new FormData();

    if (baseVideo?.id) {
      form.append('id', baseVideo.id);
    }

    if (media !== undefined) {
      form.append('file', media);
      form.append('media_id', media.name);
    } else if (baseVideo?.media_id !== undefined) {
      form.append('media_id', baseVideo.media_id);
    }

    if (miniature !== undefined) {
      form.append('miniature', miniature);
    } else if (baseVideo?.miniature_id) {
      form.append('miniature_id', baseVideo.miniature_id);
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

    form.append('tags', JSON.stringify(tags));
    form.append('internal_speakers', JSON.stringify(internalSpeakers));
    form.append('external_speakers', externalSpeakers.join(', '));
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
      .then((response) => {
        if ([200, 201, 202, 204].includes(response?.status ?? 0)) {
          if (videoId && miniatureUrl) {
            try {
              const raw = localStorage.getItem('customMiniatures') || '{}';
              const map = JSON.parse(raw) as Record<string, string>;
              map[videoId] = miniatureUrl;
              localStorage.setItem('customMiniatures', JSON.stringify(map));
            } catch (e) {
              console.error('Error saving custom miniature override:', e);
            }
          }

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

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (media || miniature || subtitle) {
        e.preventDefault();
        e.returnValue = '';
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
        const videoData = response.data[0];
        setBaseVideo(videoData);

        try {
          if (videoData?.id) {
            const miniatureResponse = await getMiniature(videoData.id);
            if (
              miniatureResponse?.data &&
              typeof miniatureResponse.data === 'string' &&
              !miniatureResponse.data.includes('miniatureundefined')
            ) {
              setMiniatureUrl(miniatureResponse.data);
            }
          }
        } catch (error) {
          console.error('Error loading existing miniature for preview:', error);
        }
      }
    };

    if (videoId !== undefined) {
      clearLocalStorage();
      void get_video();
    } else {
      try {
        const draft = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        if (draft.title) setTitle(draft.title);
        if (draft.description) setDescription(draft.description);
        if (draft.tags && Array.isArray(draft.tags)) setTags(draft.tags);

        if (draft.internalSpeakers && Array.isArray(draft.internalSpeakers)) {
          setInternalSpeakers(draft.internalSpeakers);
        }
        if (draft.externalSpeakers && Array.isArray(draft.externalSpeakers)) {
          setExternalSpeakers(draft.externalSpeakers);
        }
      } catch (error) {
        console.error('Error loading from localStorage:', error);
      }
    }
  }, [videoId]);

  useEffect(() => {
    if (!baseVideo) {
      return;
    }

    const draft = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

    if (draft.title || baseVideo.title !== undefined) {
      setTitle(draft.title || (baseVideo.title ?? ''));
    }
    if (draft.description || baseVideo.description !== undefined) {
      setDescription(draft.description || (baseVideo.description ?? ''));
    }

    if (draft.tags || baseVideo.tags !== undefined) {
      setTags(draft.tags || (baseVideo.tags ?? []));
    }

    if (draft.internalSpeakers && Array.isArray(draft.internalSpeakers)) {
      setInternalSpeakers(draft.internalSpeakers);
    } else if (baseVideo.internal_speakers) {
      try {
        const parsed =
          typeof baseVideo.internal_speakers === 'string'
            ? JSON.parse(baseVideo.internal_speakers)
            : baseVideo.internal_speakers;
        if (Array.isArray(parsed)) {
          setInternalSpeakers(
            parsed.map((p: string | { name: string }) =>
              typeof p === 'string' ? p : p.name || '',
            ),
          );
        }
      } catch (e) {
        console.error('Error parsing internal speakers', e);
      }
    }

    if (draft.externalSpeakers && Array.isArray(draft.externalSpeakers)) {
      setExternalSpeakers(draft.externalSpeakers);
    } else if (baseVideo.external_speakers) {
      const names = baseVideo.external_speakers
        .split(',')
        .map((name: string) => name.trim())
        .filter((name: string) => name.length > 0);
      setExternalSpeakers(names);
    }
  }, [baseVideo]);

  if (isLoading) {
    return <LoadingCircle />;
  }

  return (
    <div className={styles.pageVideoSettings}>
      <div className={styles.videoSettingsContainer}>
        {/* HEADER */}
        <div className={styles.topLayout}>
          <div className={styles.titleLayout}>
            <NavigateBackButton customPageUrl="/videos" />
            <h1>{videoId !== undefined ? t('modifyVideo') : t('publish')}</h1>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div className={styles.mainContentWrapper}>
          <div className={styles.addVideoForm}>
            {/* SECTION 1: INFORMATIONS DE BASE */}
            <div className={styles.formSection}>
              <h3>Informations de base</h3>
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

              <div className={styles.inputWrapper}>
                <label>Description</label>
                <textarea
                  placeholder="Description"
                  value={description}
                  onChange={handleDescriptionChange}
                />
              </div>
            </div>

            {/* SECTION 2: MEDIAS */}
            <div className={styles.formSection}>
              <h3>Fichiers Médias</h3>
              <div className={styles.inputWrapper}>
                <label>
                  {t('addMedia')}
                  {videoId === undefined && (
                    <span className={styles.required}>*</span>
                  )}
                </label>
                <div className={styles.fileInputWrapperMedia}>
                  {media && videoId === undefined && (
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
                    disable={videoId !== undefined}
                    required={videoId === undefined}
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
                        : baseVideo?.miniature_id
                          ? baseVideo.miniature_id
                          : t('addMiniature')
                    }
                    onChange={handleMiniatureChange}
                    disable={false}
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
                    disable={false}
                    required={false}
                  />
                </div>
                <span className={styles.formatHint}>
                  Formats acceptés : .srt, .vtt
                </span>
              </div>
            </div>

            {/* SECTION 3: TAGS & ORATEURS */}
            <div className={styles.formSection}>
              <h3>Détails de publication</h3>

              {/* TAGS */}
              <div className={styles.inputWrapper}>
                <label>Tags</label>
                <Card
                  styleAddon={{
                    flexDirection: 'column',
                    height: 'auto',
                    boxShadow: 'none',
                  }}
                >
                  <SuggestionBar
                    onClick={selectTag}
                    placeholder="Créer ou rechercher des tags"
                    type={SuggestionType.TAG}
                    name="suggestionTag"
                    onAdd={addTag}
                  />
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
                </Card>
              </div>

              {/* ORATEURS INTERNES */}
              <div className={styles.inputWrapper}>
                <label>{t('internalSpeakers')}</label>
                <Card
                  styleAddon={{
                    flexDirection: 'column',
                    height: 'auto',
                    boxShadow: 'none',
                  }}
                >
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      processSpeakerInput(
                        internalSpeakerInput,
                        internalSpeakers,
                        setInternalSpeakers,
                        'internalSpeakers',
                        setInternalSpeakerInput,
                      );
                    }}
                    className={styles.tagInputForm}
                  >
                    <input
                      type="text"
                      value={internalSpeakerInput}
                      onChange={(e) => setInternalSpeakerInput(e.target.value)}
                      onKeyDown={handleInternalSpeakerKeyDown}
                      placeholder="Ajouter des orateurs internes (séparez par des virgules)"
                    />
                  </form>
                  <div className={styles.tagContainer}>
                    {internalSpeakers.map((name, index) => (
                      <Tag
                        key={index}
                        content={name}
                        type={TagType.DEFAULT}
                        editable={true}
                        delete={handleDeleteInternalSpeaker}
                        style={{ flex: '25%' }}
                      />
                    ))}
                  </div>
                  <span className={styles.formatHint}>
                    {internalSpeakers.length} / {MAX_SPEAKERS} orateurs • 2-50
                    caractères
                  </span>
                </Card>
              </div>

              {/* INTERVENANTS EXTERNES */}
              <div className={styles.inputWrapper}>
                <label>{t('externSpeaker')}</label>
                <Card
                  styleAddon={{
                    flexDirection: 'column',
                    height: 'auto',
                    boxShadow: 'none',
                  }}
                >
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      processSpeakerInput(
                        externalSpeakerInput,
                        externalSpeakers,
                        setExternalSpeakers,
                        'externalSpeakers',
                        setExternalSpeakerInput,
                      );
                    }}
                    className={styles.tagInputForm}
                  >
                    <input
                      type="text"
                      value={externalSpeakerInput}
                      onChange={(e) => setExternalSpeakerInput(e.target.value)}
                      onKeyDown={handleExternalSpeakerKeyDown}
                      placeholder="Ajouter des intervenants externes (séparez par des virgules)"
                    />
                  </form>
                  <div className={styles.tagContainer}>
                    {externalSpeakers.map((name, index) => (
                      <Tag
                        key={index}
                        content={name}
                        type={TagType.DEFAULT}
                        editable={true}
                        delete={handleDeleteExternalSpeaker}
                        style={{ flex: '25%' }}
                      />
                    ))}
                  </div>
                  <span className={styles.formatHint}>
                    {externalSpeakers.length} / {MAX_SPEAKERS} intervenants •
                    2-50 caractères
                  </span>
                </Card>
              </div>
            </div>

            {/* SECTION ACTIONS */}
            <div className={styles.formSection}>
              <h3>Actions</h3>
              <div className={styles.confirmationButtons}>
                {videoId !== undefined ? (
                  <>
                    <Button
                      onClick={updateVideo}
                      label={t('save')}
                      type={ButtonType.primary}
                    ></Button>
                    <Button
                      onClick={handleArchiveClick}
                      label={t('archiveVideo')}
                      type={ButtonType.danger}
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

          {/* PREVIEW COLUMN */}
          <div className={styles.preview}>
            <h2>{t('Preview')}</h2>
            <div style={{ pointerEvents: 'none' }}>
              <Thumbnail
                Id={videoId ?? ''}
                creatorId={
                  baseVideo?.creator.id
                    ? baseVideo.creator.id
                    : JSON.parse(localStorage.getItem('backendUser') || '{}')
                        ?.id
                }
                title={title || t('Titre')}
                imageSrc={
                  miniatureUrl !== null ? miniatureUrl : IMAGE_TUILE_EVENT
                }
                views={baseVideo?.views ? baseVideo.views : 0}
                createBy={
                  baseVideo?.creator.username ||
                  auth.user?.profile.preferred_username ||
                  'Anonyme'
                }
                createdAt={new Date().toString()}
                tags={tags.flatMap((tag) => tag.name)}
                duration={
                  baseVideo?.duration ? baseVideo?.duration : rawDuration
                }
              />
            </div>
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
    </div>
  );
};

export default VideoSettings;
