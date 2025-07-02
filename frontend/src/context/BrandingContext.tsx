import React, { createContext, useContext } from 'react';
import { BrandingConfig } from '../branding/types';
import { useBranding } from '../hooks/useBranding';

const BrandingContext = createContext<BrandingConfig | null>(null);

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const branding = useBranding();

  return (
    <BrandingContext.Provider value={branding}>
      {branding ? children : <div>Loading theme...</div>}
    </BrandingContext.Provider>
  );
}

export function useBrandingContext() {
  const context = useContext(BrandingContext);
  if (context === null) {
    throw new Error(
      'useBrandingContext must be used within a BrandingProvider',
    );
  }
  return context;
}
