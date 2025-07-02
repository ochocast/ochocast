import { useEffect, useState } from 'react';
import yaml from 'js-yaml';
import { BrandingConfig } from '../branding/types';

const CONFIG_PATH = `${process.env.PUBLIC_URL}/branding/theme.yaml`;

export function useBranding() {
  const [config, setConfig] = useState<BrandingConfig | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await (await fetch(CONFIG_PATH)).text();
        const parsed = yaml.load(raw) as BrandingConfig;
        setConfig(parsed);

        // Appliquer les variables CSS
        Object.entries(parsed.colors).forEach(([key, value]) => {
          document.documentElement.style.setProperty(`--${key}`, value);
        });

        // Mettre à jour le titre
        document.title = parsed.appName;
      } catch (error) {
        console.error('Erreur lors du chargement du thème:', error);
      }
    })();
  }, []);

  return config;
}
