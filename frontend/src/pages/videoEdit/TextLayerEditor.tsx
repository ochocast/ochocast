import React from 'react';
import { useTranslation } from 'react-i18next';
import { EditText, TextPosition, TextColor } from './editorState';
import styles from './videoEdit.module.css';
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
              max={duration}
              step="0.1"
              value={Number.isFinite(text.startOffset) ? text.startOffset : ''}
              onChange={(e) =>
                onChange({ startOffset: e.target.valueAsNumber })
              }
            />
          </label>
          <label>
            {t('videoEdit.textDuration')}
            <input
              type="number"
              min={0.1}
              max={duration}
              step="0.1"
              value={Number.isFinite(text.duration) ? text.duration : ''}
              onChange={(e) => onChange({ duration: e.target.valueAsNumber })}
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
