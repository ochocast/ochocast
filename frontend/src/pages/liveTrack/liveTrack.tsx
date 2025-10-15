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
  const WHIP_SERVER_URL =
    'https://35b32e24-b50b-4145-946c-9102346dec0c.pub.instances.scw.cloud/viewer';

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

        console.log('PeerConnection created:', peerConnection);

        // Handle ICE connection state changes
        peerConnection.oniceconnectionstatechange = () => {
          if (peerConnection) {
            console.log(
              'ICE connection state:',
              peerConnection.iceConnectionState,
            );
          }
        };

        // Handle ICE gathering state changes
        peerConnection.onicegatheringstatechange = () => {
          if (peerConnection) {
            console.log(
              'ICE gathering state:',
              peerConnection.iceGatheringState,
            );
          }
        };

        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
          if (peerConnection) {
            console.log('Connection state:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'connected') {
              setIsConnecting(false);
              console.log('WebRTC connection fully established');
            } else if (peerConnection.connectionState === 'failed') {
              setError('Connection failed');
              setIsConnecting(false);
            }
          }
        };

        // Add transceivers to receive video and audio BEFORE creating offer
        const videoTransceiver = peerConnection.addTransceiver('video', {
          direction: 'recvonly',
        });
        const audioTransceiver = peerConnection.addTransceiver('audio', {
          direction: 'recvonly',
        });
        console.log('Transceivers added:', {
          video: videoTransceiver,
          audio: audioTransceiver,
        });

        // Handle incoming tracks - This should fire when remote tracks arrive
        peerConnection.ontrack = (event) => {
          console.log('🎥 ontrack event fired!');
          console.log(
            'Received track:',
            event.track.kind,
            'Track ID:',
            event.track.id,
          );
          console.log('Track state:', event.track.readyState);
          console.log('Event streams:', event.streams);

          const video = videoRef.current;
          if (!video) {
            console.error('Video element not found in ref');
            return;
          }

          // Use the stream from the event directly if available
          if (event.streams && event.streams.length > 0) {
            console.log('Using stream from event:', event.streams[0].id);
            video.srcObject = event.streams[0];
            setIsPlaying(true);
          } else {
            console.log('Creating MediaStream manually');
            // Fallback to creating MediaStream manually
            if (!video.srcObject) {
              video.srcObject = new MediaStream();
            }
            (video.srcObject as MediaStream).addTrack(event.track);
            setIsPlaying(true);
          }

          const srcObject = video.srcObject as MediaStream;
          console.log(
            'Video srcObject tracks:',
            srcObject ? srcObject.getTracks().length : 0,
          );
          console.log(
            'Tracks details:',
            srcObject
              ? srcObject
                  .getTracks()
                  .map((t) => ({ kind: t.kind, id: t.id, state: t.readyState }))
              : [],
          );

          // Force video to load and play
          video.load();
          video.play().catch((e) => console.error('Auto play failed:', e));
        };

        // Create offer
        console.log('Creating offer...');
        const offer = await peerConnection.createOffer();
        console.log('Offer created:', offer);

        await peerConnection.setLocalDescription(offer);
        console.log('Local description set');

        // Wait for ICE gathering to complete
        await new Promise<void>((resolve) => {
          if (peerConnection?.iceGatheringState === 'complete') {
            resolve();
          } else {
            const checkState = () => {
              if (peerConnection?.iceGatheringState === 'complete') {
                peerConnection.removeEventListener(
                  'icegatheringstatechange',
                  checkState,
                );
                resolve();
              }
            };
            peerConnection?.addEventListener(
              'icegatheringstatechange',
              checkState,
            );
          }
        });

        console.log('ICE gathering complete, sending offer to WHIP server...');

        // Send offer to WHIP server
        if (
          !peerConnection.localDescription ||
          !peerConnection.localDescription.sdp
        ) {
          throw new Error('Local description is not set');
        }

        console.log('Sending SDP to:', WHIP_SERVER_URL);
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
        console.log('Received answer from server');

        // Set remote description
        await peerConnection.setRemoteDescription({
          type: 'answer',
          sdp: answerSDP,
        });

        console.log('WHIP connection established, remote description set');
        console.log('Waiting for tracks...');
      } catch (err) {
        console.error('Error starting stream:', err);
        setError(err instanceof Error ? err.message : String(err));
        setIsConnecting(false);
      }
    };

    startStream();

    // Cleanup function
    return () => {
      console.log('Cleaning up peer connection');
      if (peerConnection) {
        peerConnection.close();
      }
    };
  };

  if (track?.closed) {
    navigate(`/events/${track?.event.id}/tracks`);
  }

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const fetchTrackData = async () => {
      const track = await fetchTrack(trackId);
      if (!track) {
        console.error('Error while fetching track');
        return;
      }
      setTrack(track);
      cleanup = connection_to_stream();
    };

    fetchTrackData();

    // Cleanup when component unmounts or trackId changes
    return () => {
      if (cleanup) {
        cleanup();
      }
    };
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
              {isConnecting && !error && !isPlaying && (
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

              {/* Video element must always be in DOM for videoRef to work when ontrack fires */}
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
                  display: isPlaying ? 'block' : 'none',
                }}
              />

              {!isPlaying && !isConnecting && !error && <WaitingScreen />}
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
              <h2>{track.name}</h2>
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
