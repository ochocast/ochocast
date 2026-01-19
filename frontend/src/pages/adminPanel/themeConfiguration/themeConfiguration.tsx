import React, { FC, useEffect, useState, ChangeEvent } from 'react';
import styles from './themeConfiguration.module.css';
import { useTranslation } from 'react-i18next';
import Card from '../../../components/ReworkComponents/generic/Cards/Card';
import Toast from '../../../components/ReworkComponents/generic/Toast/Toast';
import InputFile from '../../../components/ReworkComponents/inputFile/InputFile';
import {
  uploadConfig,
  getBrandingPicture,
  api,
  resetConfig,
} from '../../../utils/api';
import yaml from 'js-yaml';
import { BrandingConfig } from '../../../branding/types';
import { useUser } from '../../../context/UserContext';
import InputColor from 'react-input-color';
import NotFoundPage from '../../notFound/notFound';
import Button, {
  ButtonType,
} from '../../../components/ReworkComponents/generic/Button/Button';
import ColorPreview from '../../../components/ReworkComponents/generic/ColorPreview/ColorPreview';

export interface ThemeConfigurationProps {}

function isValidHexColor(hex: string): boolean {
  if (!hex || typeof hex !== 'string') {
    return false;
  }

  const cleanHex = hex.replace(/^#/, '');
  const hexRegex = /^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$|^[0-9A-Fa-f]{8}$/;

  return hexRegex.test(cleanHex);
}

const getColorInputValue = (input: string) => {
  const toHex = (n: number): string => n.toString(16).padStart(2, '0');
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

  let hex = input.trim().replace(/^#/, '');

  if (hex.length === 3) {
    hex =
      hex
        .split('')
        .map((c) => c + c)
        .join('') + 'ff';
  } else if (hex.length === 6) {
    hex += 'ff';
  } else if (hex.length === 8) {
    hex = hex.toLowerCase();
  } else {
    throw new Error(`Format de couleur non reconnu : ${input}`);
  }

  return `#${hex}`;
};

const ThemeConfiguration: FC<ThemeConfigurationProps> = () => {
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
  const [selectedImages, setSelectedImages] = useState<{ [key: string]: File }>(
    {},
  );
  const [imageUrls, setImageUrls] = useState<{ [key: string]: string }>({});

  const checkForChanges = (
    current: BrandingConfig | null,
    original: BrandingConfig | null,
  ) => {
    if (!current || !original) return false;
    return JSON.stringify(current) !== JSON.stringify(original);
  };

  const handleImageChange =
    (imageKey: string) => (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setSelectedImages((prev) => ({
        ...prev,
        [imageKey]: file,
      }));

      setFormData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          images: {
            ...prev.images,
            [imageKey]: file.name,
          },
        };
      });

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setImageUrls((prev) => ({
            ...prev,
            [imageKey]: reader.result as string,
          }));
        }
      };
      reader.readAsDataURL(file);
      setHasChanges(true);
    };

  const fetchImageUrl = async (imageKey: string, imagePath: string) => {
    try {
      if (imagePath.startsWith('::default::')) {
        const imageName = imagePath.replace('::default::', '');
        const url = `${window.location.origin}/branding/${imageName}`;
        setImageUrls((prev) => ({
          ...prev,
          [imageKey]: url,
        }));
        return;
      }

      const response = await getBrandingPicture(imagePath);
      if (response.status === 200 && response.data?.url) {
        setImageUrls((prev) => ({
          ...prev,
          [imageKey]: response.data.url,
        }));
      }
    } catch (error) {
      console.error(`Error fetching image ${imageKey}:`, error);
    }
  };

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        console.log('Admin: Trying to load config from backend API');

        let configUrl: string | null = null;
        try {
          const configRes = await api.get('/config');
          if (configRes.ok) {
            const configData = await configRes.data;
            const typedConfigData = configData as { url?: string };
            configUrl = typedConfigData.url ?? null;
            console.log('Got config URL from backend:', configUrl);
          }
        } catch (e) {
          console.log('Failed to get config URL from backend');
        }

        let raw: string;
        if (configUrl && configUrl !== 'default-config') {
          console.log('Loading config from:', configUrl);
          try {
            const response = await fetch(configUrl);
            if (response.ok) {
              raw = await response.text();
              console.log('Loaded config from backend URL');
            } else {
              throw new Error('Backend config URL returned 404');
            }
          } catch (e) {
            console.log(
              'Failed to load from backend URL, falling back to default',
            );
            const defaultPath = `${process.env.PUBLIC_URL}/branding/theme.yaml`;
            const response = await fetch(defaultPath);
            if (!response.ok) throw new Error('Failed to load default config');
            raw = await response.text();
          }
        } else {
          const defaultPath = `${process.env.PUBLIC_URL}/branding/theme.yaml`;
          console.log('Loading default config from:', defaultPath);
          const response = await fetch(defaultPath);
          if (!response.ok) throw new Error('Failed to load default config');
          raw = await response.text();
        }

        const parsed = yaml.load(raw) as BrandingConfig;
        console.log('Parsed config:', parsed);

        for (const key in parsed.colors) {
          parsed.colors[key] = getColorInputValue(parsed.colors[key]);
        }
        setFormData(parsed);
        setOriginalFormData(JSON.parse(JSON.stringify(parsed)));

        if (parsed.images) {
          Object.entries(parsed.images).forEach(([key, imagePath]) => {
            fetchImageUrl(key, imagePath);
          });
        }
      } catch (error) {
        console.error('Error loading config:', error);
      }
    };

    fetchConfig();
  }, []);

  if (!isAdmin) {
    return <NotFoundPage />;
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

    if (newFormData && originalFormData) {
      setHasChanges(checkForChanges(newFormData, originalFormData));
    }
  };

  const handleReset = async () => {
    if (!window.confirm(t('confirmResetConfiguration'))) {
      return;
    }

    setIswaiting(true);
    try {
      const response = await resetConfig();

      if (response.status === 200 || response.status === 204) {
        setToast({
          message: t('configurationResetSuccess'),
          type: 'success',
        });

        setTimeout(() => {
          window.location.reload();
        }, 200);
      } else {
        setToast({
          message: t('configurationResetError'),
          type: 'error',
        });
      }
    } catch (error) {
      setToast({
        message: t('configurationResetError'),
        type: 'error',
      });
    }
    setIswaiting(false);
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
      const yamlString = yaml.dump(formData);

      const formDataToSend = new FormData();
      const yamlBlob = new Blob([yamlString], { type: 'application/x-yaml' });
      formDataToSend.append('file', yamlBlob, 'theme.yaml');

      const imageFiles = Object.values(selectedImages);
      const imageIds = Object.keys(selectedImages);

      imageFiles.forEach((file, index) => {
        formDataToSend.append('images', file);
      });

      imageIds.forEach((imageId) => {
        formDataToSend.append(
          'imageIds',
          formData.images?.[imageId] || imageId,
        );
      });

      console.log('FormData to send:', formData);

      const response = await uploadConfig(formDataToSend);

      if (response.status === 200 || response.status === 201) {
        setToast({
          message: t('configurationUpdatedSuccess'),
          type: 'success',
        });
        setOriginalFormData(JSON.parse(JSON.stringify(formData)));
        setHasChanges(false);

        setTimeout(() => {
          window.location.reload();
        }, 200);
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

  const renderImageField = (imageKey: string) => {
    const currentImageUrl = imageUrls[imageKey];

    return (
      <div key={imageKey} className={styles.formField}>
        <label htmlFor={imageKey} className={styles.label}>
          {imageKey}
        </label>
        {currentImageUrl && (
          <div className={styles.imagePreview}>
            <img
              src={currentImageUrl}
              alt={`Preview of ${imageKey}`}
              style={{
                maxWidth: '200px',
                maxHeight: '100px',
                objectFit: 'contain',
              }}
            />
          </div>
        )}
        <InputFile
          placeholder={t('ChooseThumbnail')}
          onChange={handleImageChange(imageKey)}
          disable={false}
          required={false}
        />
      </div>
    );
  };

  return (
    <div className={styles.themeConfiguration}>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      <div className={styles.header}>
        <h1 className={styles.title}>{t('themeConfiguration')}</h1>
      </div>

      <div className={styles.content}>
        {formData && (
          <Card>
            <div className={styles.cardContent}>
              <form onSubmit={handleSubmit} className={styles.configForm}>
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
                </div>

                <div className={styles.formSection}>
                  <h3>{t('themeColors')}</h3>
                  <div className={styles.colorGrid}>
                    {Object.entries(formData.colors).map(([key, value]) =>
                      renderColorField(key, value),
                    )}
                  </div>
                </div>

                <div className={styles.formSection}>
                  <h3>{t('colorPreview')}</h3>
                  <div className={styles.colorPreviewSection}>
                    <ColorPreview
                      titleKey="primaryColor"
                      baseVariableName="--theme-color"
                      previewColor={formData.colors.primary}
                    />
                    <ColorPreview
                      titleKey="backgroundColor"
                      baseVariableName="--bg-color"
                      previewColor={formData.colors.background}
                    />
                  </div>
                </div>

                <div className={styles.formSection}>
                  <h3>Images de branding</h3>
                  <div className={styles.imageGrid}>
                    {(formData.images ? Object.keys(formData.images) : []).map(
                      (imageKey) => renderImageField(imageKey),
                    )}
                  </div>
                </div>
                <div className={styles.formButtons}>
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
                  <Button
                    label={t('resetConfiguration')}
                    type={!iswaiting ? ButtonType.danger : ButtonType.disabled}
                    onClick={handleReset}
                  />
                </div>
              </form>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ThemeConfiguration;
