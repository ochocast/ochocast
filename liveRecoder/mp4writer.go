package main

import (
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/yapingcat/gomedia/go-mp4"
)

// MP4Writer writes complete audio and video frames to MP4 with proper
// timestamps. Frames come from a jitter buffer (see recordTrack): one H.264
// access unit or one Opus frame per write, in order and without duplicates.
// The video and audio tracks are written from two goroutines: mu serializes
// them (the muxer is not thread-safe) and the late frames after Close.
type MP4Writer struct {
	mu             sync.Mutex
	closed         bool
	videoWrites    int64  // video frames written (0: no usable video)
	lastPTS        uint64 // latest PTS written on any track, ms
	file           *os.File
	muxer          *mp4.Movmuxer
	videoTrackID   uint32
	audioTrackID   uint32
	videoClock     rtpClock
	audioClock     rtpClock
	videoClockRate uint32
	audioClockRate uint32
	videoStartTime time.Time
	audioStartTime time.Time
}

// rtpClock turns the 32-bit RTP timestamps of one track into the time elapsed
// since its first written frame, across wrap-arounds (6.6 h at 90 kHz).
type rtpClock struct {
	started bool
	last    uint32
	elapsed uint64 // ticks since the first frame
}

// advance returns the ticks elapsed at ts, or false for a frame older than
// the latest one.
func (c *rtpClock) advance(ts uint32) (uint64, bool) {
	if !c.started {
		c.started, c.last = true, ts
		return 0, true
	}
	delta := int32(ts - c.last)
	if delta < 0 {
		return 0, false
	}
	c.elapsed += uint64(delta)
	c.last = ts
	return c.elapsed, true
}

// NewMP4Writer creates a new MP4 writer
func NewMP4Writer(filePath string) (*MP4Writer, error) {
	file, err := os.Create(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to create file: %w", err)
	}

	muxer, err := mp4.CreateMp4Muxer(file)
	if err != nil {
		file.Close()
		return nil, fmt.Errorf("failed to create MP4 muxer: %w", err)
	}

	return &MP4Writer{file: file, muxer: muxer}, nil
}

// AddVideoTrack adds a video track to the MP4
func (w *MP4Writer) AddVideoTrack(codec string, clockRate uint32, width, height int) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.videoClockRate = clockRate

	// Add H.264 video track
	videoTrackID := w.muxer.AddVideoTrack(mp4.MP4_CODEC_H264)
	w.videoTrackID = videoTrackID

	return nil
}

// AddAudioTrack adds an audio track to the MP4
func (w *MP4Writer) AddAudioTrack(codec string, clockRate uint32) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.audioClockRate = clockRate

	// Create OpusHead extradata (19 bytes)
	// Structure according to RFC 7845:
	// - Bytes 0-7: "OpusHead" identifier
	// - Byte 8: Version (1)
	// - Byte 9: Number of channels (2 for stereo)
	// - Bytes 10-11: Pre-skip (0)
	// - Bytes 12-15: Original sample rate (48000)
	// - Bytes 16-17: Gain (0)
	// - Byte 18: Channel mapping family (0 for mono/stereo)
	opusHead := make([]byte, 19)
	copy(opusHead[0:8], []byte("OpusHead"))
	opusHead[8] = 1                               // Version
	opusHead[9] = 2                               // Channels (stereo)
	opusHead[10] = 0                              // Pre-skip (little endian, low byte)
	opusHead[11] = 0                              // Pre-skip (little endian, high byte)
	opusHead[12] = byte(clockRate & 0xFF)         // Sample rate (little endian, byte 1)
	opusHead[13] = byte((clockRate >> 8) & 0xFF)  // Sample rate (little endian, byte 2)
	opusHead[14] = byte((clockRate >> 16) & 0xFF) // Sample rate (little endian, byte 3)
	opusHead[15] = byte((clockRate >> 24) & 0xFF) // Sample rate (little endian, byte 4)
	opusHead[16] = 0                              // Gain (little endian, low byte)
	opusHead[17] = 0                              // Gain (little endian, high byte)
	opusHead[18] = 0                              // Channel mapping family

	// Add Opus audio track with extradata
	audioTrackID := w.muxer.AddAudioTrack(
		mp4.MP4_CODEC_OPUS,
		mp4.WithAudioSampleRate(clockRate),
		mp4.WithAudioChannelCount(2),
		mp4.WithExtraData(opusHead),
	)
	w.audioTrackID = audioTrackID

	return nil
}

