import { useEffect, useState } from 'react';
import yaml from 'js-yaml';
import { BrandingConfig } from '../branding/types';
import { getConfig } from '../utils/api';
import { applyTheme } from '../utils/theme';

const DEFAULT_CONFIG_PATH = `${process.env.PUBLIC_URL}/branding/theme.yaml`;

export function useBranding() {
  const [config, setConfig] = useState<BrandingConfig | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await getConfig()
          .then((res) => {
            const configUrl =
              res.status !== 200 || res.data.url === 'default-config'
                ? DEFAULT_CONFIG_PATH
                : res.data.url;

            return configUrl;
          })
          .catch(() => DEFAULT_CONFIG_PATH)
          .then((file_url) => fetch(file_url))
          .then((file) => file.text());
        const parsed = yaml.load(raw) as BrandingConfig;
        setConfig(parsed);
      } catch (error) {
        console.error('Erreur lors du chargement du thème:', error);
      }
    })();
  }, []);

  useEffect(() => {
    if (config) {
      applyTheme(config);
    }
  }, [config]);

  return config;
}
