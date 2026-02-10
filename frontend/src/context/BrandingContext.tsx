import React, { createContext, useContext, useCallback } from 'react';
import { BrandingContextType } from '../branding/types';
import { useBranding } from '../hooks/useBranding';
import { getBrandingPicture } from '../utils/api';
import LoadingPage from '../pages/Loading/Loading';

export const BrandingContext = createContext<BrandingContextType | null>(null);

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const branding = useBranding();

  const getImageUrl = useCallback(
    async (imageKey: string): Promise<string | null> => {
      if (!branding?.images || !branding.images[imageKey]) {
        console.warn(`Image key "${imageKey}" not found in branding config`);
        return null;
      }

      // Si l'image utilise le préfixe ::default::, la servir depuis /branding/
      if (branding.images[imageKey].startsWith('::default::')) {
        const imageName = branding.images[imageKey].replace('::default::', '');
        const url = `${window.location.origin}/branding/${imageName}`;
        return url;
      }

      try {
        const imagePath = branding.images[imageKey];
        const response = await getBrandingPicture(imagePath);
        if (response.status === 200 && response.data?.url) {
          return response.data.url;
        } else {
          console.error(`Failed to fetch image URL for key "${imageKey}"`);
          return null;
        }
      } catch (error) {
        console.error(`Error fetching image URL for key "${imageKey}":`, error);
        return null;
      }
    },
    [branding],
  );

  const contextValue: BrandingContextType | null = branding
    ? {
        ...branding,
        getImageUrl,
      }
    : null;

  if (!contextValue) {
    return <LoadingPage />;
  }

  return (
    <BrandingContext.Provider value={contextValue}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBrandingContext(): BrandingContextType {
  const context = useContext(BrandingContext);
  if (context === null) {
    throw new Error(
      'useBrandingContext must be used within a BrandingProvider',
    );
  }
  return context;
}
