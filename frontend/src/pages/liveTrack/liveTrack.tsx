import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './liveTrack.module.css';
import { useNavigate, useParams } from 'react-router-dom';
import { getTrackById, getRoomViewerCount } from '../../utils/api';
import { Track } from '../../utils/EventsProperties';
import NavigateBackButton from '../../components/ReworkComponents/Button/NavigateBackButton/NavigateBackButton';
import WaitingScreen from '../../components/waitingScreen/waitingScreen';
import { useTranslation } from 'react-i18next';
import Chat from '../../components/Chat/Chat';
import PollsContainer from '../../components/Polls/PollsContainer';
import { useUser } from '../../context/UserContext';
import getEnv from '../../utils/env';

// ============ LOGGER UTILITY ============
const Logger = {
  info: (context: string, message: string, data?: unknown) => {
    console.log(`[${context}] ℹ️ ${message}`, data || '');
  },
  error: (context: string, message: string, data?: unknown) => {
    console.error(`[${context}] ❌ ${message}`, data || '');
  },
  warn: (context: string, message: string, data?: unknown) => {
    console.warn(`[${context}] ⚠️ ${message}`, data || '');
  },
  success: (context: string, message: string, data?: unknown) => {
    console.log(`[${context}] ✅ ${message}`, data || '');
  },
};

const fetchTrack = async (trackId?: string) => {
  try {
    const res = await getTrackById(trackId);
    if (res.status !== 200) {
      throw res.data.message;
    }
    return await res.data;
  } catch (error) {
    Logger.error('FetchTrack', `Failed to fetch tracks: ${error}`);
  }
  return null;
};

// ============ RECONNECTION CONFIG (Outside component to avoid dependency issues) ============
const RECONNECTION_CONFIG = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  backoffMultiplier: 2,
  healthCheckIntervalMs: 10000,
  healthCheckFailThreshold: 2,
  frameBufferDelayMs: 300,
  iceDisconnectedTimeoutMs: 5000,
};

