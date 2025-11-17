import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getTrackByIdPublic } from '../../utils/api';
import Header from '../../components/ReworkComponents/generic/Header/Header';
import './publicTrack.css';

interface Track {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
}

const PublicTrack: React.FC = () => {
  const { trackId } = useParams<{ trackId: string }>();
  const [track, setTrack] = useState<Track | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTrack = async () => {
      try {
        if (!trackId) {
          setError('Track ID is missing');
          setLoading(false);
          return;
        }

        const response = await getTrackByIdPublic(trackId);
        setTrack(response.data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching track:', err);
        setError('Failed to load track information');
        setLoading(false);
      }
    };

    fetchTrack();
  }, [trackId]);

  if (loading) {
    return (
      <>
        <Header />
        <div className="public-track-container">
          <h1>Loading...</h1>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header />
        <div className="public-track-container">
          <h1>Error</h1>
          <p>{error}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="public-track-container">
        <h1>Hello World</h1>
        {track && (
          <div className="track-info">
            <h2>{track.name}</h2>
            <p>{track.description}</p>
          </div>
        )}
      </div>
    </>
  );
};

export default PublicTrack;
