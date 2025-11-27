import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './PollCreator.module.css';
import { createPoll } from '../../utils/api';
import { useSocket } from '../../hooks/useSocket';

interface PollCreatorProps {
  trackId: string;
  onPollCreated?: () => void;
}

const DURATION_OPTIONS = [
  { label: '1 min', value: 60 },
  { label: '2 min', value: 120 },
  { label: '5 min', value: 300 },
  { label: '10 min', value: 600 },
];

const PollCreator: React.FC<PollCreatorProps> = ({
  trackId,
  onPollCreated,
}) => {
  const { socket } = useSocket({ trackId, username: '' });
  const { t } = useTranslation();
  const [question, setQuestion] = useState('');
  const [responses, setResponses] = useState(['', '']);
  const [duration, setDuration] = useState(60);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [charWarning, setCharWarning] = useState<string | null>(null);

  const MAX_QUESTION_LENGTH = 200;
  const MAX_RESPONSE_LENGTH = 100;

  const handleAddResponse = () => {
    if (responses.length < 4) {
      setResponses([...responses, '']);
    }
  };

  const handleRemoveResponse = (index: number) => {
    if (responses.length > 2) {
      setResponses(responses.filter((_, i) => i !== index));
    }
  };

  const handleResponseChange = (index: number, value: string) => {
    const newResponses = [...responses];
    newResponses[index] = value.substring(0, MAX_RESPONSE_LENGTH);
    setResponses(newResponses);

    // Check character warning for responses
    if (value.length > MAX_RESPONSE_LENGTH) {
      setCharWarning(
        `${t('polls.response')} ${index + 1}: ${MAX_RESPONSE_LENGTH} ${t('polls.maxCharacters')}`,
      );
    } else {
      setCharWarning(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!question.trim()) {
      setError(t('polls.requiredQuestion'));
      return;
    }

    const validResponses = responses.filter((r) => r.trim());
    if (validResponses.length < 2) {
      setError(t('polls.minimumResponses'));
      return;
    }

    if (validResponses.length !== responses.length) {
      setError(t('polls.allResponsesFilled'));
      return;
    }

    try {
      setIsLoading(true);
      const pollData = {
        question: question.trim(),
        responses: validResponses,
        duration,
        trackId,
      };

      const response = await createPoll(pollData);

      if (response.ok && response.data) {
        // Emit poll creation via websocket
        if (socket) {
          socket.emit('pollCreated', {
            trackId,
            poll: response.data,
          });
        }

        // Reset form
        setQuestion('');
        setResponses(['', '']);
        setDuration(60);
        onPollCreated?.();
      } else {
        setError(t('polls.creationError'));
      }
    } catch (err) {
      setError(t('polls.creationError'));
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <h3>{t('polls.createPoll')}</h3>
      <form onSubmit={handleSubmit} className={styles.form}>
        {error && <div className={styles.error}>{error}</div>}
        {charWarning && <div className={styles.warning}>{charWarning}</div>}

        <div className={styles.formGroup}>
          <div className={styles.labelWithCounter}>
            <label>{t('polls.question')}</label>
            <span className={styles.charCounter}>
              {question.length}/{MAX_QUESTION_LENGTH}
            </span>
          </div>
          <input
            type="text"
            value={question}
            onChange={(e) => {
              const value = e.target.value.substring(0, MAX_QUESTION_LENGTH);
              setQuestion(value);
              if (e.target.value.length > MAX_QUESTION_LENGTH) {
                setCharWarning(
                  `${t('polls.question')}: ${MAX_QUESTION_LENGTH} ${t('polls.maxCharacters')}`,
                );
              } else {
                setCharWarning(null);
              }
            }}
            maxLength={MAX_QUESTION_LENGTH}
            placeholder={t('polls.enterQuestion')}
            disabled={isLoading}
          />
        </div>

        <div className={styles.responsesSection}>
          <label>{t('polls.responses')}</label>
          {responses.map((response, index) => (
            <div key={index} className={styles.responseInputWrapper}>
              <div className={styles.responseInput}>
                <input
                  type="text"
                  value={response}
                  onChange={(e) => handleResponseChange(index, e.target.value)}
                  maxLength={MAX_RESPONSE_LENGTH}
                  placeholder={`${t('polls.response')} ${index + 1}`}
                  disabled={isLoading}
                />
                {responses.length > 2 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveResponse(index)}
                    className={styles.removeBtn}
                    disabled={isLoading}
                  >
                    ×
                  </button>
                )}
              </div>
              <span className={styles.charCounter}>
                {response.length}/{MAX_RESPONSE_LENGTH}
              </span>
            </div>
          ))}

          {responses.length < 4 && (
            <button
              type="button"
              onClick={handleAddResponse}
              className={styles.addBtn}
              disabled={isLoading}
            >
              {t('polls.addResponse')}
            </button>
          )}
        </div>

        <div className={styles.formGroup}>
          <label>{t('polls.duration')}</label>
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            disabled={isLoading}
          >
            {DURATION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className={styles.submitBtn} disabled={isLoading}>
          {isLoading ? t('polls.creatingPoll') : t('polls.createPollBtn')}
        </button>
      </form>
    </div>
  );
};

export default PollCreator;
