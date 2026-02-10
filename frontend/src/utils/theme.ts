import { BrandingConfig } from '../branding/types';
import { generateColorVariants, hexToRgb } from './colorUtils';

export function applyTheme(theme: BrandingConfig) {
  if (theme && theme.colors) {
    // === PRIMARY COLOR SYSTEM ===
    const primaryVariants = generateColorVariants(theme.colors.primary);

    // Generate all primary variants (used for buttons, links, accents)
    Object.entries(primaryVariants).forEach(([variant, value]) => {
      document.documentElement.style.setProperty(
        `--theme-color-${variant}`,
        value,
      );
    });
    document.documentElement.style.setProperty(
      '--theme-color',
      theme.colors.primary,
    );

    // === SECONDARY COLOR SYSTEM (for texts) ===
    const secondaryVariants = generateColorVariants(theme.colors.secondary);

    // Generate text color variants
    Object.entries(secondaryVariants).forEach(([variant, value]) => {
      document.documentElement.style.setProperty(
        `--text-color-${variant}`,
        value,
      );
    });
    document.documentElement.style.setProperty(
      '--text-color',
      theme.colors.secondary,
    );
    document.documentElement.style.setProperty(
      '--secondary-color',
      theme.colors.secondary,
    );

    // === BACKGROUND COLOR SYSTEM ===
    const backgroundVariants = generateColorVariants(theme.colors.background);

    // Background variants
    Object.entries(backgroundVariants).forEach(([variant, value]) => {
      document.documentElement.style.setProperty(
        `--bg-color-${variant}`,
        value,
      );
    });
    document.documentElement.style.setProperty(
      '--bg-color',
      theme.colors.background,
    );

    // === ACCENT COLOR SYSTEM ===
    const accentVariants = generateColorVariants(theme.colors.accent);
    Object.entries(accentVariants).forEach(([variant, value]) => {
      document.documentElement.style.setProperty(
        `--accent-color-${variant}`,
        value,
      );
    });
    document.documentElement.style.setProperty(
      '--accent-color',
      theme.colors.accent,
    );

    // === ERROR COLOR SYSTEM ===
    if (theme.colors.error) {
      const errorVariants = generateColorVariants(theme.colors.error);
      Object.entries(errorVariants).forEach(([variant, value]) => {
        document.documentElement.style.setProperty(
          `--error-color-${variant}`,
          value,
        );
      });
      document.documentElement.style.setProperty(
        '--error-color',
        theme.colors.error,
      );
    }

    // === LEGACY COMPATIBILITY MAPPING ===
    // Map old hardcoded variables to new dynamic system

    // Special numbered variants (mapping to appropriate colors)
    document.documentElement.style.setProperty(
      '--theme-color-60',
      backgroundVariants['200'] || '#d9d9d9',
    );
    document.documentElement.style.setProperty(
      '--theme-color-70',
      backgroundVariants['300'] || '#d0d5dd',
    );
    document.documentElement.style.setProperty(
      '--theme-color-150',
      backgroundVariants['100'] || '#f3f3f3',
    );
    document.documentElement.style.setProperty(
      '--theme-color-450',
      primaryVariants['400'] || theme.colors.primary,
    );
    document.documentElement.style.setProperty(
      '--theme-color-1000',
      secondaryVariants['700'] || '#344054',
    );
    document.documentElement.style.setProperty(
      '--theme-color-1050',
      secondaryVariants['900'] || '#101828',
    );
    document.documentElement.style.setProperty(
      '--theme-color-1100',
      backgroundVariants['300'] || '#ccc',
    );
    document.documentElement.style.setProperty(
      '--theme-color-1150',
      primaryVariants['600'] || '#1a771a',
    );
    document.documentElement.style.setProperty(
      '--theme-color-1200',
      secondaryVariants['800'] || '#333',
    );

    // 2000 series (borders and UI elements) - based on background
    document.documentElement.style.setProperty(
      '--theme-color-2000',
      backgroundVariants['300'] || '#d0d5dd',
    );
    document.documentElement.style.setProperty(
      '--theme-color-2050',
      secondaryVariants['500'] || '#667085',
    );
    document.documentElement.style.setProperty(
      '--theme-color-2100',
      secondaryVariants['700'] || '#344054',
    );
    document.documentElement.style.setProperty(
      '--theme-color-2150',
      secondaryVariants['600'] || '#4b5563',
    );
    document.documentElement.style.setProperty(
      '--theme-color-2200',
      secondaryVariants['600'] || '#6b7280',
    );

    // 3000 series (transparency effects)
    document.documentElement.style.setProperty(
      '--theme-color-3000',
      'rgba(255, 255, 255, 0.1)',
    );
    document.documentElement.style.setProperty(
      '--theme-color-3050',
      'rgba(255, 255, 255, 0.2)',
    );
    document.documentElement.style.setProperty(
      '--theme-color-3100',
      'rgba(255, 255, 255, 0.5)',
    );

    // Convertir primary color en rgba avec transparence
    const primaryRgb = hexToRgb(theme.colors.primary);
    if (primaryRgb) {
      document.documentElement.style.setProperty(
        '--theme-color-3200',
        `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.3)`,
      );
      document.documentElement.style.setProperty(
        '--theme-color-3300',
        `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.4)`,
      );
    }
    document.documentElement.style.setProperty(
      '--theme-color-3400',
      'rgba(0, 0, 0, 0.3)',
    );
    document.documentElement.style.setProperty(
      '--theme-color-3500',
      'rgba(0, 0, 0, 0.5)',
    );
    document.documentElement.style.setProperty(
      '--theme-color-3600',
      'rgba(16, 24, 40, 0.05)',
    );

    // Basic color names
    document.documentElement.style.setProperty(
      '--theme-color-white',
      '#ffffff',
    );
    document.documentElement.style.setProperty(
      '--theme-color-black',
      '#000000',
    );
    document.documentElement.style.setProperty(
      '--theme-color-gray',
      '#cccccc', // Toujours gris pour les ombres
    );

    // Theme color variants pour compatibilité avec Card et autres composants
    document.documentElement.style.setProperty(
      '--theme-color-950',
      secondaryVariants['950'] || '#0f172a',
    );
    document.documentElement.style.setProperty(
      '--theme-color-red',
      theme.colors.error || '#db4437',
    );

    // Maintenir la compatibilité avec l'ancien système (optionnel)
    // Les anciennes variables restent disponibles avec les nouvelles valeurs
    document.documentElement.style.setProperty(
      '--theme-color-500',
      theme.colors.primary,
    );
    document.documentElement.style.setProperty(
      '--theme-color-white',
      theme.colors.background,
    );
  }

  // Mettre à jour le titre seulement si theme et theme.appName existent
  if (theme && theme.appName) {
    document.title = theme.appName;
  }
}
