import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSilenceAnalysis, requestSilenceAnalysis } from '../../utils/api';
import { EditSegment, formatTime } from './editorState';
import { applyAnalysisCuts } from './analysisState';
import styles from './videoEdit.module.css';
interface Analysis {
  id: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  phase: 'queued' | 'downloading' | 'analyzing' | 'complete';
  progress: number;
  queuedAt: string;
  settings: { timeoutMs: number };
  result: {
    cuts?: number[];
    outcome?: 'cuts' | 'no_audio' | 'no_silence';
    error?: string;
  } | null;
}
const runningStatus = (status?: Analysis['status']) =>
  status === 'pending' || status === 'processing';
const running = (job?: Analysis) => runningStatus(job?.status);
export default function SilenceAnalysisPanel({
  videoId,
  segments,
  onApply,
}: {
  videoId: string;
  segments: EditSegment[];
  onApply: (segments: EditSegment[]) => void;
}) {
  const { t } = useTranslation();
  const generation = useRef(0);
  const [job, setJob] = useState<Analysis>();
  const [selected, setSelected] = useState<number[]>([]);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState('');
  const [pollError, setPollError] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  // Each poll answer is a new job object: the effects below read only these
  // values, so that they restart when the analysis or its status changes,
  // never on a mere progress update.
  const jobId = job?.id,
    jobStatus = job?.status,
    jobQueuedAt = job?.queuedAt;
  useEffect(() => {
    let cancelled = false;
    const epoch = ++generation.current;
    setJob(undefined);
    setSelected([]);
    setHidden(false);
    const load = async () => {
      try {
        const response = await getSilenceAnalysis(videoId);
        if (
          !cancelled &&
          generation.current === epoch &&
          response?.ok &&
          response.data
        ) {
          setJob(response.data);
          setSelected([]);
          setHidden(false);
        }
      } catch {
        /* No saved job is an ordinary first visit. */
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [videoId]);
  useEffect(() => {
    if (!jobId || !runningStatus(jobStatus)) return;
    let cancelled = false,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await getSilenceAnalysis(videoId, jobId);
        if (cancelled) return;
        if (response?.ok && response.data) {
          setJob(response.data);
          setPollError(false);
          if (!running(response.data)) return;
        } else {
          setPollError(true);
          if ([400, 401, 403, 404].includes(response?.status || 0)) {
            setJob(undefined);
            setPollError(false);
            setError(t('videoEdit.analysis.unavailable'));
            return;
          }
        }
      } catch {
        if (!cancelled) setPollError(true);
      }
      if (!cancelled) timer = setTimeout(poll, 3000);
    };
    timer = setTimeout(poll, 1000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId, jobStatus, videoId, t]);
  useEffect(() => {
    if (!jobId || !runningStatus(jobStatus) || jobQueuedAt === undefined)
      return;
    const update = () =>
      setElapsed(Math.max(0, (Date.now() - Date.parse(jobQueuedAt)) / 1000));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [jobId, jobStatus, jobQueuedAt]);
  const application = applyAnalysisCuts(segments, selected);
  return (
    <section className={styles.panel}>
      <h2>{t('videoEdit.analysis.title')}</h2>
      <p>{t('videoEdit.analysis.help')}</p>
      <button
        type="button"
        disabled={requesting || running(job)}
        onClick={async () => {
          generation.current++;
          setRequesting(true);
          setError('');
          setHidden(false);
          setSelected([]);
          try {
            const response = await requestSilenceAnalysis(videoId);
            if (response.ok && response.data) setJob(response.data);
            else
              setError(
                response.status === 403
                  ? t('videonotallowedit')
                  : t('videoEdit.analysis.unavailable'),
              );
          } catch {
            setError(t('videoEdit.analysis.unavailable'));
          } finally {
            setRequesting(false);
          }
        }}
      >
        {t(
          requesting
            ? 'videoEdit.analysis.requesting'
            : 'videoEdit.analysis.request',
        )}
      </button>
      {error && <p role="alert">{error}</p>}
      {job && running(job) && (
        <div role="status" aria-live="polite">
          <p>
            {t(
              job.status === 'pending'
                ? 'videoEdit.analysis.queued'
                : job.phase === 'downloading'
                  ? 'videoEdit.analysis.downloading'
                  : 'videoEdit.analysis.analyzing',
            )}
          </p>
          <p>
            {t('videoEdit.analysis.elapsed', { time: formatTime(elapsed) })}
          </p>
          {job.phase === 'analyzing' ? (
            <progress
              aria-label={t('videoEdit.analysis.progress')}
              max={100}
              value={job.progress}
            />
          ) : (
            <progress aria-label={t('videoEdit.analysis.progress')} />
          )}
          <p>
            {t('videoEdit.analysis.waitHelp', {
              minutes: Math.round(job.settings.timeoutMs / 60000),
            })}
          </p>
        </div>
      )}
      {pollError && <p role="status">{t('videoEdit.analysis.pollError')}</p>}
      {job?.status === 'failed' && (
        <p role="alert">
          {t('videoEdit.analysis.failed')} {job.result?.error}
        </p>
      )}
      {job?.status === 'ready' && !hidden && (
        <>
          {job.result?.outcome === 'no_audio' ? (
            <p role="status">{t('videoEdit.analysis.noAudio')}</p>
          ) : job.result?.outcome === 'no_silence' ? (
            <p role="status">{t('videoEdit.analysis.noSilence')}</p>
          ) : (
            <>
              <fieldset>
                <legend>{t('videoEdit.analysis.suggestions')}</legend>
                {job.result?.cuts?.map((cut) => (
                  <label className={styles.proposal} key={cut}>
                    <input
                      type="checkbox"
                      checked={selected.includes(cut)}
                      onChange={(e) =>
                        setSelected((previous) =>
                          e.target.checked
                            ? [...previous, cut]
                            : previous.filter((n) => n !== cut),
                        )
                      }
                    />
                    {formatTime(cut)}
                  </label>
                ))}
              </fieldset>
              {application.error && (
                <p role="alert">
                  {t(`videoEdit.analysis.${application.error}`)}
                </p>
              )}
              <div className={styles.row}>
                <button
                  type="button"
                  disabled={!selected.length || !!application.error}
                  onClick={() => {
                    onApply(application.segments);
                    setSelected([]);
                    setHidden(true);
                  }}
                >
                  {t('videoEdit.analysis.apply')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelected([]);
                    setHidden(true);
                  }}
                >
                  {t('videoEdit.analysis.ignore')}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