// WriteVideoFrame writes one H.264 access unit (Annex-B) captured at the RTP
// timestamp ts. Frames before the first keyframe are dropped: they cannot be
// decoded and would show as black. It reports whether the video has started.
func (w *MP4Writer) WriteVideoFrame(frame []byte, ts uint32) (bool, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.closed || len(frame) == 0 {
		return w.videoClock.started, nil
	}
	if !w.videoClock.started {
		if !h264HasKeyframe(frame) {
			return false, nil
		}
		w.videoStartTime = time.Now()
	}

	ticks, ok := w.videoClock.advance(ts)
	if !ok {
		return true, nil
	}
	pts := ticks * 1000 / uint64(w.videoClockRate)
	if err := w.muxer.Write(w.videoTrackID, frame, pts, pts); err != nil {
		return true, fmt.Errorf("failed to write video frame: %w", err)
	}
	w.videoWrites++
	w.lastPTS = max(w.lastPTS, pts)
	return true, nil
}

// WriteAudioFrame writes one Opus frame captured at the RTP timestamp ts.
// With a video track, audio waits for the first video keyframe so both
// tracks start together.
func (w *MP4Writer) WriteAudioFrame(frame []byte, ts uint32) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.closed || len(frame) == 0 {
		return nil
	}
	if w.videoTrackID != 0 && !w.videoClock.started {
		return nil
	}
	if !w.audioClock.started {
		w.audioStartTime = time.Now()
	}

	ticks, ok := w.audioClock.advance(ts)
	if !ok {
		return nil
	}
	pts := ticks * 1000 / uint64(w.audioClockRate)
	if err := w.muxer.Write(w.audioTrackID, frame, pts, pts); err != nil {
		return fmt.Errorf("failed to write audio frame: %w", err)
	}
	w.lastPTS = max(w.lastPTS, pts)
	return nil
}

// h264HasKeyframe reports whether an Annex-B access unit holds an IDR slice.
func h264HasKeyframe(frame []byte) bool {
	for i := 0; i+3 < len(frame); i++ {
		if frame[i] == 0 && frame[i+1] == 0 && frame[i+2] == 1 && frame[i+3]&0x1f == 5 {
			return true
		}
	}
	return false
}

// GetSyncOffset returns the sync offset between audio and video in seconds
func (w *MP4Writer) GetSyncOffset() float64 {
	w.mu.Lock()
	defer w.mu.Unlock()
	if !w.videoClock.started || !w.audioClock.started {
		return 0
	}
	return w.audioStartTime.Sub(w.videoStartTime).Seconds()
}

// Duration is the recorded media duration: the latest PTS written (each
// track starts at 0).
func (w *MP4Writer) Duration() time.Duration {
	w.mu.Lock()
	defer w.mu.Unlock()
	return time.Duration(w.lastPTS) * time.Millisecond
}

// VideoWrites is the number of video payloads written to the file.
func (w *MP4Writer) VideoWrites() int64 {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.videoWrites
}

// Close finalizes the MP4 file
func (w *MP4Writer) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.closed {
		return nil
	}
	w.closed = true
	if err := w.muxer.WriteTrailer(); err != nil {
		w.file.Close()
		return fmt.Errorf("failed to write trailer: %w", err)
	}
	return w.file.Close()
}
