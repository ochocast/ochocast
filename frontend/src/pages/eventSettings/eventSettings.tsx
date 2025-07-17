import React, {
  FC,
  useState,
  useEffect,
  ChangeEvent,
  FormEvent,
  useCallback,
} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUser } from '../../context/UserContext';

import {
  getPrivateEvent,
  updateEvent,
  deleteEvent,
  closeEvent,
  getEventsMiniature,
  createTag,
  findTag,
} from '../../utils/api';
import {
  Track,
  PublicEvent,
  PublicUser,
  Tag_event,
} from '../../utils/EventsProperties';
import logger from '../../utils/logger';

import NavigateBackButton from '../../components/ReworkComponents/Button/NavigateBackButton/NavigateBackButton';
import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';
import Modal from '../../components/ReworkComponents/generic/modal/modal';
import InputFile from '../../components/ReworkComponents/inputFile/InputFile';
import EventBox from '../../components/ReworkComponents/Event/EventBox/EventBox';
import EventDashboard from '../../components/ReworkComponents/Event/EventDashboard/EventDashboard';
import Toast from '../../components/ReworkComponents/generic/Toast/Toast';
import Card from '../../components/ReworkComponents/generic/Cards/Card';
import SuggestionBar, {
  SuggestionType,
  Suggestion,
} from '../../components/ReworkComponents/video/admin/SuggestionBar/SuggestionBar';
import Tag, {
  TagType,
} from '../../components/ReworkComponents/generic/Tag/Tag';

import fallbackMiniature from '../../assets/logo_2lignes_crop.png';
import { EventStatus } from '../../utils/EventStatus';

import styles from './eventSettings.module.css';

