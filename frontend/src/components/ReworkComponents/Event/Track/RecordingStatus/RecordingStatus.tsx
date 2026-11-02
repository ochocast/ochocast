import React, { FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
  RecordingErrorKind,
  RecordingState,
  RecordingStatus as Status,
} from '../../../../../hooks/useRecordingStatus';
import styles from './RecordingStatus.module.css';

const STATE_LABELS = {
  disabled: 'RecordingStatusDisabled',
  armed_waiting: 'RecordingStatusArmedWaiting',
  recording: 'RecordingStatusRecording',
  error: 'RecordingStatusError',
} as const satisfies Record<RecordingState, string>;

const ERROR_LABELS = {
  start_failed: 'RecordingErrorStartFailed',
  stop_failed: 'RecordingErrorStopFailed',
  recorder_unreachable: 'RecordingErrorRecorderUnreachable',
} as const satisfies Record<RecordingErrorKind, string>;

/** Human-readable reason of a recording failure, with its time if known. */
export const useRecordingErrorMessage = () => {
  const { t } = useTranslation();
  return (error: Status['error']): string => {
    if (!error) return '';
    const reason = t(ERROR_LABELS[error.kind]);
    if (!error.occurredAt) return reason;
    const time = new Date(error.occurredAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${reason} (${time})`;
  };
};

interface RecordingStatusProps {
  status: Status | null;
}

/** US-5c — Real-time recording status shown next to the recording toggle. */
const RecordingStatus: FC<RecordingStatusProps> = ({ status }) => {
  const { t } = useTranslation();
  const errorMessage = useRecordingErrorMessage();
  if (!status) return null;

  return (
    <span
      className={`${styles.status} ${styles[status.state]}`}
      role="status"
      title={errorMessage(status.error) || undefined}
    >
      <span className={styles.dot} aria-hidden="true" />
      {t(STATE_LABELS[status.state])}
    </span>
  );
};

export default RecordingStatus;
