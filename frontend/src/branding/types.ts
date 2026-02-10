export interface BrandingConfig {
  appName: string;
  colors: {
    primary: string; // Primary color (buttons, links, accents)
    secondary: string; // Secondary color (texts, borders)
    background: string; // Background color
    accent: string; // Accent color (alerts, highlights)
    error: string; // Error color (404 pages, error messages)
    [key: string]: string; // Allow additional custom colors
  };
  images?: {
    [key: string]: string; // Clé de l'image -> nom du fichier/chemin
  };
}

export interface BrandingContextType extends BrandingConfig {
  getImageUrl: (imageKey: string) => Promise<string | null>;
}
