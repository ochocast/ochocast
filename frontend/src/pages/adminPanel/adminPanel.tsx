import React, { FC, useEffect, useState } from 'react';
import styles from './adminPanel.module.css';
import { useTranslation } from 'react-i18next';
import Card from '../../components/ReworkComponents/generic/Cards/Card';
import Toast from '../../components/ReworkComponents/generic/Toast/Toast';
import { getConfig, uploadConfig } from '../../utils/api';
import yaml from 'js-yaml';
import { BrandingConfig } from '../../branding/types';
import { useUser } from '../../context/UserContext';
import InputColor from 'react-input-color';
import NotFoundPage from '../notFound/notFound';
import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';

export interface AdminPanelProps {}

const DEFAULT_CONFIG_PATH = `${process.env.PUBLIC_URL}/branding/theme.yaml`;

function isValidHexColor(hex: string): boolean {
  if (!hex || typeof hex !== 'string') {
    return false;
  }

  // Remove # if present
  const cleanHex = hex.replace(/^#/, '');

  // Check if it's a valid hex string (3, 6, or 8 characters)
  const hexRegex = /^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$|^[0-9A-Fa-f]{8}$/;

  return hexRegex.test(cleanHex);
}

const getColorInputValue = (input: string) => {
  // Helper pour convertir un nombre (0-255) en hexadécimal à 2 chiffres
  const toHex = (n: number): string => n.toString(16).padStart(2, '0');
  // Si input est un rgba(...)
  const rgbaRegex =
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\s*\)$/i;
  const rgbaMatch = input.match(rgbaRegex);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1]);
    const g = parseInt(rgbaMatch[2]);
    const b = parseInt(rgbaMatch[3]);
    const a =
      rgbaMatch[4] !== undefined
        ? Math.round(parseFloat(rgbaMatch[4]) * 255)
        : 255;

    return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a)}`;
  }

  // Si input est un hex
  let hex = input.trim().replace(/^#/, '');

  if (hex.length === 3) {
    // #RGB → #RRGGBB
    hex =
      hex
        .split('')
        .map((c) => c + c)
        .join('') + 'ff';
  } else if (hex.length === 6) {
    // #RRGGBB → ajouter alpha ff
    hex += 'ff';
  } else if (hex.length === 8) {
    // Déjà au bon format
    hex = hex.toLowerCase();
  } else {
    throw new Error(`Format de couleur non reconnu : ${input}`);
  }

  return `#${hex}`;
};

