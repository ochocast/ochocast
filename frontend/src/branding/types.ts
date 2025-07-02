export interface BrandingConfig {
  appName: string;
  logo: string;
  colors: {
    [key: string]: string; // Par exemple: 'theme-color-50': '#edfcf4'
  };
}
