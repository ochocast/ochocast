export interface BrandingConfig {
  appName: string;
  colors: {
    [key: string]: string; // Par exemple: 'theme-color-50': '#edfcf4'
  };
  images?: {
    [key: string]: string; // Clé de l'image -> nom du fichier/chemin
  };
}

export interface BrandingContextType extends BrandingConfig {
  getImageUrl: (imageKey: string) => Promise<string | null>;
}
