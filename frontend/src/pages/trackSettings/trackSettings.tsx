import React, { FC, ChangeEvent, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import TextArea from '../../components/ReworkComponents/generic/Text/TextArea/TextArea';
import TextBox from '../../components/ReworkComponents/generic/Text/TextBox/TextBox';
import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';
import CheckBoxList from '../../components/ReworkComponents/Event/Track/CheckBoxList/CheckBoxList';
import NavigateBackButton from '../../components/ReworkComponents/Button/NavigateBackButton/NavigateBackButton';
import Modal from '../../components/ReworkComponents/generic/modal/modal';
import EventDashboard from '../../components/ReworkComponents/Event/EventDashboard/EventDashboard';

import { useTrackSettings } from './useTrackSettings';
import { User } from '../../utils/EventsProperties';
import { formatDateForInput, formatTimeForInput } from '../../utils/formatDate';

import styles from './trackSettings.module.css';

const TrackSettings: FC = () => {
  const { trackId, eventId } = useParams();
  const { t } = useTranslation();

  const {
    allUsers,
    event,
    tracks,
    track,
    setTrack,
    speakers,
    setSpeakers,
    message,
    setMessage,
    handleSubmit,
    handleDelete,
    navigate,
  } = useTrackSettings();

  const [isButtonDisabled, setButtonDisabled] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  if (trackId && !track) {
    return <div className="loading">{t('LoadingTrack')}</div>;
  }

  const userString = localStorage.getItem('backendUser');
  const userId = userString ? JSON.parse(userString).id : '';
  const canEdit =
    event?.creatorId === userId || track.speakers?.some((e) => e.id === userId);
  const closed = track.closed || event?.closed;

  const toggle = () => setIsOpen(!isOpen);
  const toggleDeleteModal = () => setIsDeleteModalOpen(!isDeleteModalOpen);

  const handleInputChange =
    (field: keyof typeof track) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setTrack({ ...track, [field]: e.target.value });
      setButtonDisabled(false);
      setMessage('');
    };

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (await handleSubmit(e, track, speakers)) {
      setButtonDisabled(true);
    }
  };

  const renderForm = () => (
    <form onSubmit={handleFormSubmit} className={styles.trackSettings}>
      <div className={styles.topLayout}>
        <div className={styles.titleLayout}>
          <NavigateBackButton />
          <h1>{trackId ? track.name : t('NewTrack')}</h1>
        </div>
        {trackId && (
          <Button
            label={t('StartLive')}
            onClick={toggle}
            type={closed ? ButtonType.disabled : ButtonType.secondary}
          />
        )}
      </div>
      <hr />

      <Modal isOpen={isOpen} toggle={toggle}>
        <h1>{t('StartLive')}</h1>
        <div className={styles.startLiveButtons}>
          <Button label={t('StartLiveOBS')} />
          <Button
            label={t('StartLiveOCHOCast')}
            onClick={() => navigate(`/tracks/${trackId}/streaming`)}
          />
        </div>
      </Modal>

      <div className={styles.trackDateSpeakerWrapper}>
        <TextBox
          type="text"
          label={t('TrackName')}
          placeholder={t('MyTrack')}
          value={track.name || ''}
          name={t('Name')}
          error={!track.name}
          disabled={closed}
          onChange={handleInputChange('name')}
        />

        <TextArea
          label={t('TrackDescription')}
          placeholder={t('DescriptionEvent')}
          value={track.description || ''}
          name={t('DescriptionEvent2')}
          error={!track.description}
          disabled={closed}
          onChange={handleInputChange('description')}
        />
        <CheckBoxList
          allUsers={allUsers}
          category={speakers}
          setCategory={(users: User[]) => {
            setSpeakers(users);
            setButtonDisabled(false);
          }}
          title={t('Speaker')}
          disabled={!!closed}
          userId={userId !== event?.creatorId ? userId : ''}
        />

        <div className={styles.inputWrapper}>
          <label>{t('DateOfTheEvent')}</label>
          <input
            type="date"
            name={t('Date')}
            value={formatDateForInput(track.startDate)}
            disabled
            required
          />
        </div>

        <div className={styles.inputWrapper}>
          <label>{t('StartTrack')}</label>
          <input
            type="time"
            name={t('Start')}
            value={formatTimeForInput(track.startDate)}
            onChange={(e) => {
              const [hours, minutes] = e.target.value.split(':').map(Number);
              const current = new Date(track.startDate || new Date());
              current.setUTCHours(hours);
              current.setUTCMinutes(minutes);
              current.setSeconds(0);
              current.setMilliseconds(0);
              setTrack({ ...track, startDate: current });
              setButtonDisabled(false);
              setMessage('');
            }}
            disabled={closed}
            required
          />
        </div>
        <div className={styles.inputWrapper}>
          <label>{t('EndOfTheTrack')}</label>
          <input
            type="time"
            name={t('End')}
            value={formatTimeForInput(track.endDate)}
            onChange={(e) => {
              const [hours, minutes] = e.target.value.split(':').map(Number);
              const current = new Date(track.endDate || new Date());
              current.setUTCHours(hours);
              current.setUTCMinutes(minutes);
              current.setSeconds(0);
              current.setMilliseconds(0);
              setTrack({ ...track, endDate: current });
              setButtonDisabled(false);
              setMessage('');
            }}
            disabled={closed}
            required
          />
        </div>
      </div>

      <div className={styles.controlsContainer}>
        <Button
          label={trackId ? t('Save') : t('Create')}
          type={
            isButtonDisabled || closed
              ? ButtonType.disabled
              : ButtonType.secondary
          }
        />
        {trackId && (
          <Button label={t('DeleteTrack')} onClick={toggleDeleteModal} />
        )}
      </div>

      <Modal isOpen={isDeleteModalOpen} toggle={toggleDeleteModal}>
        <div className={styles.confirmationButtons}>
          <Button label={t('Delete')} onClick={handleDelete} />
          <Button
            label={t('Cancel')}
            onClick={() => {
              toggleDeleteModal();
              setMessage('');
            }}
          />
        </div>
      </Modal>

      <div className="message">{message && <p>{message}</p>}</div>
    </form>
  );

  const renderReadOnly = () => (
    <div className={styles.trackSettings}>
      <div className={styles.topLayout}>
        <div className={styles.titleLayout}>
          <NavigateBackButton />
          <h1>{track.name || 'Erreur'}</h1>
        </div>
      </div>
      <hr />
      <TextBox
        type="text"
        label={t('TrackName')}
        placeholder={t('MyTrack')}
        value={track.name || ''}
        name={t('Name')}
        error={!track.name}
        disabled
        onChange={handleInputChange('name')}
      />
      <TextArea
        label={t('TrackDescription')}
        placeholder="Description..."
        value={track.description || ''}
        name={t('DescriptionEvent2')}
        error={!track.description}
        disabled
        onChange={handleInputChange('description')}
      />

      <CheckBoxList
        allUsers={allUsers}
        category={speakers}
        setCategory={() => {}}
        title={t('Speaker')}
        disabled
        userId=""
      />
      <div className={styles.inputWrapper}>
        <label>{t('DateOfTheEvent')}</label>
        <input
          type="date"
          name={t('Date')}
          value={formatDateForInput(track.startDate)}
          disabled
          required
        />
      </div>
      <div className={styles.inputWrapper}>
        <label>{t('StartTrack')}</label>
        <input
          type="time"
          name={t('Start')}
          value={formatTimeForInput(track.startDate)}
          disabled
          required
        />
      </div>
      <div className={styles.inputWrapper}>
        <label>{t('EndOfTheTrack')}</label>
        <input
          type="time"
          name={t('End')}
          value={formatTimeForInput(track.endDate)}
          disabled
          required
        />
      </div>
    </div>
  );

  return (
    <div className={styles.pageTrackSettings}>
      <EventDashboard
        eventId={eventId}
        tracks={tracks}
        eventClosed={!closed && userId === event?.creatorId}
      />
      {canEdit ? renderForm() : renderReadOnly()}
    </div>
  );
};

export default TrackSettings;
