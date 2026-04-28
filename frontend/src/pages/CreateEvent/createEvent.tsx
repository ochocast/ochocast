import React, { useState, ChangeEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from 'react-oidc-context';
import { createEvent, createTag, findTag } from '../../utils/api';
import { api } from '../../utils/api';
import logger from '../../utils/logger';

import NavigateBackButton from '../../components/ReworkComponents/Button/NavigateBackButton/NavigateBackButton';
import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';
import InputFile from '../../components/ReworkComponents/inputFile/InputFile';
import Toast from '../../components/ReworkComponents/generic/Toast/Toast';
import EventBox from '../../components/ReworkComponents/Event/EventBox/EventBox';
import { useBrandingContext } from '../../context/BrandingContext';
import { EventStatus } from '../../utils/EventStatus';
import {
  PublicEvent,
  PublicUser,
  Tag_event,
} from '../../utils/EventsProperties';
import styles from './createEvent.module.css';
import Card from '../../components/ReworkComponents/generic/Cards/Card';
import SuggestionBar, {
  SuggestionType,
  Suggestion,
} from '../../components/ReworkComponents/video/admin/SuggestionBar/SuggestionBar';
import Tag, {
  TagType,
} from '../../components/ReworkComponents/generic/Tag/Tag';
const CreateEventPage: React.FC = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { getImageUrl } = useBrandingContext();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [startHour, setStartHour] = useState('');
  const [endHour, setEndHour] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fallbackMiniatureUrl, setFallbackMiniatureUrl] = useState<
    string | null
  >(null);
  const [toast, setToast] = useState<{
    message: string;
    type?: 'success' | 'error' | 'info';
  } | null>(null);
  const [errorName, setErrorName] = useState(false);
  const [errorDescription, setErrorDescription] = useState(false);
  const [errorDate, setErrorDate] = useState(false);
  const [errorStartHour, setErrorStartHour] = useState(false);
  const [errorEndHour, setErrorEndHour] = useState(false);
  const [errorTimeOrder, setErrorTimeOrder] = useState(false);
  const [isCreatingEvent, setIsCreatingEvent] = useState<boolean>(false);

  useEffect(() => {
    const fetchFallbackMiniature = async () => {
      try {
        const url = await getImageUrl('default_miniature_image');
        setFallbackMiniatureUrl(url);
      } catch (error) {
        console.error('Error fetching fallback miniature:', error);
      }
    };
    fetchFallbackMiniature();
  }, [getImageUrl]);

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === 'string' && setImageUrl(reader.result);
      reader.readAsDataURL(file);
      setSelectedImage(file);
    }
  };
  const isTagVideo = (suggestion: Suggestion): suggestion is Tag_event => {
    return 'id' in suggestion && 'name' in suggestion;
  };
  const [tags, setTags] = useState<Tag_event[]>([]);
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
    setTags([...tags, tagChoosen as Tag_event]);
  };
  const handleDeleteTag = (name: string) => {
    setTags(tags.filter((tag) => tag.name !== name));
  };

  const handleSubmit = async () => {
    // Empêcher les double-clics
    if (isCreatingEvent) {
      return;
    }

    let isError = false;

    // Valider tous les champs obligatoires
    const hasNameError = !name.trim();
    const hasDescriptionError = !description.trim();
    const hasDateError = !date.trim();
    const hasStartHourError = !startHour.trim();
    const hasEndHourError = !endHour.trim();

    // Vérifier que endHour > startHour
    let hasTimeOrderError = false;
    if (startHour && endHour) {
      const [startH, startM] = startHour.split(':').map(Number);
      const [endH, endM] = endHour.split(':').map(Number);
      const startTotalMinutes = startH * 60 + startM;
      const endTotalMinutes = endH * 60 + endM;
      hasTimeOrderError = endTotalMinutes <= startTotalMinutes;
    }

    setErrorName(hasNameError);
    setErrorDescription(hasDescriptionError);
    setErrorDate(hasDateError);
    setErrorStartHour(hasStartHourError);
    setErrorEndHour(hasEndHourError);
    setErrorTimeOrder(hasTimeOrderError);

    if (
      hasNameError ||
      hasDescriptionError ||
      hasDateError ||
      hasStartHourError ||
      hasEndHourError ||
      hasTimeOrderError
    ) {
      isError = true;
      const message = hasTimeOrderError
        ? 'End time must be after start time'
        : t('ErrorCreatingEvent');
      setToast({
        message,
        type: 'error',
      });
    }

    if (!isError) {
      setIsCreatingEvent(true); // Désactiver le bouton
      try {
        if (auth.user?.access_token) {
          api.setHeaders({ Authorization: `Bearer ${auth.user.access_token}` });
        }

        const [year, month, day] = date.split('-');
        const [s_hour, s_minute] = startHour.split(':');
        const [e_hour, e_minute] = endHour.split(':');

        const startDateISOString = new Date(
          +year,
          +month - 1,
          +day,
          +s_hour,
          +s_minute,
        ).toISOString();

        const endDateISOString = new Date(
          +year,
          +month - 1,
          +day,
          +e_hour,
          +e_minute,
        ).toISOString();

        const formData = new FormData();
        formData.append(
          'image_slug',
          selectedImage?.name || fallbackMiniatureUrl || 'default-image',
        );
        formData.append('name', name);
        formData.append('description', description);
        formData.append('startDate', startDateISOString);
        formData.append('endDate', endDateISOString);
        if (selectedImage) formData.append('miniature', selectedImage);
        formData.append('tags', JSON.stringify(tags));

        const res = await createEvent(formData);

        if (res.status === 201) {
          setToast({ message: t('EventSuccessfullyCreated'), type: 'success' });
          // Ne pas réactiver le bouton en cas de succès - on reste désactivé jusqu'à la redirection
          setTimeout(() => navigate('/my-events'), 1500);
          return; // Sortir sans passer par finally
        } else {
          throw new Error('Création échouée');
        }
      } catch (error) {
        logger.error(error);
        setToast({ message: t('ErrorCreatingEvent'), type: 'error' });
        setIsCreatingEvent(false); // Réactiver seulement en cas d'erreur
      }
    }
  };

  const getPreviewEvent = (): PublicEvent => {
    const now = new Date();
    const startDate =
      date && startHour ? new Date(`${date}T${startHour}`) : now;
    const endDate = date && endHour ? new Date(`${date}T${endHour}`) : now;

    const mockUser: PublicUser = {
      id: 'preview-user',
      firstName: auth.user?.profile?.given_name || 'John',
      lastName: auth.user?.profile?.family_name || 'Doe',
    };

    return {
      id: 'preview-id',
      name: name || t('NameEvent'),
      description,
      tags: tags,
      startDate,
      endDate,
      published: false,
      private: false,
      closed: false,
      imageSlug: selectedImage?.name || '',
      tracks: [],
      creatorId: mockUser.id,
      canBeEditByUser: true,
      creator: mockUser,
      nbSubscription: 12,
      subscribedUserIds: [],
    };
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

  return (
    <>
      <div className={styles.header}>
        <NavigateBackButton />
        <h1 className={styles.title}>{t('CreateNewEvent')}</h1>
      </div>

      <div className={styles.events}>
        <div className={styles.contentWrapper}>
          <div className={styles.addEventForm}>
            <div className={styles.inputWrapper}>
              <label>
                {t('NameEvent')}
                <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('MyEvent')}
                className={errorName ? styles.error : ''}
                required
              />
              {errorName && (
                <span className={styles.errorMessage}>
                  This field is required
                </span>
              )}
            </div>

            <div className={styles.inputWrapper}>
              <label>
                {t('DateEvent')}
                <span className={styles.required}>*</span>
              </label>
              <input
                type="date"
                value={date}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setDate(e.target.value)}
                className={errorDate ? styles.error : ''}
                required
              />
              {errorDate && (
                <span className={styles.errorMessage}>
                  This field is required
                </span>
              )}
            </div>

            <div className={styles.inputWrapper}>
              <label>
                {t('StartEvent')}
                <span className={styles.required}>*</span>
              </label>
              <input
                type="time"
                value={startHour}
                onChange={(e) => setStartHour(e.target.value)}
                className={errorStartHour ? styles.error : ''}
                required
              />
              {errorStartHour && (
                <span className={styles.errorMessage}>
                  This field is required
                </span>
              )}
            </div>

            <div className={styles.inputWrapper}>
              <label>
                {t('EndEvent')}
                <span className={styles.required}>*</span>
              </label>
              <input
                type="time"
                value={endHour}
                onChange={(e) => setEndHour(e.target.value)}
                className={errorEndHour || errorTimeOrder ? styles.error : ''}
                required
              />
              {errorEndHour && (
                <span className={styles.errorMessage}>
                  This field is required
                </span>
              )}
              {errorTimeOrder && (
                <span className={styles.errorMessage}>
                  End time must be after start time
                </span>
              )}
            </div>

            <div className={styles.inputWrapper}>
              <label>{t('Thumbnail')}</label>
              <InputFile
                placeholder={t('ChooseThumbnail')}
                onChange={handleImageChange}
                disable={false}
                required={false}
              />
            </div>

            <div className={styles.inputWrapper}>
              <label>
                {t('EventDescription')}
                <span className={styles.required}>*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('DescriptionEvent')}
                className={errorDescription ? styles.error : ''}
                required
              />
              {errorDescription && (
                <span className={styles.errorMessage}>
                  This field is required
                </span>
              )}
            </div>
            <div className={styles.inputWrapper}>
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
            </div>
            <div
              className={`${styles.buttonEventCreation} ${styles.desktopOnly}`}
            >
              <Button
                onClick={handleSubmit}
                label={isCreatingEvent ? t('CreatingEvent') : t('CreateEvent')}
                type={
                  isCreatingEvent ? ButtonType.disabled : ButtonType.primary
                }
              />
            </div>
          </div>

          <div className={styles.preview}>
            <h2>{t('Preview')}</h2>
            <EventBox
              event={getPreviewEvent()}
              imageURL={
                imageUrl ||
                fallbackMiniatureUrl ||
                '/exemple/image_tuile_event.png'
              }
              eventStatus={EventStatus.Preview}
            />
          </div>

          <div className={`${styles.buttonEventCreation} ${styles.mobileOnly}`}>
            <Button
              onClick={handleSubmit}
              label={isCreatingEvent ? t('CreatingEvent') : t('CreateEvent')}
              type={isCreatingEvent ? ButtonType.disabled : ButtonType.primary}
            />
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

export default CreateEventPage;
