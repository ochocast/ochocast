import { useState, useEffect } from 'react';
import { useBrandingContext } from '../context/BrandingContext';

interface UseBrandingImageResult {
  imageUrl: string | null;
  loading: boolean;
  error: boolean;
}

/**
 * Hook pour récupérer facilement l'URL d'une image de branding
 * @param imageKey - Clé de l'image dans la configuration de branding
 * @returns objet avec l'URL de l'image, l'état de chargement et l'état d'erreur
 */
export const useBrandingImage = (imageKey: string): UseBrandingImageResult => {
  const { getImageUrl } = useBrandingContext();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchImageUrl = async () => {
      if (!imageKey) {
        setLoading(false);
        setError(true);
        return;
      }

      setLoading(true);
      setError(false);
      setImageUrl(null);

      try {
        const url = await getImageUrl(imageKey);
        if (url) {
          setImageUrl(url);
          setError(false);
        } else {
          setError(true);
        }
      } catch (err) {
        console.error(
          `Erreur lors de la récupération de l'image ${imageKey}:`,
          err,
        );
        setError(true);
        setImageUrl(null);
      } finally {
        setLoading(false);
      }
    };

    fetchImageUrl();
  }, [imageKey, getImageUrl]);

  return {
    imageUrl,
    loading,
    error,
  };
};

/**
 * Hook pour récupérer plusieurs images de branding en une fois
 * @param imageKeys - Tableau des clés d'images
 * @returns objet avec les URLs des images, l'état de chargement global et les erreurs
 */
export const useBrandingImages = (
  imageKeys: string[],
): {
  imageUrls: Record<string, string | null>;
  loading: boolean;
  errors: Record<string, boolean>;
} => {
  const { getImageUrl } = useBrandingContext();
  const [imageUrls, setImageUrls] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchAllImages = async () => {
      if (imageKeys.length === 0) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const newImageUrls: Record<string, string | null> = {};
      const newErrors: Record<string, boolean> = {};

      await Promise.all(
        imageKeys.map(async (key) => {
          try {
            const url = await getImageUrl(key);
            newImageUrls[key] = url;
            newErrors[key] = !url;
          } catch (err) {
            console.error(
              `Erreur lors de la récupération de l'image ${key}:`,
              err,
            );
            newImageUrls[key] = null;
            newErrors[key] = true;
          }
        }),
      );

      setImageUrls(newImageUrls);
      setErrors(newErrors);
      setLoading(false);
    };

    fetchAllImages();
  }, [imageKeys, getImageUrl]);

  return {
    imageUrls,
    loading,
    errors,
  };
};
