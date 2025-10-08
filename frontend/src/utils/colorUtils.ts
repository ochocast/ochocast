/**
 * Converts a hex color to RGB
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substr(0, 2), 16);
  const g = parseInt(cleanHex.substr(2, 2), 16);
  const b = parseInt(cleanHex.substr(4, 2), 16);
  return { r, g, b };
}

/**
 * Converts RGB values to hex
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Automatically generates color variants (from very light to very dark)
 * Generates 9 variants: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900
 */
export function generateColorVariants(color: string): {
  [key: string]: string;
} {
  const { r, g, b } = hexToRgb(color);
  const variants: { [key: string]: string } = {};

  // Factors to generate variants
  const lightFactors = [0.85, 0.7, 0.5, 0.3]; // 100, 200, 300, 400
  const darkFactors = [0.15, 0.3, 0.45]; // 600, 700, 800

  // Light variants (mix with white)
  lightFactors.forEach((factor, index) => {
    const variant = (index + 1) * 100; // 100, 200, 300, 400, 500
    const newR = r + (255 - r) * factor;
    const newG = g + (255 - g) * factor;
    const newB = b + (255 - b) * factor;
    variants[variant.toString()] = rgbToHex(newR, newG, newB);
  });

  // Base color (500)
  variants['500'] = color;

  // Dark variants (mix with black)
  darkFactors.forEach((factor, index) => {
    const variant = 600 + index * 100; // 600, 700, 800
    const newR = r * (1 - factor);
    const newG = g * (1 - factor);
    const newB = b * (1 - factor);
    variants[variant.toString()] = rgbToHex(newR, newG, newB);
  });

  // Very dark variant (900)
  const newR = r * 0.2;
  const newG = g * 0.2;
  const newB = b * 0.2;
  variants['900'] = rgbToHex(newR, newG, newB);

  return variants;
}

/**
 * Generates utility colors derived from main colors
 */
export function generateUtilityColors(colors: {
  primary: string;
  secondary: string;
  background: string;
  accent: string;
}): { [key: string]: string } {
  const secondaryVariants = generateColorVariants(colors.secondary);

  return {
    'text-primary': colors.secondary,
    'text-secondary': secondaryVariants['400'],
    'text-muted': secondaryVariants['300'],
    'border-color': secondaryVariants['200'],
    'border-light': secondaryVariants['100'],
    'hover-bg': generateColorVariants(colors.background)['100'],
    success: '#059669',
    warning: '#d97706',
    error: '#dc2626',
    info: '#2563eb',
  };
}
