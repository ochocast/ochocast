import { FC, useState, ChangeEvent, FormEvent, useEffect } from 'react';
import React from 'react';
import styles from './eventSettings.module.css';
import TextArea from '../../components/ReworkComponents/generic/Text/TextArea/TextArea';
import TextBox from '../../components/ReworkComponents/generic/Text/TextBox/TextBox';
import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getPrivateEvent,
  updateEvent,
  deleteEvent,
  closeEvent,
} from '../../utils/api';
import { Track } from '../../utils/EventsProperties';
import NavigateBackButton from '../../components/ReworkComponents/Button/NavigateBackButton/NavigateBackButton';
import logger from '../../utils/logger';
import { useTranslation } from 'react-i18next';
import InputFile from '../../components/ReworkComponents/inputFile/InputFile';
import Modal from '../../components/ReworkComponents/generic/modal/modal';
import EventDashboard from '../../components/ReworkComponents/Event/EventDashboard/EventDashboard';

interface EventSettingsProps {}

const EventSettings: FC<EventSettingsProps> = () => {
  const { t } = useTranslation();
  const { eventId } = useParams();

  const [isButtonDisabled, setButtonDisabled] = useState(true);
  const [eventClosed, setEventClosed] = useState(false);

  const [isDeleteOpen, setisDeleteOpen] = useState(false);
  const toggleDeleteModal = () => setisDeleteOpen(false);

  const [isOpen, setisOpen] = useState(false);
  const toggle = () => setisOpen(!isOpen);

  const [name, setName] = useState('');
  const [errorName, setErrorName] = useState(false);
  const [description, setDescription] = useState('');
  const [errorDescription, setErrorDescription] = useState(false);
  const [date, setDate] = useState('');
  const [startHour, setStartHour] = useState('');
  const [endHour, setEndHour] = useState('');
  const [message, setMessage] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isFetchError, setIsFetchError] = useState(false);
  const [creatorId, setCreatorId] = useState('');

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const userString = localStorage.getItem('backendUser');
  const userId = userString ? JSON.parse(userString).id : '';
  const navigate = useNavigate();

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const res = await getPrivateEvent(eventId);
        if (res.status === 200) {
          if (res.data.closed) setEventClosed(true);
          setTracks(res.data.tracks);
          setName(res.data.name);
          setDescription(res.data.description);
          setDate(res.data.startDate.split('T')[0]);
          setStartHour(res.data.startDate.match(/\d{2}:\d{2}/)?.[0] || '');
          setEndHour(res.data.endDate.match(/\d{2}:\d{2}/)?.[0] || '');
          setCreatorId(res.data.creator.id);
        }
      } catch (error) {
        logger.error(`Failed to fetch event: ${error}`);
        setIsFetchError(true);
      }
    };
    fetchEvent();
  }, [eventId]);

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedImage(file);
    setButtonDisabled(false);
    setMessage('');

    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string' && setImageUrl(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    let isError = false;
    if (!name.trim()) {
      setErrorName(true);
      isError = true;
    }
    if (!description.trim()) {
      setErrorDescription(true);
      isError = true;
    }
    if (!isError) {
      try {
        if (selectedImage) {
          const formData = new FormData();
          formData.append('image_slug', selectedImage.name);
          formData.append('name', name);
          formData.append('description', description);
          formData.append('startDate', date + 'T' + startHour + ':00.000Z');
          formData.append('endDate', date + 'T' + endHour + ':00.000Z');
          formData.append('miniature', selectedImage);
          await updateEvent(eventId, formData);
        } else {
          await updateEvent(eventId, {
            name,
            description,
            tags: [],
            startDate: date + 'T' + startHour + ':00.000Z',
            endDate: date + 'T' + endHour + ':00.000Z',
            isPrivate: true,
          });
        }
        setMessage(t('eventModified'));
        setButtonDisabled(true);
      } catch (error) {
        logger.error(error);
        setMessage(t('eventCouldNotBeModified'));
      }
    }
  };

  const deleteEventHandler = async () => {
    try {
      await deleteEvent(eventId);
      navigate('/events/');
    } catch (error) {
      setMessage(t('eventCouldNotBeDeleted'));
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
        toggle();
        setMessage(t('eventClosed'));
      }
    } catch (error) {
      setMessage(t('eventCouldNotClosed'));
    }
  };

  if (isFetchError)
    return (
      <Button
        label={t('eventUnavailableReturnPresentationPage')}
        onClick={() => navigate('/events')}
      />
    );

  return (
    <div className={styles.pageEventSettings}>
      <EventDashboard
        eventId={eventId}
        tracks={tracks}
        eventClosed={!eventClosed && userId === creatorId}
      />
      <form onSubmit={handleSubmit} className={styles.eventSettings}>
        <div className={styles.topLayout}>
          <div className={styles.titleLayout}>
            <NavigateBackButton />
            <h1>{t('EditEvent')}</h1>
          </div>
          {eventClosed ? (
            <h2>{t('EventClosed')}</h2>
          ) : (
            <Button label={t('CloseEvent')} onClick={toggle} />
          )}
        </div>
        <Modal isOpen={isOpen} toggle={toggle}>
          <h2>{t('SureCloseEvent')}</h2>
          <div className={styles.confirmationButtons}>
            <Button label={t('Confirm')} onClick={handleCloseEvent} />
            <Button
              label={t('Cancel')}
              onClick={() => {
                toggle();
                setModalMessage('');
              }}
            />
          </div>
          <div className={styles.message}>
            {modalMessage && <p>{modalMessage}</p>}
          </div>
        </Modal>
        <TextBox
          type="text"
          label={t('Name')}
          placeholder={t('NameEvent')}
          name={name}
          value={name}
          error={errorName}
          disabled={eventClosed}
          onChange={(e) => {
            setName(e.target.value);
            setButtonDisabled(false);
            setMessage('');
          }}
        />
        <div className={styles.inputWrapper}>
          <label>{t('DateOfTheEvent')}</label>
          <input
            type="date"
            value={date}
            min={new Date().toISOString().split('T')[0]}
            onChange={(e) => {
              setDate(e.target.value);
              setButtonDisabled(false);
              setMessage('');
            }}
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
              setMessage('');
            }}
            disabled={eventClosed}
            required
          />
        </div>
        <div className={styles.inputWrapper}>
          <label>{t('EndEvent')}</label>
          <input
            type="time"
            min={startHour}
            value={endHour}
            onChange={(e) => {
              setEndHour(e.target.value);
              setButtonDisabled(false);
              setMessage('');
            }}
            disabled={eventClosed}
            required
          />
        </div>
        <TextArea
          label={t('DescriptionEvent2')}
          placeholder={t('EventDescription')}
          value={description}
          name={t('DescriptionEvent2')}
          error={errorDescription}
          disabled={eventClosed}
          onChange={(e) => {
            setDescription(e.target.value);
            setButtonDisabled(false);
            setMessage('');
          }}
        />
        <div className={styles.inputWrapper}>
          <label>{t('Thumbnail')}</label>
          <InputFile
            placeholder={t('ChooseThumbnail')}
            onChange={handleImageChange}
            disable={eventClosed}
            required={false}
          />
          {imageUrl && (
            <img
              src={imageUrl}
              alt="preview"
              style={{ width: 100, height: 100, objectFit: 'cover' }}
            />
          )}
        </div>
        {!eventClosed && (
          <div className={styles.confirmationButtons}>
            <Button
              label={t('DeleteEvent')}
              onClick={() => setisDeleteOpen(true)}
            />
            <Button
              label={t('Save')}
              type={
                isButtonDisabled ? ButtonType.disabled : ButtonType.secondary
              }
            />
          </div>
        )}
        <Modal isOpen={isDeleteOpen} toggle={toggleDeleteModal}>
          <h2>{t('SureDeleteEvent')}</h2>
          <div className={styles.confirmationButtons}>
            <Button label={t('Delete')} onClick={deleteEventHandler} />
            <Button
              label={t('Cancel')}
              onClick={() => {
                toggleDeleteModal();
                setModalMessage('');
              }}
            />
          </div>
          <div className={styles.message}>
            {modalMessage && <p>{modalMessage}</p>}
          </div>
        </Modal>
        <div className={styles.message}>{message && <p>{message}</p>}</div>
      </form>
    </div>
  );
};

export default EventSettings;
