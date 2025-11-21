import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  const [isConnecting, setIsConnecting] = useState(false);
  const [, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(100);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const { user } = useUser();
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const noStreamTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const hasReceivedTrackRef = useRef(false);
  const streamActiveRef = useRef(false);
  const statusCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Hardcoded WHIP server URL for MVP
  const WHIP_SERVER_URL =
    'https://sfu.demo.ochocast.fr/viewer?room_id=' + trackId;
  // 'http://localhost:8090/viewer?room_id=' + trackId;
  // 'http://localhost:8079/viewer?room_id=' + trackId;

  const STREAM_STATUS_URL =
    'https://sfu.demo.ochocast.fr/stream-status?room_id=' + trackId;
  // 'http://localhost:8090/stream-status?room_id=' + trackId;
  // 'http://localhost:8079/stream-status?room_id=' + trackId;

  const checkStreamStatus = useCallback(async () => {
    if (!trackId) {
      console.log('No trackId available for status check');
      return false;
    }
    try {
      const url = STREAM_STATUS_URL;
      console.log('Checking stream status at:', url);
      const response = await fetch(url);
      if (!response.ok) {
        console.error('Failed to check stream status:', response.statusText);
        return false;
      }
      const data = await response.json();
      console.log('Stream status response:', data);
      return data.active === true;
    } catch (error) {
      console.error('Error checking stream status:', error);
      return false;
    }
  }, [trackId, STREAM_STATUS_URL]);

  const disconnectFromStream = useCallback(() => {
    console.log('Disconnecting from stream...');

    // Clear all timeouts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (noStreamTimeoutRef.current) {
      clearTimeout(noStreamTimeoutRef.current);
      noStreamTimeoutRef.current = null;
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Reset state
    setIsPlaying(false);
    setIsConnecting(false);
    hasReceivedTrackRef.current = false;

    console.log('Disconnected from stream');
  }, []);

  const connection_to_stream = useCallback(() => {
    // Clear any existing reconnection timers
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (noStreamTimeoutRef.current) {
      clearTimeout(noStreamTimeoutRef.current);
      noStreamTimeoutRef.current = null;
    }

    // Close existing connection if any
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    const startStream = async () => {
      try {
        setIsPlaying(false);
        hasReceivedTrackRef.current = false;
        setIsConnecting(true);
        setError(null);

        // Create RTCPeerConnection
        const peerConnection = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });
        peerConnectionRef.current = peerConnection;

        console.log('PeerConnection created:', peerConnection);

        // Set a timeout to check if we receive any tracks within 10 seconds
        noStreamTimeoutRef.current = setTimeout(() => {
          if (
            !hasReceivedTrackRef.current &&
            peerConnectionRef.current === peerConnection
          ) {
            console.log('No stream received within timeout');
            setError('No stream available');
            setIsConnecting(false);
          }
        }, 10000);

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
            } else if (
              peerConnection.connectionState === 'failed' ||
              peerConnection.connectionState === 'disconnected' ||
              peerConnection.connectionState === 'closed'
            ) {
              console.log('Connection lost');
              setError('Connection lost');
              setIsConnecting(false);
              setIsPlaying(false);

              // Clear the no-stream timeout as we're handling disconnection
              if (noStreamTimeoutRef.current) {
                clearTimeout(noStreamTimeoutRef.current);
                noStreamTimeoutRef.current = null;
              }
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

          // Mark that we received a track
          hasReceivedTrackRef.current = true;

          // Clear the no-stream timeout since we received a track
          if (noStreamTimeoutRef.current) {
            clearTimeout(noStreamTimeoutRef.current);
            noStreamTimeoutRef.current = null;
          }

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
            setError(null);
          } else {
            console.log('Creating MediaStream manually');
            // Fallback to creating MediaStream manually
            if (!video.srcObject) {
              video.srcObject = new MediaStream();
            }
            (video.srcObject as MediaStream).addTrack(event.track);
            setIsPlaying(true);
            setError(null);
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

    // Note: Cleanup is now handled by disconnectFromStream
  }, [WHIP_SERVER_URL]);

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
    };

    fetchTrackData();
  }, [trackId]);

  // Stream status polling effect
  useEffect(() => {
    if (!trackId) {
      console.log('No trackId, skipping stream status polling setup');
      return;
    }

    console.log('Setting up stream status polling for trackId:', trackId);

    const pollStreamStatus = async () => {
      const isActive = await checkStreamStatus();
      console.log(
        `Stream status check: ${isActive}, current streamActive: ${streamActiveRef.current}`,
      );

      if (isActive && !streamActiveRef.current) {
        // Stream became active, connect
        console.log('Stream became active, connecting...');
        streamActiveRef.current = true;
        connection_to_stream();
      } else if (!isActive && streamActiveRef.current) {
        // Stream became inactive, disconnect
        console.log('Stream became inactive, disconnecting...');
        streamActiveRef.current = false;
        disconnectFromStream();
      }
    };

    // Initial check
    pollStreamStatus();

    // Set up polling every 15 seconds
    statusCheckIntervalRef.current = setInterval(pollStreamStatus, 10000);

    // Cleanup when component unmounts or trackId changes
    return () => {
      console.log('Cleaning up stream status polling');
      if (statusCheckIntervalRef.current) {
        clearInterval(statusCheckIntervalRef.current);
        statusCheckIntervalRef.current = null;
      }
      // Only disconnect if we were connected
      if (streamActiveRef.current) {
        disconnectFromStream();
        streamActiveRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              <div className={styles.videoContainer}>
                {/* Status overlay */}
                {isConnecting && !isPlaying && (
                  <div className={styles.statusOverlay}>
                    <div className={styles.statusContent}>
                      <div className={styles.spinner}></div>
                      <p>Connecting to live stream...</p>
                    </div>
                  </div>
                )}

                {!isConnecting && !isPlaying && <WaitingScreen />}

                {/* Video element - always visible */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted={isMuted}
                  onClick={handleVideoClick}
                  className={styles.videoPlayer}
                />

                {/* Custom controls */}
                <div className={styles.customControls}>
                  <div
                    className={styles.volumeControl}
                    onMouseEnter={() => setShowVolumeSlider(true)}
                    onMouseLeave={() => setShowVolumeSlider(false)}
                  >
                    {showVolumeSlider && (
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={volume}
                        onChange={(e) => {
                          const newVolume = Number(e.target.value);
                          setVolume(newVolume);
                          if (videoRef.current) {
                            videoRef.current.volume = newVolume / 100;
                            setIsMuted(newVolume === 0);
                            videoRef.current.muted = newVolume === 0;
                          }
                        }}
                        className={styles.volumeSlider}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <button
                      className={styles.controlButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (videoRef.current) {
                          const newMutedState = !isMuted;
                          videoRef.current.muted = newMutedState;
                          setIsMuted(newMutedState);
                          if (!newMutedState && volume === 0) {
                            setVolume(50);
                            videoRef.current.volume = 0.5;
                          }
                        }
                      }}
                      title={isMuted ? 'Unmute' : 'Mute'}
                    >
                      {isMuted || volume === 0
                        ? '🔇'
                        : volume < 50
                          ? '🔉'
                          : '🔊'}
                    </button>
                  </div>
                  <button
                    className={styles.controlButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (videoRef.current) {
                        if (document.fullscreenElement) {
                          document.exitFullscreen();
                        } else {
                          videoRef.current.parentElement?.requestFullscreen();
                        }
                      }
                    }}
                    title="Toggle fullscreen"
                  >
                    ⛶
                  </button>
                </div>
              </div>
              <div className={styles.trackInfo}>
                <div className={styles.trackTitle}>
                  <h2>{track.name}</h2>
                </div>
              </div>
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
        </>
      ) : (
        <h1>{t('Loading')}</h1>
      )}
    </div>
  );
};

export default LiveTrack;
