import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  EditText,
  MIN_TEXT_DURATION,
  TIME_STEP,
  TextColor,
  TextPosition,
  fitText,
  lastTextStart,
  roundTenth,
} from './editorState';
import styles from './videoEdit.module.css';

// Shown with one decimal at most, whatever a saved montage holds.
const shown = (seconds: number) =>
  Number.isFinite(seconds) ? roundTenth(seconds) : '';
export default function TextLayerEditor({
  text,
  duration,
  onChange,
  onRemove,
}: {
  text?: EditText;
  duration: number;
  onChange: (patch: Partial<EditText>) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  // A typed or pasted time is rounded to 0.1 s and kept within the passage
  // (`duration`); an empty field stays empty until it is filled.
  const setStart = (value: number) => {
    if (!text || !Number.isFinite(value))
      return onChange({ startOffset: value });
    onChange(
      Number.isFinite(text.duration)
        ? fitText(value, text.duration, duration)
        : {
            startOffset: fitText(value, MIN_TEXT_DURATION, duration)
              .startOffset,
          },
    );
  };
  const setDuration = (value: number) => {
    if (!text || !Number.isFinite(value)) return onChange({ duration: value });
    onChange(
      Number.isFinite(text.startOffset)
        ? fitText(text.startOffset, value, duration)
        : { duration: fitText(0, value, duration).duration },
    );
  };
  const start = Number.isFinite(text?.startOffset)
    ? roundTenth(text!.startOffset)
    : 0;
  return (
    <section className={styles.panel}>
      <h2>{t('videoEdit.selectedText')}</h2>
      {!text ? (
        <p>{t('videoEdit.selectTextHelp')}</p>
      ) : (
        <>
          <label>
            {t('videoEdit.content')}
            <textarea
              rows={3}
              value={text.content}
              onChange={(e) => onChange({ content: e.target.value })}
            />
          </label>
          <p>{t('videoEdit.textHelp')}</p>
          <label>
            {t('videoEdit.textStart')}
            <input
              type="number"
              min={0}
              max={lastTextStart(duration)}
              step={TIME_STEP}
              value={shown(text.startOffset)}
              onChange={(e) => setStart(e.target.valueAsNumber)}
            />
          </label>
          <label>
            {t('videoEdit.textDuration')}
            <input
              type="number"
              min={MIN_TEXT_DURATION}
              // The room left after the start, within the passage.
              max={fitText(start, duration, duration).duration}
              step={TIME_STEP}
              value={shown(text.duration)}
              onChange={(e) => setDuration(e.target.valueAsNumber)}
            />
          </label>
          <fieldset>
            <legend>{t('videoEdit.position')}</legend>
            <div className={styles.row}>
              {(['top', 'center', 'bottom'] as TextPosition[]).map(
                (position) => (
                  <button
                    type="button"
                    key={position}
                    aria-pressed={text.position === position}
                    onClick={() => onChange({ position })}
                  >
                    {t(`videoEdit.${position}`)}
                  </button>
                ),
              )}
            </div>
          </fieldset>
          <fieldset>
            <legend>{t('videoEdit.color')}</legend>
            <div className={styles.row}>
              {(['white', 'black', 'green'] as TextColor[]).map((color) => (
                <button
                  type="button"
                  key={color}
                  aria-pressed={text.color === color}
                  onClick={() => onChange({ color })}
                >
                  {t(`videoEdit.${color}`)}
                </button>
              ))}
            </div>
          </fieldset>
          <button type="button" onClick={onRemove}>
            {t('videoEdit.removeText')}
          </button>
        </>
      )}
    </section>
  );
}