const AdminPanel: FC<AdminPanelProps> = () => {
  const { isAdmin } = useUser();
  const { t } = useTranslation();
  const [formData, setFormData] = useState<BrandingConfig | null>(null);
  const [originalFormData, setOriginalFormData] =
    useState<BrandingConfig | null>(null);
  const [hasChanges, setHasChanges] = useState<boolean>(false);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);
  const [iswaiting, setIswaiting] = useState<boolean>(false);

  // Fonction pour comparer les données et détecter les changements
  const checkForChanges = (
    current: BrandingConfig | null,
    original: BrandingConfig | null,
  ) => {
    if (!current || !original) return false;
    return JSON.stringify(current) !== JSON.stringify(original);
  };

  useEffect(() => {
    const fetchConfig = async () => {
      const raw = await getConfig()
        .then((res) =>
          res.status !== 200 || res.data.url === 'default-config'
            ? DEFAULT_CONFIG_PATH
            : res.data.url,
        )
        .catch(() => DEFAULT_CONFIG_PATH)
        .then((file_url) => fetch(file_url))
        .then((file) => file.text());
      const parsed = yaml.load(raw) as BrandingConfig;
      for (const key in parsed.colors) {
        parsed.colors[key] = getColorInputValue(parsed.colors[key]);
      }
      setFormData(parsed); // Initialiser le formulaire avec les valeurs par défaut
      setOriginalFormData(JSON.parse(JSON.stringify(parsed))); // Sauvegarder les données originales
    };

    fetchConfig();
  }, []);

  if (!isAdmin) {
    return <NotFoundPage />; // Redirect to NotFoundPage if not admin
  }

  const handleInputChange = (field: string, value: string, isColor = false) => {
    if (!formData) return;

    const newFormData = ((prev) => {
      if (!prev) return null;

      if (isColor) {
        return {
          ...prev,
          colors: {
            ...prev.colors,
            [field]: value,
          },
        };
      } else {
        return {
          ...prev,
          [field]: value,
        };
      }
    })(formData);

    setFormData(newFormData);

    // Vérifier s'il y a des changements
    if (newFormData && originalFormData) {
      setHasChanges(checkForChanges(newFormData, originalFormData));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIswaiting(true);
    if (!formData) return;

    for (const key in formData.colors) {
      if (!isValidHexColor(formData.colors[key])) {
        setToast({
          message: t('invalidColorFor') + ' ' + key,
          type: 'error',
        });
        setIswaiting(false);
        return;
      }
    }

    try {
      // Convert formData to YAML string
      const yamlString = yaml.dump(formData);

      // Create a FormData object for file upload
      const formDataToSend = new FormData();
      const yamlBlob = new Blob([yamlString], { type: 'application/x-yaml' });
      formDataToSend.append('file', yamlBlob, 'theme.yaml');

      // Send the config to the backend
      const response = await uploadConfig(formDataToSend);

      if (response.status === 200 || response.status === 201) {
        setToast({
          message: t('configurationUpdatedSuccess'),
          type: 'success',
        });
        // Réinitialiser l'état de changements après succès
        setOriginalFormData(JSON.parse(JSON.stringify(formData)));
        setHasChanges(false);
      } else {
        setToast({
          message: t('configurationUpdateError'),
          type: 'error',
        });
      }
    } catch (error) {
      setToast({
        message: t('configurationSendError'),
        type: 'error',
      });
    }
    setIswaiting(false);
  };

  const renderColorField = (colorKey: string, colorValue: string) => {
    return (
      <div key={colorKey} className={styles.formField}>
        <label htmlFor={colorKey} className={styles.label}>
          {colorKey}
        </label>
        <div className={`${styles.colorInputWrapper}`}>
          <div className={styles.rgbaColorPicker}>
            <InputColor
              initialValue={colorValue}
              onChange={(colorData) => {
                handleInputChange(colorKey, colorData.hex, true);
              }}
            />
          </div>
          <input
            type="text"
            value={colorValue}
            onChange={(e) => {
              const val = e.target.value;
              handleInputChange(colorKey, val, true);
            }}
            className={styles.textInput}
            placeholder={'#00000000'}
          />
        </div>
      </div>
    );
  };

  return (
    <div className={styles.adminPanel}>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      <div className={styles.header}>
        <h1 className={styles.title}>{t('adminPanel')}</h1>
      </div>

      <div className={styles.content}>
        {formData && (
          <Card>
            <div className={styles.cardContent}>
              <h2>{t('themeConfiguration')}</h2>
              <form onSubmit={handleSubmit} className={styles.configForm}>
                {/* Champs généraux */}
                <div className={styles.formSection}>
                  <h3>{t('generalInformation')}</h3>

                  <div className={styles.formField}>
                    <label htmlFor="appName" className={styles.label}>
                      {t('applicationName')}
                    </label>
                    <input
                      type="text"
                      id="appName"
                      value={formData.appName}
                      onChange={(e) =>
                        handleInputChange('appName', e.target.value)
                      }
                      className={styles.textInput}
                    />
                  </div>

                  <div className={styles.formField}>
                    <label htmlFor="logo" className={styles.label}>
                      {t('logoPath')}
                    </label>
                    <input
                      type="text"
                      id="logo"
                      value={formData.logo}
                      onChange={(e) =>
                        handleInputChange('logo', e.target.value)
                      }
                      className={styles.textInput}
                    />
                  </div>
                </div>

                {/* Couleurs */}
                <div className={styles.formSection}>
                  <h3>{t('themeColors')}</h3>
                  <div className={styles.colorGrid}>
                    {Object.entries(formData.colors).map(([key, value]) =>
                      renderColorField(key, value),
                    )}
                  </div>
                </div>
                <Button
                  label={
                    iswaiting ? t('savingInProgress') : t('saveConfiguration')
                  }
                  type={
                    !iswaiting && hasChanges
                      ? ButtonType.primary
                      : ButtonType.disabled
                  }
                />
              </form>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
