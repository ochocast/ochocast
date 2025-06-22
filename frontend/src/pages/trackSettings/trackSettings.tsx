import React from 'react';
import { FC, ChangeEvent, useState } from 'react';
import TextArea from '../../components/ReworkComponents/generic/Text/TextArea/TextArea';
import TextBox from '../../components/ReworkComponents/generic/Text/TextBox/TextBox';
import styles from './trackSettings.module.css';
import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';
import { useParams } from 'react-router-dom';
import CheckBoxList from '../../components/ReworkComponents/Event/Track/CheckBoxList/CheckBoxList';
import NavigateBackButton from '../../components/ReworkComponents/Button/NavigateBackButton/NavigateBackButton';
import Modal from '../../components/ReworkComponents/generic/modal/modal';

import { useTrackSettings } from './useTrackSettings';
import { User } from '../../utils/EventsProperties';
import { formatDateForInput, formatTimeForInput } from '../../utils/formatDate';

import { useTranslation } from 'react-i18next';
import EventDashboard from '../../components/ReworkComponents/Event/EventDashboard/EventDashboard';

const TrackSettings: FC = () => {
  const { trackId, eventId } = useParams();
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
    // loading,
    navigate,
  } = useTrackSettings();

  const [isButtonDisabled, setButtonDisabled] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const { t } = useTranslation();

  if (trackId && !track) {
    return <div className="loading">{t('LoadingTrack')}</div>;
  }

  const userString = localStorage.getItem('backendUser');
  const userId = userString ? JSON.parse(userString).id : '';
  const canEdit =
    event?.creatorId === userId || track.speakers?.some((e) => e.id === userId);

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
    if (await handleSubmit(e, track, speakers)) setButtonDisabled(true);
  };

  const closed = track.closed || event?.closed;

  const form = (
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

      <div className={styles.trackDateSpeakerWrapper}>
        <div className={styles.checkBoxListContainer}>
          <CheckBoxList
            allUsers={allUsers}
            category={speakers}
            setCategory={(users: User[]) => {
              setSpeakers(users);
              setButtonDisabled(false);
            }}
            title={t('Speaker')}
            disabled={closed !== undefined && closed}
            userId={userId != event?.creatorId ? userId : ''}
          />
          <div className={styles.trackDateInputs}>
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
                  const [hours, minutes] = e.target.value
                    .split(':')
                    .map(Number);
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
                  const [hours, minutes] = e.target.value
                    .split(':')
                    .map(Number);
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
        <h2>Êtes-vous sûr de vouloir supprimer la piste ?</h2>
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

  const trackInfo = (
    <div className={styles.trackSettings}>
      <div className={styles.topLayout}>
        <div className={styles.titleLayout}>
          <NavigateBackButton />
          <h1>{trackId ? track.name : 'Ereur'}</h1>
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
        disabled={true}
        onChange={handleInputChange('name')}
      />
      <TextArea
        label={t('TrackDescription')}
        placeholder="Description..."
        value={track.description || ''}
        name={t('DescriptionEvent2')}
        error={!track.description}
        disabled={true}
        onChange={handleInputChange('description')}
      />

      <div className={styles.trackDateSpeakerWrapper}>
        <div className={styles.checkBoxListContainer}>
          <CheckBoxList
            allUsers={allUsers}
            category={speakers}
            setCategory={(users: User[]) => {
              setSpeakers(users);
              setButtonDisabled(false);
            }}
            title={t('Speaker')}
            disabled={true}
            userId=""
          />
          <div className={styles.trackDateInputs}>
            <div className={styles.inputWrapper}>
              <label>{t('DateOfTheEvent')}</label>
              <input
                type="date"
                name={t('Date')}
                value={formatDateForInput(track.startDate)}
                disabled={true}
                required
              />
            </div>
            <div className={styles.inputWrapper}>
              <label>{t('StartTrack')}</label>
              <input
                type="time"
                name={t('Start')}
                value={formatTimeForInput(track.startDate)}
                disabled={true}
                required
              />
            </div>
            <div className={styles.inputWrapper}>
              <label>{t('EndOfTheTrack')}</label>
              <input
                type="time"
                name={t('End')}
                value={formatTimeForInput(track.endDate)}
                disabled={true}
                required
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={styles.pageTrackSettings}>
      <EventDashboard eventId={eventId} tracks={tracks} eventClosed={!closed && userId === event?.creatorId} />
      {canEdit ? form : trackInfo}
    </div>
  );
};

export default TrackSettings;
