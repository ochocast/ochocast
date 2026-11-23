import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  EditText,
  MIN_TEXT_DURATION,
  TIME_STEP,
  TextColor,
  TextPosition,
  fitText,
  formatSeconds,
  lastTextStart,
  roundHundredth,
} from './editorState';
import styles from './videoEdit.module.css';

/**
 * A time field: two decimals when shown (5.56, 5.00, whatever a saved
 * montage holds). While typing, the field keeps what is typed and the value
 * already applies, rounded; on validation (leaving the field or Enter), the
 * field shows the rounded value.
 */
function TimeInput({
  label,
  value,
  min,
  max,
  onValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onValue: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={TIME_STEP}
        value={draft ?? formatSeconds(value)}
        onChange={(e) => {
          setDraft(e.target.value);
          onValue(e.target.valueAsNumber);
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') setDraft(null);
        }}
      />
    </label>
  );
}
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
  // A typed or pasted time is rounded to 0.01 s and kept within the passage
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
    ? roundHundredth(text!.startOffset)
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
          <TimeInput
            label={t('videoEdit.textStart')}
            value={text.startOffset}
            min={0}
            max={lastTextStart(duration)}
            onValue={setStart}
          />
          <TimeInput
            label={t('videoEdit.textDuration')}
            value={text.duration}
            min={MIN_TEXT_DURATION}
            // The room left after the start, within the passage.
            max={fitText(start, duration, duration).duration}
            onValue={setDuration}
          />
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
