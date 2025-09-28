import React, { useEffect, useState } from 'react';
import { useBrandingContext } from '../../../context/BrandingContext';

interface BrandingImageProps {
  imageKey: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  fallbackSrc?: string;
  onClick?: () => void;
}

const BrandingImage: React.FC<BrandingImageProps> = ({
  imageKey,
  alt = '',
  className = '',
  style = {},
  fallbackSrc = '',
  onClick,
}) => {
  const { getImageUrl } = useBrandingContext();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchImageUrl = async () => {
      setLoading(true);
      setError(false);

      try {
        const url = await getImageUrl(imageKey);
        console.log('Fetched image URL for key:', imageKey, 'URL:', url);
        if (url) {
          setImageUrl(url);
        } else {
          setError(true);
        }
      } catch (err) {
        console.error(
          `Erreur lors de la récupération de l'image ${imageKey}:`,
          err,
        );
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchImageUrl();
  }, [imageKey, getImageUrl]);

  if (loading) {
    return (
      <div className={`branding-image-loading ${className}`} style={style}>
        Loading...
      </div>
    );
  }

  if (error || !imageUrl) {
    if (fallbackSrc) {
      return (
        <img
          src={fallbackSrc}
          alt={alt || `Fallback image for ${imageKey}`}
          className={className}
          style={style}
          onClick={onClick}
        />
      );
    }
    return (
      <div className={`branding-image-error ${className}`} style={style}>
        Image non disponible
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={alt || `Image de branding: ${imageKey}`}
      className={className}
      style={style}
      onClick={onClick}
      onError={() => setError(true)}
    />
  );
};

export default BrandingImage;