const EventSettings: FC = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useUser();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [startHour, setStartHour] = useState('');
  const [endHour, setEndHour] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [tags, setTags] = useState<Tag_event[]>([]);
  const [isFetchError, setIsFetchError] = useState(false);
  const [creatorId, setCreatorId] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type?: 'success' | 'error' | 'info';
  } | null>(null);

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [previewMiniatureUrl, setPreviewMiniatureUrl] = useState<string | null>(
    null,
  );
  const [eventClosed, setEventClosed] = useState(false);
  const [errorName, setErrorName] = useState(false);
  const [errorDescription, setErrorDescription] = useState(false);
  const [isButtonDisabled, setButtonDisabled] = useState(true);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

  const userString = localStorage.getItem('backendUser');
  const userId = userString ? JSON.parse(userString).id : '';

  const isTagVideo = (suggestion: Suggestion): suggestion is Tag_event => {
    return 'id' in suggestion && 'name' in suggestion;
  };

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
    setButtonDisabled(false);
  };

  const handleDeleteTag = (name: string) => {
    setTags(tags.filter((tag) => tag.name !== name));
    setButtonDisabled(false);
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
            setButtonDisabled(false);
          }
        } else {
          setToast({
            message: t('failedLoading') + `:${response}`,
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

  const fetchMiniature = useCallback(async () => {
    if (!eventId) return;

    try {
      const res = await getEventsMiniature(eventId);
      if (res?.data?.url && !res.data.url.includes('imageSlug')) {
        setPreviewMiniatureUrl(res.data.url);
      } else {
        setPreviewMiniatureUrl(fallbackMiniature);
      }
    } catch (err) {
      console.error(`Erreur récupération miniature pour event ${eventId}`, err);
      setPreviewMiniatureUrl(fallbackMiniature);
    }
  }, [eventId]);

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const res = await getPrivateEvent(eventId);
        if (res.status === 200) {
          const data = res.data;
          setName(data.name);
          setDescription(data.description);
          setDate(data.startDate.split('T')[0]);
          setStartHour(data.startDate.match(/\d{2}:\d{2}/)?.[0] || '');
          setEndHour(data.endDate.match(/\d{2}:\d{2}/)?.[0] || '');
          setTracks(data.tracks);
          setTags(data.tags);
          setCreatorId(data.creator.id);
          setEventClosed(data.closed);
          setIsPublished(data.published);
        }
      } catch (error) {
        logger.error('Error fetching event', error);
        setIsFetchError(true);
      }
    };
    fetchEvent();
    fetchMiniature();
  }, [eventId, fetchMiniature]);

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedImage(file);
    setButtonDisabled(false);
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string' && setImageUrl(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    setErrorName(!name.trim());
    setErrorDescription(!description.trim());

    if (!name.trim() || !description.trim()) return;

    try {
      const formData = new FormData();
      formData.append('image_slug', selectedImage?.name || fallbackMiniature);
      formData.append('name', name);
      formData.append('description', description);
      formData.append('startDate', date + 'T' + startHour + ':00.000Z');
      formData.append('endDate', date + 'T' + endHour + ':00.000Z');
      formData.append('tags', JSON.stringify(tags));
      if (selectedImage) formData.append('miniature', selectedImage);

      const res = await updateEvent(eventId, formData);
      if (res.status === 200) {
        setToast({
          message: t('eventModified'),
          type: 'success',
        });
        setButtonDisabled(true);
      }
    } catch (error) {
      logger.error('Error updating event', error);
      setToast({
        message: t('eventCouldNotBeModified'),
        type: 'error',
      });
    }
  };

  const deleteEventHandler = async () => {
    try {
      await deleteEvent(eventId);
      navigate('/events');
    } catch (error) {
      setToast({
        message: t('eventCouldNotBeDeleted'),
        type: 'error',
      });
    }
  };

  const handleCloseEvent = async () => {
    for (const track of tracks) {
      if (!track.closed) {
        setModalMessage(t('impossibleCloseEvent'));
        return;
      }
    }
    try {
      const res = await closeEvent(eventId);
      if (res.status === 200) {
        setEventClosed(true);
        setIsCloseModalOpen(false);
        setToast({
          message: t('eventClosed'),
          type: 'success',
        });
      }
    } catch {
      setToast({
        message: t('eventCouldNotClosed'),
        type: 'error',
      });
    }
  };

  const getPreviewEvent = (): PublicEvent => {
    const now = new Date();
    const startDate =
      date && startHour ? new Date(`${date}T${startHour}:00Z`) : now;
    const endDate = date && endHour ? new Date(`${date}T${endHour}:00Z`) : now;

    const creator: PublicUser = {
      id: user?.id || creatorId,
      firstName: user?.firstName || '...',
      lastName: user?.lastName || '...',
    };

    return {
      id: eventId || '',
      name: name || t('NameEvent'),
      description,
      tags: tags,
      startDate,
      endDate,
      published: false,
      private: true,
      closed: eventClosed,
      imageSlug: imageUrl ? imageUrl : '',
      tracks: [],
      creatorId,
      canBeEditByUser: true,
      creator,
      nbSubscription: 0,
    };
  };

  const handleShareEvent = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    if (!isPublished) {
      setToast({
        message: t('eventMustBePublished'),
        type: 'info',
      });
      return;
    }

    const invitationLink = `${window.location.origin}/events/${eventId}/tracks`;

    try {
      await navigator.clipboard.writeText(invitationLink);
      setToast({
        message: t('linkCopied'),
        type: 'success',
      });
    } catch (err) {
      // Fallback pour les navigateurs qui ne supportent pas l'API clipboard
      const textArea = document.createElement('textarea');
      textArea.value = invitationLink;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setToast({
        message: t('linkCopied'),
        type: 'success',
      });
    }
  };

  if (isFetchError) {
    return (
      <Button
        label={t('eventUnavailableReturnPresentationPage')}
        onClick={() => navigate('/my-events')}
      />
    );
  }

  return (
    <div className={styles.pageEventSettings}>
      <EventDashboard
        eventId={eventId}
        tracks={tracks}
        eventClosed={!eventClosed && userId === creatorId}
      />

      <div className={styles.eventSettings}>
        <div className={styles.topLayout}>
          <div className={styles.titleLayout}>
            <NavigateBackButton />
            <h1>{t('EditEvent')}</h1>
          </div>
          {eventClosed ? (
            <h2>{t('EventClosed')}</h2>
          ) : (
            <Button
              label={t('CloseEvent')}
              onClick={() => setIsCloseModalOpen(true)}
            />
          )}
        </div>

        <Modal
          isOpen={isCloseModalOpen}
          toggle={() => setIsCloseModalOpen(false)}
        >
          <h2>{t('SureCloseEvent')}</h2>
          <div className={styles.confirmationButtons}>
            <Button label={t('Confirm')} onClick={handleCloseEvent} />
            <Button
              label={t('Cancel')}
              onClick={() => setIsCloseModalOpen(false)}
            />
          </div>
          {modalMessage && <p>{modalMessage}</p>}
        </Modal>

        <div className={styles.inputWrapper}>
          <label>{t('NameEvent')}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setButtonDisabled(false);
            }}
            disabled={eventClosed}
            required
            className={errorName ? styles.error : ''}
          />
        </div>

        <div className={styles.inputWrapper}>
          <label>{t('DateEvent')}</label>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setButtonDisabled(false);
            }}
            min={new Date().toISOString().split('T')[0]}
            disabled={eventClosed}
            required
          />
        </div>

        <div className={styles.inputWrapper}>
          <label>{t('StartEvent')}</label>
          <input
            type="time"
            value={startHour}
            onChange={(e) => {
              setStartHour(e.target.value);
              setButtonDisabled(false);
            }}
            disabled={eventClosed}
            required
          />
        </div>

        <div className={styles.inputWrapper}>
          <label>{t('EndEvent')}</label>
          <input
            type="time"
            value={endHour}
            onChange={(e) => {
              setEndHour(e.target.value);
              setButtonDisabled(false);
            }}
            disabled={eventClosed}
            required
          />
        </div>

        <div className={styles.inputWrapper}>
          <label>{t('Thumbnail')}</label>
          <InputFile
            placeholder={t('ChooseThumbnail')}
            onChange={handleImageChange}
            disable={eventClosed}
            required={false}
          />
        </div>

        <div className={styles.inputWrapper}>
          <label>{t('EventDescription')}</label>
          <textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setButtonDisabled(false);
            }}
            className={errorDescription ? styles.error : ''}
            disabled={eventClosed}
            required
          />
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
                  editable={!eventClosed}
                  delete={handleDeleteTag}
                  style={{ flex: '25%' }}
                />
              ))}
            </div>
          </Card>
        </div>

        {!eventClosed && (
          <div className={styles.confirmationButtons}>
            <Button
              label={t('shareEvent')}
              onClick={handleShareEvent}
              type={ButtonType.secondary}
            />
            <Button
              label={t('DeleteEvent')}
              onClick={() => setIsDeleteOpen(true)}
            />
            <Button
              label={t('Save')}
              type={
                isButtonDisabled ? ButtonType.disabled : ButtonType.secondary
              }
              onClick={handleSubmit}
            />
          </div>
        )}

        <Modal isOpen={isDeleteOpen} toggle={() => setIsDeleteOpen(false)}>
          <h2>{t('SureDeleteEvent')}</h2>
          <div className={styles.confirmationButtons}>
            <Button label={t('Delete')} onClick={deleteEventHandler} />
            <Button
              label={t('Cancel')}
              onClick={() => setIsDeleteOpen(false)}
            />
          </div>
        </Modal>
      </div>

      <div className={styles.preview}>
        <h2>{t('Preview')}</h2>
        <EventBox
          event={getPreviewEvent()}
          imageURL={imageUrl || previewMiniatureUrl || fallbackMiniature}
          eventStatus={EventStatus.Preview}
        />
      </div>
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

export default EventSettings;
