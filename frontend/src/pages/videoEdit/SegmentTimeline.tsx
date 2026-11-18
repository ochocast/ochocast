import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  EditSegment,
  formatTime,
  segmentDuration,
  totalDuration,
} from './editorState';
import styles from './videoEdit.module.css';
export default function SegmentTimeline({
  segments,
  time,
  onTime,
  onMove,
  onSelectText,
}: {
  segments: EditSegment[];
  time: number;
  onTime: (time: number) => void;
  onMove: (key: string, insertion: number) => void;
  onSelectText: (segment: string, text: string) => void;
}) {
  const { t } = useTranslation();
  const [dragged, setDragged] = useState<string | null>(null);
  const [insertion, setInsertion] = useState<number | null>(null);
  const total = totalDuration(segments);
  let start = 0;
  return (
    <div>
      <div className={styles.timeline}>
        <div
          className={styles.playhead}
          style={{ left: `${total ? (time / total) * 100 : 0}%` }}
        />
        {segments.map((s, i) => {
          const begin = start;
          start += segmentDuration(s);
          return (
            <div
              key={s.key}
              className={`${styles.timelineSegment} ${insertion === i ? styles.insertBefore : ''} ${insertion === segments.length && i === segments.length - 1 ? styles.insertAfter : ''}`}
              style={{ flex: segmentDuration(s) }}
              onDragOver={(e) => {
                e.preventDefault();
                const box = e.currentTarget.getBoundingClientRect();
                setInsertion(
                  i + (e.clientX > box.left + box.width / 2 ? 1 : 0),
                );
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragged && insertion !== null) onMove(dragged, insertion);
                setDragged(null);
                setInsertion(null);
              }}
            >
              <div className={styles.textTrack}>
                {s.textLayers.map((text) => (
                  <button
                    type="button"
                    key={text.key}
                    title={text.content}
                    style={{
                      left: `${(text.startOffset / segmentDuration(s)) * 100}%`,
                      width: `${(text.duration / segmentDuration(s)) * 100}%`,
                    }}
                    onClick={() => {
                      onSelectText(s.key, text.key);
                      onTime(begin + text.startOffset);
                    }}
                  >
                    {text.content || t('videoEdit.newText')}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={styles.segmentBlock}
                draggable
                onDragStart={(e) => {
                  setDragged(s.key);
                  e.dataTransfer.setData('text/plain', s.key);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                  setDragged(null);
                  setInsertion(null);
                }}
                onClick={(e) => {
                  const box = e.currentTarget.getBoundingClientRect();
                  onTime(
                    begin +
                      Math.max(
                        0,
                        Math.min(1, (e.clientX - box.left) / box.width),
                      ) *
                        segmentDuration(s),
                  );
                }}
              >
                {t('videoEdit.passage', { passage: i + 1 })}
              </button>
              <div className={styles.moveButtons}>
                <button
                  type="button"
                  disabled={i === 0}
                  aria-label={t('videoEdit.moveLeft', { passage: i + 1 })}
                  onClick={() => onMove(s.key, i - 1)}
                >
                  ←
                </button>
                <button
                  type="button"
                  disabled={i === segments.length - 1}
                  aria-label={t('videoEdit.moveRight', { passage: i + 1 })}
                  onClick={() => onMove(s.key, i + 2)}
                >
                  →
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className={styles.scale}>
        <span>00:00</span>
        <span>{formatTime(total / 2)}</span>
        <span>{formatTime(total)}</span>
      </div>
      <p>{t('videoEdit.timelineHelp')}</p>
    </div>
  );
}
