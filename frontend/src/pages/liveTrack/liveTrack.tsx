import React, { useEffect, useRef, useState } from 'react';
import styles from './liveTrack.module.css';
import { useNavigate, useParams } from 'react-router-dom';
import { getTrackById } from '../../utils/api';
import { Track } from '../../utils/EventsProperties';
import NavigateBackButton from '../../components/ReworkComponents/Button/NavigateBackButton/NavigateBackButton';
import WaitingScreen from '../../components/waitingScreen/waitingScreen';
import { useTranslation } from 'react-i18next';
import Chat from '../../components/Chat/Chat';
import { useUser } from '../../context/UserContext';

const fetchTrack = async (trackId?: string) => {
  try {
    const res = await getTrackById(trackId);
    if (res.status !== 200) {
      throw res.data.message;
    }
    return await res.data;
  } catch (error) {
    console.error(`Failed to fetch tracks: ${error}`);
  }
  return null;
};

const LiveTrack = () => {
  const { t } = useTranslation();
  const { trackId } = useParams();
  const navigate = useNavigate();
  const [track, setTrack] = useState<Track>();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const { user } = useUser();

  // Hardcoded WHIP server URL for MVP
  const WHIP_SERVER_URL = 'http://51.158.104.60:8090/viewer';

  const connection_to_stream = () => {
    let peerConnection: RTCPeerConnection | null = null;

    const startStream = async () => {
      try {
        setIsPlaying(false);
        setIsConnecting(true);
        setError(null);

        // Create RTCPeerConnection
        peerConnection = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });

        // Handle incoming tracks
        peerConnection.ontrack = (event) => {
          console.log('Received track:', event.track.kind);

          const video = videoRef.current;
          if (!video) return;

          // Use the stream from the event directly if available
          if (event.streams.length > 0) {
            video.srcObject = event.streams[0];
          } else {
            // Fallback to creating MediaStream manually
            if (!video.srcObject) {
              video.srcObject = new MediaStream();
            }
            (video.srcObject as MediaStream).addTrack(event.track);
          }

          console.log(
            'Video srcObject tracks:',
            video.srcObject instanceof MediaStream
              ? video.srcObject.getTracks().length
              : 0,
          );

          // Force video to load and play
          video.load();
          video.play().catch((e) => console.error('Auto play failed:', e));
        };

        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
          if (peerConnection) {
            console.log('Connection state:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'connected') {
              setIsConnecting(false);
            } else if (peerConnection.connectionState === 'failed') {
              setError('Connection failed');
              setIsConnecting(false);
            }
          }
        };

        // Add transceivers to receive video and audio
        peerConnection.addTransceiver('video', { direction: 'recvonly' });
        peerConnection.addTransceiver('audio', { direction: 'recvonly' });

        // Create offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // Send offer to WHIP server
        if (
          !peerConnection.localDescription ||
          !peerConnection.localDescription.sdp
        ) {
          throw new Error('Local description is not set');
        }
        const response = await fetch(WHIP_SERVER_URL, {
          method: 'POST',
          body: peerConnection.localDescription.sdp,
          headers: { 'Content-Type': 'application/sdp' },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Server error: ${response.status} ${response.statusText} - ${errorText}`,
          );
        }

        // Get answer from server
        const answerSDP = await response.text();

        // Set remote description
        await peerConnection.setRemoteDescription({
          type: 'answer',
          sdp: answerSDP,
        });

        console.log('WHIP connection established');
        setIsPlaying(true);
      } catch (err) {
        setIsPlaying(true);
        console.error('Error starting stream:', err);
        setError(err instanceof Error ? err.message : String(err));
        setIsConnecting(false);
      }
    };

    startStream();

    // Cleanup function
    return () => {
      if (peerConnection) {
        peerConnection.close();
      }
    };
  };

  if (track?.closed) {
    navigate(`/events/${track?.event.id}/tracks`);
  }

  useEffect(() => {
    const fetchTrackData = async () => {
      const track = await fetchTrack(trackId);
      if (!track) {
        console.error('Error while fetching track');
        return;
      }
      setTrack(track);
      connection_to_stream();
    };

    fetchTrackData();
  }, [trackId]);

  const handleVideoClick = () => {
    if (videoRef.current) {
      videoRef.current
        .play()
        .catch((e) => console.error('Manual play failed:', e));
    }
  };

  return (
    <div className={styles.livePage}>
      {track ? (
        <>
          <div className={styles.liveHeader}>
            <div className={styles.liveHeaderLeft}>
              <NavigateBackButton />
              <h1 className={styles.eventTitle}>{track.event.name}</h1>
            </div>
          </div>
          <div className={styles.liveContent}>
            <div className={styles.playerWrapper}>
              {isConnecting && !error && (
                <div className={styles.waitingScreen || 'waiting-screen'}>
                  <p>Connecting to live stream...</p>
                </div>
              )}

              {error && (
                <div className={styles.errorScreen || 'error-screen'}>
                  <p>Error: {error}</p>
                  <button onClick={connection_to_stream}>
                    Retry Connection
                  </button>
                </div>
              )}
              {isPlaying ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  controls
                  muted
                  onClick={handleVideoClick}
                  style={{
                    width: '100%',
                    maxWidth: '800px',
                    height: 'auto',
                    backgroundColor: '#000',
                    border: '1px solid #ccc',
                    display: isConnecting && !error ? 'none' : 'block',
                  }}
                />
              ) : (
                <WaitingScreen />
              )}
            </div>
            <div className={styles.chatWrapper}>
              {user && trackId && (
                <Chat
                  trackId={trackId}
                  userId={user.id}
                  username={`${user.firstName} ${user.lastName}`}
                />
              )}
            </div>
          </div>
          <div className={styles.trackInfo}>
            <div className={styles.trackTitle}>
              <h2>{track.name}</h2>main
            </div>
          </div>
        </>
      ) : (
        <h1>{t('Loading')}</h1>
      )}
    </div>
  );
};

export default LiveTrack;
