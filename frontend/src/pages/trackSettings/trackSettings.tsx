import React, { FC, ChangeEvent, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';

import TextArea from '../../components/ReworkComponents/generic/Text/TextArea/TextArea';
import TextBox from '../../components/ReworkComponents/generic/Text/TextBox/TextBox';
import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';
import CheckBoxList from '../../components/ReworkComponents/Event/Track/CheckBoxList/CheckBoxList';
import NavigateBackButton from '../../components/ReworkComponents/Button/NavigateBackButton/NavigateBackButton';
import Modal from '../../components/ReworkComponents/generic/modal/modal';
import Toast from '../../components/ReworkComponents/generic/Toast/Toast';
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
  } = useTrackSettings();

  const [isButtonDisabled, setButtonDisabled] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [sfuUrl, setSfuUrl] = useState<string>('');
  const [isLoadingSfu, setIsLoadingSfu] = useState(false);
  const [touched, setTouched] = useState({ name: false, description: false });
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  const qrCodeRef = useRef<HTMLDivElement>(null);

  const handleDownloadQRCode = async () => {
    if (!qrCodeRef.current) return;

    try {
      const svg = qrCodeRef.current.querySelector('svg');
      if (!svg) return;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const svgData = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      const svgBlob = new Blob([svgData], {
        type: 'image/svg+xml;charset=utf-8',
      });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);

        canvas.toBlob((blob) => {
          if (!blob) return;
          const downloadUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = `qr-code-${trackId}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(downloadUrl);

          setToast({
            message: t('QRCodeDownloaded'),
            type: 'success',
          });
        });
      };

      img.src = url;
    } catch (error) {
      console.error('Error downloading QR code:', error);
      setToast({
        message: t('QRCodeDownloadError'),
        type: 'error',
      });
    }
  };

  if (trackId && !track) {
    return <div className="loading">{t('LoadingTrack')}</div>;
  }

  const userString = localStorage.getItem('backendUser');
  const userId = userString ? JSON.parse(userString)?.id || '' : '';
  const canEdit =
    event?.creatorId === userId ||
    track?.speakers?.some((e) => e.id === userId);
  const closed = track?.closed || event?.closed;

  const toggle = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setSfuUrl('');
    }
  };
  const toggleDeleteModal = () => setIsDeleteModalOpen(!isDeleteModalOpen);

  const handleStartLiveOBS = async () => {
    if (!trackId) return;

    setIsLoadingSfu(true);
    try {
      const response = await fetch(
        'https://sfu.demo.ochocast.fr/room/create',
        // 'http://localhost:8090/room/create',
        // 'http://localhost:8079/room/create',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            room_id: trackId,
          }),
        },
      );

      if (!response.ok) {
        throw new Error('Failed to create room');
      }

      const data = await response.json();
      const whipUrl = `https://sfu.demo.ochocast.fr/whip?room_id=${data.room_id}&key=${data.key}`;
      // const whipUrl = `http://localhost:8090/whip?room_id=${data.room_id}&key=${data.key}`;
      // const whipUrl = `http://localhost:8079/whip?room_id=${data.room_id}&key=${data.key}`;
      setSfuUrl(whipUrl);
    } catch (error) {
      console.error('Error creating SFU room:', error);
      setMessage('Error creating room. Please try again.');
    } finally {
      setIsLoadingSfu(false);
    }
  };

  const handleInputChange =
    (field: keyof typeof track) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setTrack({ ...track, [field]: e.target.value });
      setButtonDisabled(false);
      setMessage('');
      setTouched({ ...touched, [field]: true });
    };

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (await handleSubmit(e, track, speakers)) {
      setButtonDisabled(true);
      setToast({
        message: trackId ? t('TrackModified') : t('TrackCreated'),
        type: 'success',
      });
    } else {
      setToast({
        message: message || t('ErrorSavingTrack'),
        type: 'error',
      });
    }
  };

  const handleTrackDelete = async () => {
    try {
      await handleDelete();
      setToast({
        message: t('TrackDeletedSuccessfully'),
        type: 'success',
      });
    } catch (error) {
      setToast({
        message: t('DeleteTrackError'),
        type: 'error',
      });
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
        {!sfuUrl ? (
          <div className={styles.startLiveButtons}>
            <Button
              label={isLoadingSfu ? t('Loading') : t('StartLiveOBS')}
              onClick={handleStartLiveOBS}
              type={isLoadingSfu ? ButtonType.disabled : ButtonType.secondary}
            />
            {/* <Button
              label={t('StartLiveOCHOCast')}
              onClick={() => navigate(`/tracks/${trackId}/streaming`)}
            /> */}
          </div>
        ) : (
          <div className={styles.sfuUrlContainer}>
            <p>{t('TrackUseTheFollowingURL')}</p>
            <div className={styles.urlBox}>
              <code>{sfuUrl}</code>
            </div>
            <Button
              label={t('CopyURL')}
              onClick={() => {
                navigator.clipboard.writeText(sfuUrl);
                setMessage(t('URLCopied'));
              }}
              type={ButtonType.secondary}
            />
          </div>
        )}
      </Modal>

      <div className={styles.trackDateSpeakerWrapper}>
        <h3>{t('BasicInformation') || 'Basic Information'}</h3>

        <TextBox
          type="text"
          label={t('TrackName')}
          placeholder={t('MyTrack')}
          value={track.name || ''}
          name={t('Name')}
          error={!track.name && touched.name}
          disabled={closed}
          onChange={handleInputChange('name')}
        />

        <TextArea
          label={t('TrackDescription')}
          placeholder={t('DescriptionEvent')}
          value={track.description || ''}
          name={t('DescriptionEvent2')}
          error={!track.description && touched.description}
          disabled={closed}
          onChange={handleInputChange('description')}
        />
      </div>

      <div className={styles.trackDateSpeakerWrapper}>
        <h3>{t('Speaker') || 'Speakers'}</h3>

        <CheckBoxList
          allUsers={allUsers}
          category={speakers}
          setCategory={(users: User[]) => {
            setSpeakers(users);
            setButtonDisabled(false);
          }}
          title=""
          disabled={!!closed}
          userId={userId !== event?.creatorId ? userId : ''}
        />
      </div>

      <div className={styles.trackDateSpeakerWrapper}>
        <h3>{t('Schedule') || 'Schedule'}</h3>

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
          <Button label={t('Delete')} onClick={handleTrackDelete} />
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
        error={false}
        disabled
        onChange={handleInputChange('name')}
      />
      <TextArea
        label={t('TrackDescription')}
        placeholder="Description..."
        value={track.description || ''}
        name={t('DescriptionEvent2')}
        error={false}
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

  const publicTrackUrl = trackId
    ? `${window.location.origin}/public/track/${trackId}`
    : '';

  return (
    <div className={styles.pageTrackSettings}>
      <EventDashboard
        eventId={eventId}
        tracks={tracks}
        eventClosed={!closed && userId === event?.creatorId}
      />
      <div className={styles.mainContentWrapper}>
        {canEdit ? renderForm() : renderReadOnly()}
        {trackId && (
          <div className={styles.qrCodeContainer}>
            <h3>QR Code</h3>
            <div ref={qrCodeRef} className={styles.qrCodeWrapper}>
              <QRCodeSVG value={publicTrackUrl} size={200} level="H" />
            </div>
            <p className={styles.qrCodeUrl}>{publicTrackUrl}</p>
            <Button
              label={t('DownloadQRCode')}
              onClick={handleDownloadQRCode}
              type={ButtonType.secondary}
            />
          </div>
        )}
      </div>
      {toast && (
        <Toast
          key={`${toast.message}-${toast.type}`}
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default TrackSettings;
