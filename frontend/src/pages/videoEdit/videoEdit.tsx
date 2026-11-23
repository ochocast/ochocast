import SilenceAnalysisPanel from './SilenceAnalysisPanel';
import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  createVideoEdit,
  getVideo,
  getVideoEdit,
  getVideoEditRenderStatus,
  getVideoEditSource,
  saveVideoEdit,
} from '../../utils/api';
import { renewSession } from '../../utils/session';
import { useAuth } from 'react-oidc-context';
import { Video } from '../../utils/VideoProperties';
import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';
import LoadingCircle from '../../components/ReworkComponents/LoadingCircle/LoadingCircle';
import EditPreview from './EditPreview';
import SegmentTimeline from './SegmentTimeline';
import TextLayerEditor from './TextLayerEditor';
import {
  EditSegment,
  EditText,
  VideoEdit,
  cutOffset,
  fitText,
  formatTime,
  hydrate,
  isRendering,
  localKey,
  locate,
  moveSegment,
  payload,
  segmentDuration,
  splitSegment,
  totalDuration,
  validate,
} from './editorState';
import RevertVideoButton from './RevertVideoButton';
import styles from './videoEdit.module.css';

export default function VideoEditPage() {
  const { videoId } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [video, setVideo] = useState<Video>();
  const [edit, setEdit] = useState<VideoEdit>();
  const [url, setUrl] = useState('');
  const [segments, setSegments] = useState<EditSegment[]>([]);
  const [time, setTime] = useState(0);
  const [selectedText, setSelectedText] = useState<{
    segment: string;
    text: string;
  }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [reload, setReload] = useState(0);
  const [pollError, setPollError] = useState(false);
  const alive = useRef(true);
  // Read through a ref: a token renewal must not reload the editor.
  const auth = useAuth();
  const authRef = useRef(auth);
  authRef.current = auth;
  // The original's address, protected: an expired session (401) is renewed
  // once, then read again.
  const readSource = async (id: string) => {
    const source = await getVideoEditSource(id);
    if (
      source?.status === 401 &&
      (await renewSession(() => authRef.current.signinSilent()))
    )
      return getVideoEditSource(id);
    return source;
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const responseErrors = (
    response: { status?: number; data?: { message?: unknown } } | undefined,
  ): string[] => {
    const message = response?.data?.message;
    if (response?.status === 401) return [t('videoEdit.sessionExpired')];
    if (response?.status === 403) return [t('videonotallowedit')];
    const detail = (
      Array.isArray(message) ? message.flat(Infinity) : [message]
    ).filter((m: unknown) => typeof m === 'string');
    const prefix =
      response?.status === 409
        ? t('videoEdit.conflict')
        : response?.status === 503
          ? t('videoEdit.unavailable')
          : t('videoEdit.requestFailed');
    return [prefix, ...detail];
  };
  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setErrors([]);
      setEdit(undefined);
      setSelectedText(undefined);
      setTime(0);
      try {
        // Source access is checked before a possible POST: a 404 user is not mistaken for an absent montage.
        const source = await readSource(videoId);
        if (cancelled) return;
        if (!source.ok || typeof source.data !== 'string' || !source.data) {
          setErrors(responseErrors(source));
          return;
        }
        const v = await getVideo(videoId);
        if (cancelled) return;
        if (!v.ok || !Array.isArray(v.data) || !v.data[0]) {
          setErrors(responseErrors(v));
          return;
        }
        let result = await getVideoEdit(videoId);
        if (cancelled) return;
        if (result.status === 404) {
          result = await createVideoEdit(videoId);
          if (cancelled) return;
          // Another browser may create it between GET and POST.
          if (result.status === 409) result = await getVideoEdit(videoId);
        }
        if (cancelled) return;
        if (!result.ok || !result.data?.segments) {
          setErrors(responseErrors(result));
          return;
        }
        setVideo(v.data[0]);
        setUrl(source.data);
        setEdit(result.data);
        setSegments(hydrate(result.data));
      } catch {
        if (!cancelled) setErrors([t('videoEdit.requestFailed')]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // Language changes do not discard unsaved edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, reload]);

  useEffect(() => {
    if (!videoId || !isRendering(edit?.renderStatus)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await getVideoEditRenderStatus(videoId);
        if (cancelled) return;
        if (response.ok && response.data) {
          setPollError(false);
          const status = response.data.renderStatus;
          if (status === 'ready' || status === 'failed') {
            navigate(`/video/${videoId}`, {
              state: {
                toast: {
                  message: t(
                    status === 'ready'
                      ? 'videoEdit.renderReady'
                      : 'videoEdit.renderFailed',
                  ),
                  type: status === 'ready' ? 'success' : 'error',
                },
              },
            });
            return;
          }
          setEdit((previous) =>
            previous ? { ...previous, ...response.data } : previous,
          );
        } else {
          setPollError(true);
          if ([400, 403, 404].includes(response.status || 0)) {
            setErrors(responseErrors(response));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, edit?.renderStatus, navigate, t]);

  // Retry of the preview: the original's address is read again.
  const refreshSource = async () => {
    if (!videoId) return;
    const source = await readSource(videoId);
    if (!alive.current) return;
    if (source?.ok && typeof source.data === 'string' && source.data)
      setUrl(source.data);
    else setErrors(responseErrors(source));
  };
  const current = locate(segments, time);
  const total = totalDuration(segments);
  const issues = validate(segments, video?.duration || 0);
  const textSegment = segments.find((s) => s.key === selectedText?.segment);
  const text = textSegment?.textLayers.find(
    (layer) => layer.key === selectedText?.text,
  );
  const changeSegments = (next: EditSegment[]) => {
    setSegments(next);
    setTime(Math.min(time, totalDuration(next)));
  };
  const changeText = (patch: Partial<EditText>) =>
    setSegments((previous) =>
      previous.map((s) =>
        s.key === selectedText?.segment
          ? {
              ...s,
              textLayers: s.textLayers.map((layer) =>
                layer.key === selectedText.text
                  ? { ...layer, ...patch }
                  : layer,
              ),
            }
          : s,
      ),
    );
  const removeText = () => {
    setSegments((previous) =>
      previous.map((s) => ({
        ...s,
        textLayers: s.textLayers.filter(
          (layer) => layer.key !== selectedText?.text,
        ),
      })),
    );
    setSelectedText(undefined);
  };
  const addText = () => {
    if (!current || current.segment.textLayers.length >= 10) return;
    const key = localKey();
    // At the playhead, at most 1 s before the passage end, on the 0.01 s grid.
    const placed = fitText(
      Math.min(
        current.offset,
        Math.max(0, segmentDuration(current.segment) - 1),
      ),
      5,
      segmentDuration(current.segment),
    );
    setSegments((previous) =>
      previous.map((s) =>
        s.key === current.segment.key
          ? {
              ...s,
              textLayers: [
                ...s.textLayers,
                {
                  key,
                  content: '',
                  position: 'bottom',
                  color: 'white',
                  ...placed,
                },
              ],
            }
          : s,
      ),
    );
    setSelectedText({ segment: current.segment.key, text: key });
  };
  const save = async () => {
    if (!edit || !videoId || issues.length || saving) return;
    setSaving(true);
    setErrors([]);
    try {
      const response = await saveVideoEdit(
        videoId,
        payload(edit.version, segments),
      );
      if (!alive.current) return;
      if (!response.ok || !response.data) setErrors(responseErrors(response));
      else {
        setEdit(response.data);
        setSelectedText(undefined);
        setSegments(hydrate(response.data));
      }
    } catch {
      if (alive.current) setErrors([t('videoEdit.requestFailed')]);
    } finally {
      if (alive.current) setSaving(false);
    }
  };

  return (
    <main className={styles.page}>
      <Link to={`/video/${videoId}`}>{t('videoEdit.back')}</Link>
      <h1>{t('videoEdit.title')}</h1>
      {video && (
        <p>
          {video.title} ·{' '}
          {t('videoEdit.originalDuration', {
            duration: formatTime(video.duration || 0),
          })}
        </p>
      )}
      {!!errors.length && (
        <div className={styles.errors} role="alert">
          <ul>
            {errors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
          <Button
            label={t('videoEdit.reload')}
            onClick={() => {
              if (!edit || window.confirm(t('videoEdit.reloadConfirm')))
                setReload((n) => n + 1);
            }}
          />
        </div>
      )}
      {loading ? (
        <LoadingCircle compact />
      ) : isRendering(edit?.renderStatus) ? (
        <section className={styles.panel} aria-live="polite">
          <LoadingCircle compact />
          <h2>{t('videoEdit.processing')}</h2>
          <p>{t('videoEdit.processingHelp')}</p>
          <p>
            {t(
              edit?.renderStatus === 'pending'
                ? 'videoEdit.pending'
                : 'videoEdit.encoding',
            )}
          </p>
          {pollError && <p role="status">{t('videoEdit.pollError')}</p>}
          <Link to={`/video/${videoId}`}>{t('videoEdit.back')}</Link>
        </section>
      ) : edit && video ? (
        <>
          {edit.renderStatus === 'failed' && (
            <p role="alert">
              {t('videoEdit.renderFailed')} {edit.renderError}
            </p>
          )}
          <fieldset disabled={saving} className={styles.editorFieldset}>
            <div className={styles.layout}>
              <div>
                <EditPreview
                  url={url}
                  segments={segments}
                  time={time}
                  onTime={setTime}
                  sourceDuration={video.duration || 0}
                  onRetry={refreshSource}
                />
                <section className={styles.panel}>
                  <div className={styles.row}>
                    <h2>Timeline</h2>
                    <Button
                      label={t('videoEdit.cut')}
                      type={
                        current &&
                        current.offset >= 5 &&
                        segmentDuration(current.segment) - current.offset >=
                          5 &&
                        segments.length < 100
                          ? ButtonType.secondary
                          : ButtonType.disabled
                      }
                      onClick={() => {
                        if (current) {
                          const next = splitSegment(
                            segments,
                            current.segment.key,
                            cutOffset(current.segment, current.offset),
                          );
                          if (next === segments)
                            setErrors([t('videoEdit.cutTextLimit')]);
                          else {
                            changeSegments(next);
                            setSelectedText(undefined);
                          }
                        }
                      }}
                    />
                    <Button
                      label={t('videoEdit.addText')}
                      type={
                        current && current.segment.textLayers.length < 10
                          ? ButtonType.secondary
                          : ButtonType.disabled
                      }
                      onClick={addText}
                    />
                  </div>
                  <SegmentTimeline
                    segments={segments}
                    time={time}
                    onTime={setTime}
                    onMove={(key, insertion) =>
                      changeSegments(moveSegment(segments, key, insertion))
                    }
                    onSelectText={(segment, text) =>
                      setSelectedText({ segment, text })
                    }
                  />
                  <p>{t('videoEdit.cutHelp')}</p>
                </section>
              </div>
              <aside>
                <section className={styles.panel}>
                  <h2>{t('videoEdit.passages')}</h2>
                  <strong aria-live="polite">
                    {t('videoEdit.finalDuration', {
                      duration: formatTime(total),
                    })}
                  </strong>
                  {segments.map((s, i) => (
                    <div className={styles.passage} key={s.key}>
                      <button
                        type="button"
                        onClick={() =>
                          setTime(
                            segments
                              .slice(0, i)
                              .reduce(
                                (n, item) => n + segmentDuration(item),
                                0,
                              ),
                          )
                        }
                      >
                        <strong>
                          {t('videoEdit.passage', { passage: i + 1 })}
                        </strong>
                        <br />
                        {formatTime(s.sourceStart)} → {formatTime(s.sourceEnd)}{' '}
                        · {formatTime(segmentDuration(s))}
                      </button>
                      <button
                        type="button"
                        aria-label={t('videoEdit.removePassage', {
                          passage: i + 1,
                        })}
                        onClick={() => {
                          changeSegments(
                            segments.filter((item) => item.key !== s.key),
                          );
                          if (selectedText?.segment === s.key)
                            setSelectedText(undefined);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </section>
                <SilenceAnalysisPanel
                  videoId={videoId!}
                  segments={segments}
                  onApply={(next) => {
                    changeSegments(next);
                    setSelectedText(undefined);
                  }}
                />
                <TextLayerEditor
                  text={text}
                  duration={textSegment ? segmentDuration(textSegment) : 0}
                  onChange={changeText}
                  onRemove={removeText}
                />
              </aside>
            </div>
          </fieldset>
          {!!issues.length && (
            <ul className={styles.errors} aria-live="polite">
              {issues.map((issue, i) => (
                <li key={i}>
                  {t(`videoEdit.validation.${issue.code}`, issue)}
                </li>
              ))}
            </ul>
          )}
          <footer className={styles.footer}>
            <div>
              <p>{t('videoEdit.originalKept')}</p>
              <RevertVideoButton
                videoId={videoId!}
                onReverted={() =>
                  navigate(`/video/${videoId}`, {
                    state: {
                      toast: {
                        message: t('videoEdit.reverted'),
                        type: 'success',
                      },
                    },
                  })
                }
                disabled={saving}
              />
            </div>
            <div className={styles.row}>
              <Button
                label={t('videoEdit.cancel')}
                type={saving ? ButtonType.disabled : ButtonType.secondary}
                onClick={() => navigate(`/video/${videoId}`)}
              />
              <Button
                label={saving ? t('videoEdit.saving') : t('videoEdit.save')}
                type={
                  saving || issues.length
                    ? ButtonType.disabled
                    : ButtonType.primary
                }
                onClick={save}
              />
            </div>
          </footer>
        </>
      ) : null}
    </main>
  );
}
