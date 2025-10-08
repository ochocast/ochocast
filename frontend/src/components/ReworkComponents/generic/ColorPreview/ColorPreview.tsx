import React, { useEffect, useState } from 'react';
import { useBranding } from '../../../../hooks/useBranding';
import { useTranslation } from 'react-i18next';
import Card from '../Cards/Card';
import styles from './ColorPreview.module.css';
import { generateColorVariants } from '../../../../utils/colorUtils';

interface ColorPreviewProps {
  titleKey: string;
  baseVariableName: string;
  previewColor?: string; // Optionnel : permet de forcer une couleur de prévisualisation
}

const ColorPreview: React.FC<ColorPreviewProps> = ({
  titleKey,
  baseVariableName,
  previewColor,
}) => {
  const { t } = useTranslation();
  const branding = useBranding();
  const [colorVariants, setColorVariants] = useState<{ [key: string]: string }>(
    {},
  );

  useEffect(() => {
    // Si une couleur de prévisualisation est fournie, utiliser celle-ci
    if (previewColor) {
      const variants = generateColorVariants(previewColor);
      setColorVariants({
        base: previewColor,
        ...variants,
      });
    } else {
      // Sinon, utiliser les variables CSS existantes
      const root = document.documentElement;
      const computedStyle = getComputedStyle(root);
      const variants: { [key: string]: string } = {};

      const baseColor = computedStyle.getPropertyValue(baseVariableName).trim();
      if (baseColor) {
        variants['base'] = baseColor;
      }

      const variantNumbers = [
        '50',
        '100',
        '200',
        '300',
        '400',
        '500',
        '600',
        '700',
        '800',
        '900',
      ];
      variantNumbers.forEach((num) => {
        const variantName = `${baseVariableName}-${num}`;
        const value = computedStyle.getPropertyValue(variantName).trim();
        if (value) {
          variants[num] = value;
        }
      });

      setColorVariants(variants);
    }
  }, [baseVariableName, branding, previewColor]);

  if (!branding && !previewColor) {
    return <div>Chargement des couleurs...</div>;
  }

  return (
    <div className={styles.colorPreview}>
      <h4 className={styles.title}>{t(titleKey as never)}</h4>
      <Card
        styleAddon={{
          display: 'flex',
          flexDirection: 'row',
          gap: '0.25rem',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          padding: '1rem',
          boxShadow: 'none',
        }}
      >
        {/* Couleur de base */}
        {colorVariants.base && (
          <div className={styles.colorSwatch}>
            <div
              className={styles.colorBox}
              style={{ backgroundColor: colorVariants.base }}
            />
            <span className={styles.colorLabel}>Base</span>
            <span className={styles.colorValue}>{colorVariants.base}</span>
          </div>
        )}

        {/* Toutes les variantes : 200, 300, 500, 600, 700, 800, 900 */}
        {['200', '300', '400', '600', '700', '800', '900'].map((variant) =>
          colorVariants[variant] ? (
            <div key={variant} className={styles.colorSwatch}>
              <div
                className={styles.colorBox}
                style={{ backgroundColor: colorVariants[variant] }}
              />
              <span className={styles.colorLabel}>{variant}</span>
              <span className={styles.colorValue}>
                {colorVariants[variant]}
              </span>
            </div>
          ) : null,
        )}
      </Card>
    </div>
  );
};

export default ColorPreview;
