import React, {
  FC,
  ChangeEvent,
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';

import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';
import CheckBoxList from '../../components/ReworkComponents/Event/Track/CheckBoxList/CheckBoxList';
import NavigateBackButton from '../../components/ReworkComponents/Button/NavigateBackButton/NavigateBackButton';
import Modal from '../../components/ReworkComponents/generic/modal/modal';
import Toast from '../../components/ReworkComponents/generic/Toast/Toast';
import EventDashboard from '../../components/ReworkComponents/Event/EventDashboard/EventDashboard';
import Toggle from '../../components/newComponents/Toggle/Toggle';

import { useTrackSettings } from './useTrackSettings';
import { User } from '../../utils/EventsProperties';
import { formatDateForInput, formatTimeForInput } from '../../utils/formatDate';
import { closeTrack, startRecording, stopRecording } from '../../utils/api';

import styles from './trackSettings.module.css';
import getEnv from '../../utils/env';
const CONTROL_PLANE_URL = getEnv('REACT_APP_SFU_CONTROL_PLANE_URL');
const ROOM_STATUS_POLL_INTERVAL_MS = 3000;
const ROOM_STATUS_TIMEOUT_MS = 8 * 60 * 1000;

type RoomLifecycleState =
  | 'provisioning'
  | 'ready'
  | 'failed'
  | 'draining'
  | 'terminated';

type RoomStatusResponse = {
  exists?: boolean;
  room_id?: string;
  state?: RoomLifecycleState;
  ready?: boolean;
  reason?: string;
  whip_url?: string;
};

type CreateRoomResponse = {
  room_id: string;
  key: string;
  state?: RoomLifecycleState;
  ready?: boolean;
  message?: string;
};

const buildWhipUrl = (roomId: string, roomKey: string) =>
  `${CONTROL_PLANE_URL}/whip?room_id=${encodeURIComponent(
    roomId,
  )}&key=${encodeURIComponent(roomKey)}`;

const sleep = (durationMs: number) =>
  new Promise((resolve) => window.setTimeout(resolve, durationMs));

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
  const [isCheckingRoom, setIsCheckingRoom] = useState(false);
  const [roomLifecycleState, setRoomLifecycleState] =
    useState<RoomLifecycleState | null>(null);
  const [roomStatusMessage, setRoomStatusMessage] = useState('');
  const [touched, setTouched] = useState({ name: false, description: false });
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);
  const [isCloseTrackModalOpen, setIsCloseTrackModalOpen] = useState(false);
  const [isRecordingEnabled, setIsRecordingEnabled] = useState(false);
  const [sfuRoomId, setSfuRoomId] = useState<string | null>(null);
  const [sfuRoomKey, setSfuRoomKey] = useState<string | null>(null);
  const [isRecordingLoading, setIsRecordingLoading] = useState(false);

  const qrCodeRef = useRef<HTMLDivElement>(null);

  const fetchRoomStatus = useCallback(async (roomId: string) => {
    try {
      const response = await fetch(
        `${CONTROL_PLANE_URL}/room/status?room_id=${encodeURIComponent(
          roomId,
        )}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        return null;
      }

      return (await response.json()) as RoomStatusResponse;
    } catch (error) {
      console.error('Error fetching room status:', error);
      return null;
    }
  }, []);

  const waitForRoomReady = useCallback(
    async (roomId: string, roomKey: string) => {
      const deadline = Date.now() + ROOM_STATUS_TIMEOUT_MS;

      while (Date.now() < deadline) {
        const status = await fetchRoomStatus(roomId);
        const state = status?.state;

        if (state) {
          setRoomLifecycleState(state);
        }

        if (status?.ready || state === 'ready') {
          setRoomStatusMessage('');
          return buildWhipUrl(roomId, roomKey);
        }

        if (state === 'failed' || state === 'terminated') {
          throw new Error(status?.reason || 'Room provisioning failed');
        }

        setRoomLifecycleState(state || 'provisioning');
        setRoomStatusMessage(t('RoomProvisioningDescription'));
        await sleep(ROOM_STATUS_POLL_INTERVAL_MS);
      }

      throw new Error('Room provisioning timed out');
    },
    [fetchRoomStatus, t],
  );

  const checkRoomExists = useCallback(async () => {
    if (!trackId) return;

    setIsCheckingRoom(true);
    try {
      const status = await fetchRoomStatus(trackId);
      if (status?.state === 'failed' || status?.state === 'terminated') {
        setRoomLifecycleState(status.state);
        setRoomStatusMessage(status.reason || '');
        setSfuUrl('');
        return;
      }

      if (
        status?.state === 'provisioning' ||
        status?.state === 'draining' ||
        status?.ready === false
      ) {
        setRoomLifecycleState(status.state || 'provisioning');
        setRoomStatusMessage(t('RoomProvisioningDescription'));
        setSfuUrl('');
        return;
      }

      if (status?.ready || status?.state === 'ready') {
        setRoomLifecycleState('ready');
        setRoomStatusMessage('');
        if (status.whip_url) {
          setSfuUrl(status.whip_url);
          return;
        }
      }

      const response = await fetch(
        `${CONTROL_PLANE_URL}/room/exists?room_id=${trackId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error('Failed to check room');
      }

      const data = await response.json();
      if (data.exists && data.whip_url) {
        setRoomLifecycleState('ready');
        setRoomStatusMessage('');
        setSfuUrl(data.whip_url);
      } else {
        setRoomLifecycleState(null);
        setRoomStatusMessage('');
        setSfuUrl('');
      }
    } catch (error) {
      console.error('Error checking room:', error);
      setRoomLifecycleState(null);
      setRoomStatusMessage('');
      setSfuUrl('');
    } finally {
      setIsCheckingRoom(false);
    }
  }, [fetchRoomStatus, t, trackId]);

  useEffect(() => {
    if (trackId) {
      checkRoomExists();
    }
  }, [trackId, checkRoomExists]);

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
  };
  const toggleDeleteModal = () => setIsDeleteModalOpen(!isDeleteModalOpen);

  const handleStartLiveOBS = async () => {
    if (!trackId) return;

    setIsLoadingSfu(true);
    setSfuUrl('');
    setRoomLifecycleState('provisioning');
    setRoomStatusMessage(t('RoomProvisioningDescription'));
    try {
      const response = await fetch(`${CONTROL_PLANE_URL}/room/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          room_id: trackId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create room');
      }

      const data = (await response.json()) as CreateRoomResponse;
      // Store room info for recording
      setSfuRoomId(data.room_id);
      setSfuRoomKey(data.key);

      const state = data.state || (data.ready ? 'ready' : 'provisioning');
      setRoomLifecycleState(state);

      const whipUrl =
        state === 'ready' || data.ready
          ? buildWhipUrl(data.room_id, data.key)
          : await waitForRoomReady(data.room_id, data.key);

      setSfuUrl(whipUrl);
      setRoomLifecycleState('ready');
      setRoomStatusMessage('');
      setIsOpen(false);
      setToast({
        message: t('RoomCreatedSuccessfully'),
        type: 'success',
      });
    } catch (error) {
      console.error('Error creating SFU room:', error);
      setRoomStatusMessage('');
      setToast({
        message: t('ErrorCreatingRoom'),
        type: 'error',
      });
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

  const handleCloseTrack = async () => {
    if (!trackId) return;
    try {
      const res = await closeTrack(trackId);
      if (res.status === 200) {
        setTrack({ ...track, closed: true });
        setIsCloseTrackModalOpen(false);
        setToast({
          message: t('trackClosed'),
          type: 'success',
        });
      } else {
        setToast({
          message: t('trackCouldNotBeClosed'),
          type: 'error',
        });
      }
    } catch (error) {
      setToast({
        message: t('trackCouldNotBeClosed'),
        type: 'error',
      });
    }
  };

  const handleRecordingToggle = async (e: ChangeEvent<HTMLInputElement>) => {
    const enabled = e.target.checked;

    if (!sfuRoomId || !sfuRoomKey || !trackId) {
      setToast({
        message: t('StartLiveFirst'),
        type: 'error',
      });
      return;
    }

    setIsRecordingLoading(true);

    try {
      if (enabled) {
        // Start recording
        const response = await startRecording({
          trackId: trackId,
          roomId: sfuRoomId,
          roomKey: sfuRoomKey,
          sfuUrl: CONTROL_PLANE_URL,
        });

        if (!response.ok) {
          throw new Error('Failed to start recording');
        }

        setIsRecordingEnabled(true);
        setToast({
          message: t('RecordingStarted'),
          type: 'success',
        });
      } else {
        // Stop recording
        const response = await stopRecording(trackId);

        if (!response.ok) {
          throw new Error('Failed to stop recording');
        }

        setIsRecordingEnabled(false);
        setToast({
          message: t('RecordingStopped'),
          type: 'success',
        });
      }
    } catch (error) {
      console.error('Recording toggle error:', error);
      setToast({
        message: enabled ? t('RecordingStartError') : t('RecordingStopError'),
        type: 'error',
      });
    } finally {
      setIsRecordingLoading(false);
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
          <div className={styles.liveControls}>
            <Toggle
              checked={isRecordingEnabled}
              onChange={handleRecordingToggle}
              label={t('EnableRecording')}
              disabled={!!closed || !sfuRoomId || isRecordingLoading}
            />
            <Button
              label={t('StartLive')}
              onClick={toggle}
              type={closed ? ButtonType.disabled : ButtonType.secondary}
            />
          </div>
        )}
      </div>
      <hr />

      <Modal isOpen={isOpen} toggle={toggle}>
        <h1>{t('StartLive')}</h1>
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
      </Modal>

      <div className={styles.trackDateSpeakerWrapper}>
        <h3>{t('BasicInformation') || 'Basic Information'}</h3>

        <div className={styles.inputWrapper}>
          <label>{t('TrackName')}</label>
          <input
            type="text"
            placeholder={t('MyTrack')}
            value={track.name || ''}
            name={t('Name')}
            disabled={closed}
            onChange={handleInputChange('name')}
            className={!track.name && touched.name ? styles.error : ''}
            required
          />
        </div>

        <div className={styles.inputWrapper}>
          <label>{t('TrackDescription')}</label>
          <textarea
            placeholder={t('DescriptionEvent')}
            value={track.description || ''}
            name={t('DescriptionEvent2')}
            disabled={closed}
            onChange={handleInputChange('description')}
            className={
              !track.description && touched.description ? styles.error : ''
            }
            required
          />
        </div>
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
        {trackId && !track.closed && !event?.closed && (
          <Button
            label={t('CloseTrack')}
            onClick={() => setIsCloseTrackModalOpen(true)}
            type={ButtonType.primary}
          />
        )}
        {trackId && (
          <Button label={t('DeleteTrack')} onClick={toggleDeleteModal} />
        )}
      </div>

      {track.closed && (
        <div className={styles.formSection}>
          <h2 style={{ color: 'var(--theme-color-700, #666)', margin: 0 }}>
            {t('TrackIsClosed')}
          </h2>
        </div>
      )}

      <Modal
        isOpen={isCloseTrackModalOpen}
        toggle={() => setIsCloseTrackModalOpen(false)}
      >
        <h2>{t('SureCloseTrack')}</h2>
        <div className={styles.confirmationButtons}>
          <Button label={t('Confirm')} onClick={handleCloseTrack} />
          <Button
            label={t('Cancel')}
            onClick={() => setIsCloseTrackModalOpen(false)}
          />
        </div>
      </Modal>

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
      <div className={styles.inputWrapper}>
        <label>{t('TrackName')}</label>
        <input
          type="text"
          placeholder={t('MyTrack')}
          value={track.name || ''}
          name={t('Name')}
          disabled
        />
      </div>
      <div className={styles.inputWrapper}>
        <label>{t('TrackDescription')}</label>
        <textarea
          placeholder="Description..."
          value={track.description || ''}
          name={t('DescriptionEvent2')}
          disabled
        />
      </div>

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
            {isCheckingRoom && (
              <div className={styles.roomStatus}>
                <p>{t('CheckingRoom') || 'Checking room status...'}</p>
              </div>
            )}
            {roomLifecycleState === 'provisioning' && (
              <div className={styles.roomStatus}>
                <strong>{t('RoomProvisioningTitle')}</strong>
                <p>{roomStatusMessage || t('RoomProvisioningDescription')}</p>
              </div>
            )}
            {sfuUrl && (
              <div className={styles.sfuUrlContainer}>
                <h4>{t('LiveStreamURL')}</h4>
                <p>{t('TrackUseTheFollowingURL')}</p>
                <div className={styles.urlBox}>
                  <code>{sfuUrl}</code>
                </div>
                <Button
                  label={t('CopyURL')}
                  onClick={() => {
                    navigator.clipboard.writeText(sfuUrl);
                    setToast({
                      message: t('URLCopied'),
                      type: 'success',
                    });
                  }}
                  type={ButtonType.secondary}
                />
              </div>
            )}
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