const LiveTrack = () => {
  const { t } = useTranslation();
  const { trackId } = useParams();
  const navigate = useNavigate();
  const [track, setTrack] = useState<Track>();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(100);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [showClosedPolls, setShowClosedPolls] = useState(false);
  const [viewerCount, setViewerCount] = useState<number>(0);
  const { user } = useUser();
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const noStreamTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const hasReceivedTrackRef = useRef(false);
  const streamActiveRef = useRef(false);
  const statusCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const healthCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const healthCheckFailCountRef = useRef(0);
  const iceDisconnectedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionToStreamRefRef = useRef<(() => Promise<void>) | null>(null);
  const viewerCountIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Control plane URL for SFU discovery
  const CONTROL_PLANE_URL = getEnv('REACT_APP_SFU_CONTROL_PLANE_URL');

  // Calculate exponential backoff delay
  const getReconnectDelay = (attempt: number): number => {
    return (
      RECONNECTION_CONFIG.baseDelayMs *
      Math.pow(RECONNECTION_CONFIG.backoffMultiplier, attempt)
    );
  };

  // Fetch viewer count periodically
  useEffect(() => {
    if (!trackId) return;

    const fetchViewerCount = async () => {
      try {
        const data = await getRoomViewerCount(trackId);
        if (data && typeof data.viewer_count === 'number') {
          setViewerCount(data.viewer_count);
        }
      } catch (error) {
        Logger.error('ViewerCount', 'Failed to fetch viewer count', error);
      }
    };

    // Fetch immediately
    fetchViewerCount();

    // Then fetch every 5 seconds
    viewerCountIntervalRef.current = setInterval(fetchViewerCount, 5000);

    return () => {
      if (viewerCountIntervalRef.current) {
        clearInterval(viewerCountIntervalRef.current);
        viewerCountIntervalRef.current = null;
      }
    };
  }, [trackId]);

  // Discover SFU endpoint from control plane
  const discoverSFU = useCallback(
    async (roomId: string) => {
      try {
        const discoveryUrl = `${CONTROL_PLANE_URL}/viewer?room_id=${roomId}`;
        console.log('Discovering SFU from control plane:', discoveryUrl);

        const response = await fetch(discoveryUrl);
        if (!response.ok) {
          throw new Error(
            `Discovery failed: ${response.status} ${response.statusText}`,
          );
        }

        const data = await response.json();
        console.log('SFU discovery response:', data);

        if (!data.sfu_url) {
          throw new Error('No SFU URL returned from control plane');
        }

        // Return the direct SFU URL for viewer endpoint
        const sfuViewerUrl = `${data.sfu_url}/viewer?room_id=${roomId}`;
        console.log('Discovered SFU viewer URL:', sfuViewerUrl);
        return sfuViewerUrl;
      } catch (error) {
        console.error('Failed to discover SFU:', error);
        throw error;
      }
    },
    [CONTROL_PLANE_URL],
  );

  // Stream status URL - try to get from SFU if available, fallback to control plane
  const getStreamStatusUrl = useCallback(() => {
    return `${CONTROL_PLANE_URL}/stream-status?room_id=${trackId}`;
  }, [CONTROL_PLANE_URL, trackId]);

  const checkStreamStatus = useCallback(async () => {
    if (!trackId) {
      console.log('No trackId available for status check');
      return false;
    }
    try {
      const url = getStreamStatusUrl();
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
  }, [trackId, getStreamStatusUrl]);

  // ============ HEALTH CHECK ============
  const checkStreamHealth = useCallback(async (): Promise<boolean> => {
    try {
      const url = `${CONTROL_PLANE_URL}/stream-status?room_id=${trackId}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        Logger.warn(
          'HealthCheck',
          `Stream status check failed: ${response.status}`,
        );
        healthCheckFailCountRef.current++;
        return false;
      }
      const data = await response.json();
      if (data.active === true) {
        Logger.success('HealthCheck', 'Stream is healthy');
        healthCheckFailCountRef.current = 0; // Reset fail count
        return true;
      }
      Logger.warn('HealthCheck', 'Stream is not active');
      healthCheckFailCountRef.current++;
      return false;
    } catch (error) {
      Logger.error('HealthCheck', 'Health check error', error);
      healthCheckFailCountRef.current++;
      return false;
    }
  }, [trackId, CONTROL_PLANE_URL]);

  // ============ DISCONNECTION ============
  const disconnectFromStream = useCallback(() => {
    Logger.info('Stream', 'Disconnecting from stream...');

    // Clear all timeouts and intervals
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (noStreamTimeoutRef.current) {
      clearTimeout(noStreamTimeoutRef.current);
      noStreamTimeoutRef.current = null;
    }
    if (iceDisconnectedTimeoutRef.current) {
      clearTimeout(iceDisconnectedTimeoutRef.current);
      iceDisconnectedTimeoutRef.current = null;
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Reset state
    setIsPlaying(false);
    setIsConnecting(false);
    setIsReconnecting(false);
    hasReceivedTrackRef.current = false;

    Logger.success('Stream', 'Disconnected from stream');
  }, []);

  const attemptReconnect = useCallback(
    async (attempt: number = 0): Promise<void> => {
      if (attempt >= RECONNECTION_CONFIG.maxAttempts) {
        Logger.error(
          'Reconnection',
          `Failed after ${RECONNECTION_CONFIG.maxAttempts} attempts`,
        );
        setError(
          `Failed to reconnect after ${RECONNECTION_CONFIG.maxAttempts} attempts. Please refresh the page.`,
        );
        setIsReconnecting(false);
        return;
      }

      const delay = getReconnectDelay(attempt);
      Logger.info(
        'Reconnection',
        `Attempt ${attempt + 1}/${
          RECONNECTION_CONFIG.maxAttempts
        } - waiting ${delay}ms`,
      );

      setIsReconnecting(true);
      await new Promise((resolve) => setTimeout(resolve, delay));

      try {
        Logger.info(
          'Reconnection',
          `Starting reconnection attempt ${attempt + 1}`,
        );
        reconnectAttemptsRef.current = attempt;
        if (connectionToStreamRefRef.current) {
          await connectionToStreamRefRef.current();
        }
        Logger.success('Reconnection', 'Successfully reconnected');
        reconnectAttemptsRef.current = 0;
        setIsReconnecting(false);
      } catch (err) {
        Logger.warn('Reconnection', `Attempt ${attempt + 1} failed`, err);
        await attemptReconnect(attempt + 1);
      }
    },
    [],
  );

  // ============ HANDLE INCOMING TRACKS (CORRECT MediaStream API) ============
  const handleIncomingTrack = useCallback(
    (event: RTCTrackEvent, peerConnection: RTCPeerConnection) => {
      Logger.info('Track', `🎥 Received ${event.track.kind} track`, {
        id: event.track.id,
        readyState: event.track.readyState,
        streams: event.streams.length,
      });

      // Verify track is live
      if (event.track.readyState !== 'live') {
        Logger.warn('Track', 'Track is not live, ignoring');
        return;
      }

      hasReceivedTrackRef.current = true;

      // Clear the no-stream timeout
      if (noStreamTimeoutRef.current) {
        clearTimeout(noStreamTimeoutRef.current);
        noStreamTimeoutRef.current = null;
      }

      const video = videoRef.current;
      if (!video) {
        Logger.error('Track', 'Video element not found');
        return;
      }

      // ✅ CORRECT: Use event.streams if available, or create fresh MediaStream WITH the track
      let mediaStream: MediaStream;
      if (event.streams && event.streams.length > 0) {
        Logger.info('Track', 'Using stream from event');
        mediaStream = event.streams[0];
      } else {
        // ✅ CORRECT: Create MediaStream with the track inside, not empty!
        Logger.info('Track', 'Creating new MediaStream with track');
        mediaStream = new MediaStream([event.track]);
      }

      video.srcObject = mediaStream;

      // ✅ Buffer the frame for 300ms before playing
      Logger.info(
        'Track',
        `Buffering frame for ${RECONNECTION_CONFIG.frameBufferDelayMs}ms before playback`,
      );
      setTimeout(() => {
        if (video && video.srcObject) {
          Logger.info('Track', 'Starting playback after buffer delay');
          // Use video events to confirm playback, not state
          video.oncanplay = () => {
            Logger.success('Track', 'Video can play');
            setIsPlaying(true);
            setError(null);
          };
          video.play().catch((e) => {
            Logger.warn('Track', 'Auto play failed', e);
          });
        }
      }, RECONNECTION_CONFIG.frameBufferDelayMs);
    },
    [],
  );

  const connection_to_stream = useCallback(async () => {
    // Store in ref so attemptReconnect can call it without circular dependency
    connectionToStreamRefRef.current = connection_to_stream;

    // Clear any existing timers
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (noStreamTimeoutRef.current) {
      clearTimeout(noStreamTimeoutRef.current);
      noStreamTimeoutRef.current = null;
    }
    if (iceDisconnectedTimeoutRef.current) {
      clearTimeout(iceDisconnectedTimeoutRef.current);
      iceDisconnectedTimeoutRef.current = null;
    }

    // Close existing connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

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

      Logger.info('Connection', 'PeerConnection created');

      // ============ SET TIMEOUTS ============
      noStreamTimeoutRef.current = setTimeout(() => {
        if (
          !hasReceivedTrackRef.current &&
          peerConnectionRef.current === peerConnection
        ) {
          Logger.warn('Connection', 'No stream received within timeout');
          setError('No stream available');
          setIsConnecting(false);
        }
      }, 15000); // Increased to 15s

      // ============ MONITOR ICE CONNECTION STATE ============
      peerConnection.oniceconnectionstatechange = () => {
        const state = peerConnection.iceConnectionState;
        Logger.info('ICE', `Connection state changed: ${state}`);

        if (state === 'disconnected') {
          Logger.warn(
            'ICE',
            'Disconnected, waiting 5 seconds to see if recovers',
          );
          if (iceDisconnectedTimeoutRef.current) {
            clearTimeout(iceDisconnectedTimeoutRef.current);
          }
          // Wait 5s to see if it recovers to "connected"
          iceDisconnectedTimeoutRef.current = setTimeout(() => {
            if (peerConnection.iceConnectionState === 'disconnected') {
              Logger.error(
                'ICE',
                'Still disconnected after 5s, triggering reconnect',
              );
              attemptReconnect(0);
            }
          }, RECONNECTION_CONFIG.iceDisconnectedTimeoutMs);
        } else if (state === 'failed' || state === 'closed') {
          Logger.error('ICE', `Connection failed/closed, triggering reconnect`);
          if (iceDisconnectedTimeoutRef.current) {
            clearTimeout(iceDisconnectedTimeoutRef.current);
          }
          attemptReconnect(0);
        } else if (state === 'connected') {
          Logger.success('ICE', 'Connected');
          // Clear any pending reconnection
          if (iceDisconnectedTimeoutRef.current) {
            clearTimeout(iceDisconnectedTimeoutRef.current);
            iceDisconnectedTimeoutRef.current = null;
          }
        }
      };

      peerConnection.onicegatheringstatechange = () => {
        Logger.info(
          'ICE',
          `Gathering state: ${peerConnection.iceGatheringState}`,
        );
      };

      // ============ MONITOR CONNECTION STATE ============
      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        Logger.info('Connection', `State changed: ${state}`);

        if (state === 'connected') {
          setIsConnecting(false);
          Logger.success('Connection', 'WebRTC connection fully established');
        } else if (
          state === 'failed' ||
          state === 'disconnected' ||
          state === 'closed'
        ) {
          Logger.error(
            'Connection',
            `Connection ${state}, triggering reconnect`,
          );
          setIsConnecting(false);
          setIsPlaying(false);
          if (noStreamTimeoutRef.current) {
            clearTimeout(noStreamTimeoutRef.current);
            noStreamTimeoutRef.current = null;
          }
          attemptReconnect(0);
        }
      };

      // ============ ADD TRANSCEIVERS ============
      const videoTransceiver = peerConnection.addTransceiver('video', {
        direction: 'recvonly',
      });
      const audioTransceiver = peerConnection.addTransceiver('audio', {
        direction: 'recvonly',
      });
      Logger.info('Connection', 'Transceivers added', {
        video: !!videoTransceiver,
        audio: !!audioTransceiver,
      });

      // ============ HANDLE INCOMING TRACKS ============
      peerConnection.ontrack = (event) => {
        handleIncomingTrack(event, peerConnection);
      };

      // ============ CREATE OFFER ============
      Logger.info('Connection', 'Creating offer');
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      Logger.success('Connection', 'Local description set');

      // ============ WAIT FOR ICE GATHERING ============
      await new Promise<void>((resolve) => {
        if (peerConnection?.iceGatheringState === 'complete') {
          resolve();
          return;
        }

        const timeout = setTimeout(() => {
          Logger.warn('Connection', 'ICE gathering timeout, proceeding');
          resolve();
        }, 2000);

        const checkState = () => {
          if (peerConnection?.iceGatheringState === 'complete') {
            clearTimeout(timeout);
            peerConnection.removeEventListener(
              'icegatheringstatechange',
              checkState,
            );
            resolve();
          }
        };
        peerConnection?.addEventListener('icegatheringstatechange', checkState);
      });

      Logger.info('Connection', 'Discovering SFU');

      // ============ DISCOVER SFU ============
      let sfuViewerUrl: string;
      try {
        sfuViewerUrl = await discoverSFU(trackId!);
      } catch (error) {
        throw new Error(
          `Failed to discover SFU: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      // ============ SEND OFFER TO SFU ============
      if (!peerConnection.localDescription?.sdp) {
        throw new Error('Local description is not set');
      }

      Logger.info('Connection', 'Sending SDP to SFU');
      const response = await fetch(sfuViewerUrl, {
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

      const answerSDP = await response.text();
      Logger.success('Connection', 'Received answer from SFU');

      // ============ SET REMOTE DESCRIPTION ============
      await peerConnection.setRemoteDescription({
        type: 'answer',
        sdp: answerSDP,
      });

      Logger.success(
        'Connection',
        'WHIP connection established, waiting for tracks',
      );
    } catch (err) {
      Logger.error('Connection', 'Error starting stream', err);
      setError(err instanceof Error ? err.message : String(err));
      setIsConnecting(false);
      throw err; // Re-throw for reconnection handler
    }
  }, [discoverSFU, trackId, handleIncomingTrack, attemptReconnect]);

  if (track?.closed) {
    navigate(`/events/${track?.event.id}/tracks`);
  }

  useEffect(() => {
    const fetchTrackData = async () => {
      const track = await fetchTrack(trackId);
      if (!track) {
        Logger.error('FetchTrack', 'Error while fetching track');
        return;
      }
      setTrack(track);
    };

    fetchTrackData();
  }, [trackId]);

  // ============ STREAM STATUS POLLING EFFECT ============
  useEffect(() => {
    if (!trackId) {
      Logger.warn('StatusPolling', 'No trackId, skipping polling');
      return;
    }

    Logger.info('StatusPolling', 'Setting up stream status polling', {
      trackId,
    });

    const pollStreamStatus = async () => {
      const isActive = await checkStreamStatus();
      Logger.info(
        'StatusPolling',
        `Stream status: ${isActive ? 'active' : 'inactive'}`,
      );

      if (isActive && !streamActiveRef.current) {
        Logger.info('StatusPolling', 'Stream became active, connecting');
        streamActiveRef.current = true;
        connection_to_stream().catch((err: unknown) => {
          Logger.error('StatusPolling', 'Connection failed', err);
        });
      } else if (!isActive && streamActiveRef.current) {
        Logger.warn('StatusPolling', 'Stream became inactive, disconnecting');
        streamActiveRef.current = false;
        disconnectFromStream();
      }
    };

    // Initial check
    pollStreamStatus();

    // Poll every 3 seconds
    statusCheckIntervalRef.current = setInterval(pollStreamStatus, 3000);

    // ============ HEALTH CHECK INTERVAL ============
    healthCheckIntervalRef.current = setInterval(async () => {
      const isHealthy = await checkStreamHealth();
      if (
        !isHealthy &&
        healthCheckFailCountRef.current >=
          RECONNECTION_CONFIG.healthCheckFailThreshold
      ) {
        Logger.warn(
          'HealthCheck',
          `Health check failed ${healthCheckFailCountRef.current} times, triggering reconnect`,
        );
        if (peerConnectionRef.current?.connectionState === 'connected') {
          attemptReconnect(0);
        }
      }
    }, RECONNECTION_CONFIG.healthCheckIntervalMs);

    // Cleanup on unmount or trackId change
    return () => {
      Logger.info('StatusPolling', 'Cleaning up polling');
      if (statusCheckIntervalRef.current) {
        clearInterval(statusCheckIntervalRef.current);
        statusCheckIntervalRef.current = null;
      }
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
        healthCheckIntervalRef.current = null;
      }
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
        .catch((e) => Logger.warn('Video', 'Manual play failed', e));
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
            <div className={styles.liveLeft}>
              <div className={styles.playerWrapper}>
                <div className={styles.videoContainer}>
                  {/* Error message */}
                  {error && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '10px',
                        left: '10px',
                        background: 'rgba(255,0,0,0.8)',
                        color: 'white',
                        padding: '10px 15px',
                        borderRadius: '5px',
                        zIndex: 100,
                        fontSize: '14px',
                        maxWidth: '400px',
                      }}
                    >
                      ❌ {error}
                    </div>
                  )}

                  {/* Reconnecting indicator */}
                  {isReconnecting && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        background: 'rgba(255,165,0,0.8)',
                        color: 'white',
                        padding: '10px 15px',
                        borderRadius: '5px',
                        zIndex: 100,
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <span>🔄</span>
                      <span>
                        Reconnecting... (Attempt{' '}
                        {reconnectAttemptsRef.current + 1})
                      </span>
                    </div>
                  )}

                  {/* Status overlay */}
                  {isConnecting && !isPlaying && (
                    <div className={styles.statusOverlay}>
                      <div className={styles.statusContent}>
                        <div className={styles.spinner}></div>
                        <p>{t('CheckingRoom') || 'Checking room status...'}</p>
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
                    <div className={styles.viewerCountBadge}>
                      <svg
                        className={styles.viewerIcon}
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      <span className={styles.viewerNumber}>{viewerCount}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.contentGrid}>
                <div className={styles.descriptionBox}>
                  <div className={styles.description}>
                    <div>
                      <h3
                        style={{
                          margin: '0 0 12px 0',
                          fontSize: '14px',
                          fontWeight: '600',
                          color: 'var(--theme-color-900, #111827)',
                        }}
                      >
                        Description
                      </h3>
                      <p>{track.description}</p>
                    </div>
                  </div>
                </div>

                <div className={styles.pollsGridWrapper}>
                  {user && trackId && (
                    <PollsContainer
                      trackId={trackId}
                      userId={user.id}
                      isSpeaker={
                        track?.speakers?.some((s) => s.id === user?.id) ?? false
                      }
                      hideExtraPolls={true}
                    />
                  )}
                </div>

                <div className={styles.pollsGridMain}>
                  {user && trackId && (
                    <PollsContainer
                      trackId={trackId}
                      userId={user.id}
                      isSpeaker={
                        track?.speakers?.some((s) => s.id === user?.id) ?? false
                      }
                      showOnlyExtraPolls={true}
                    />
                  )}
                </div>

                <button
                  className={styles.closedPollsToggle}
                  onClick={() => setShowClosedPolls(!showClosedPolls)}
                >
                  <span>{t('polls.closedPolls')}</span>
                  <span className={styles.toggleIcon}>
                    {showClosedPolls ? '▼' : '▶'}
                  </span>
                </button>
                {showClosedPolls && (
                  <div className={styles.closedPollsGrid}>
                    {user && trackId && (
                      <PollsContainer
                        trackId={trackId}
                        userId={user.id}
                        isSpeaker={
                          track?.speakers?.some((s) => s.id === user?.id) ??
                          false
                        }
                        showOnlyClosedPolls={true}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.chatWrapper}>
              {user && trackId && (
                <Chat
                  trackId={trackId}
                  userId={user.id}
                  username={`${user.firstName} ${user.lastName}`}
                  isSpeaker={
                    track?.speakers?.some((s) => s.id === user?.id) ?? false
                  }
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
