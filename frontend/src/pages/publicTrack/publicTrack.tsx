import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getTrackByIdPublic } from '../../utils/api';
import Header from '../../components/ReworkComponents/generic/Header/Header';
import PublicPollsViewer from '../../components/Polls/PublicPollsViewer';
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
  const { t } = useTranslation();
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
          <div className="loading-state">
            <h1>{t('publicTrack.loading')}</h1>
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header />
        <div className="public-track-container">
          <div className="error-state">
            <h1>{t('publicTrack.error')}</h1>
            <p>{t('publicTrack.trackNotFound')}</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="public-track-container">
        <div className="track-header">
          <div className="header-content">
            <h1>{t('publicTrack.title')}</h1>
            <p className="header-subtitle">{t('publicTrack.description')}</p>
          </div>
        </div>

        <div className="track-content">
          {track && (
            <div className="track-info">
              <div className="track-details">
                <h2>{track.name}</h2>
                <p className="track-description">{track.description}</p>
                <div className="track-metadata">
                  <div className="metadata-item">
                    <span className="metadata-label">
                      {t('publicTrack.eventDate')}:
                    </span>
                    <span className="metadata-value">
                      {new Date(track.startDate).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-label">
                      {t('publicTrack.trackStartTime')}:
                    </span>
                    <span className="metadata-value">
                      {new Date(track.startDate).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="metadata-item">
                    <span className="metadata-label">
                      {t('publicTrack.trackEndTime')}:
                    </span>
                    <span className="metadata-value">
                      {new Date(track.endDate).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {trackId && (
            <div className="track-polls-section">
              <div className="polls-header">
                <h2>{t('publicTrack.livePolls')}</h2>
              </div>
              <PublicPollsViewer trackId={trackId} />
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default PublicTrack;
