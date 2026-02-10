package main

import (
	"fmt"
	"os"
	"time"

	"github.com/pion/rtp"
	"github.com/pion/rtp/codecs"
	"github.com/yapingcat/gomedia/go-mp4"
)

// MP4Writer writes audio and video packets directly to MP4 with proper timestamps
type MP4Writer struct {
	file              *os.File
	muxer             *mp4.Movmuxer
	videoTrackID      uint32
	audioTrackID      uint32
	videoFirstRTP     uint32
	audioFirstRTP     uint32
	videoClockRate    uint32
	audioClockRate    uint32
	videoFirstSet     bool
	audioFirstSet     bool
	videoStartTime    time.Time
	audioStartTime    time.Time
	h264Depacketizer  *codecs.H264Packet
	opusDepacketizer  *codecs.OpusPacket
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

	return &MP4Writer{
		file:             file,
		muxer:            muxer,
		h264Depacketizer: &codecs.H264Packet{},
		opusDepacketizer: &codecs.OpusPacket{},
	}, nil
}

// AddVideoTrack adds a video track to the MP4
func (w *MP4Writer) AddVideoTrack(codec string, clockRate uint32, width, height int) error {
	w.videoClockRate = clockRate

	// Add H.264 video track
	videoTrackID := w.muxer.AddVideoTrack(mp4.MP4_CODEC_H264)
	w.videoTrackID = videoTrackID

	return nil
}

// AddAudioTrack adds an audio track to the MP4
func (w *MP4Writer) AddAudioTrack(codec string, clockRate uint32) error {
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
	opusHead[8] = 1                                    // Version
	opusHead[9] = 2                                    // Channels (stereo)
	opusHead[10] = 0                                   // Pre-skip (little endian, low byte)
	opusHead[11] = 0                                   // Pre-skip (little endian, high byte)
	opusHead[12] = byte(clockRate & 0xFF)              // Sample rate (little endian, byte 1)
	opusHead[13] = byte((clockRate >> 8) & 0xFF)       // Sample rate (little endian, byte 2)
	opusHead[14] = byte((clockRate >> 16) & 0xFF)      // Sample rate (little endian, byte 3)
	opusHead[15] = byte((clockRate >> 24) & 0xFF)      // Sample rate (little endian, byte 4)
	opusHead[16] = 0                                   // Gain (little endian, low byte)
	opusHead[17] = 0                                   // Gain (little endian, high byte)
	opusHead[18] = 0                                   // Channel mapping family

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

// WriteVideoRTP writes a video RTP packet to MP4
func (w *MP4Writer) WriteVideoRTP(packet *rtp.Packet) error {
	// Initialize first timestamp
	if !w.videoFirstSet {
		w.videoFirstRTP = packet.Timestamp
		w.videoStartTime = time.Now()
		w.videoFirstSet = true
	}

	// Calculate PTS in milliseconds
	rtpDelta := packet.Timestamp - w.videoFirstRTP
	pts := uint64(rtpDelta) * 1000 / uint64(w.videoClockRate)
	dts := pts // For simplicity, assume DTS = PTS

	// Depacketize H.264 RTP packet to get NAL unit payload
	payload, err := w.h264Depacketizer.Unmarshal(packet.Payload)
	if err != nil {
		// Skip packets that can't be depacketized (e.g., fragmented packets being assembled)
		return nil
	}

	// Only write if we have valid payload
	if len(payload) > 0 {
		err := w.muxer.Write(w.videoTrackID, payload, pts, dts)
		if err != nil {
			return fmt.Errorf("failed to write video packet: %w", err)
		}
	}

	return nil
}

// WriteAudioRTP writes an audio RTP packet to MP4
func (w *MP4Writer) WriteAudioRTP(packet *rtp.Packet) error {
	// Initialize first timestamp
	if !w.audioFirstSet {
		w.audioFirstRTP = packet.Timestamp
		w.audioStartTime = time.Now()
		w.audioFirstSet = true
	}

	// Calculate PTS in milliseconds
	rtpDelta := packet.Timestamp - w.audioFirstRTP
	pts := uint64(rtpDelta) * 1000 / uint64(w.audioClockRate)
	dts := pts

	// Depacketize Opus RTP packet to get audio frame
	payload, err := w.opusDepacketizer.Unmarshal(packet.Payload)
	if err != nil {
		// Skip packets that can't be depacketized
		return nil
	}

	// Only write if we have valid payload
	if len(payload) > 0 {
		err := w.muxer.Write(w.audioTrackID, payload, pts, dts)
		if err != nil {
			return fmt.Errorf("failed to write audio packet: %w", err)
		}
	}

	return nil
}

// GetSyncOffset returns the sync offset between audio and video in seconds
func (w *MP4Writer) GetSyncOffset() float64 {
	if !w.videoFirstSet || !w.audioFirstSet {
		return 0
	}
	return w.audioStartTime.Sub(w.videoStartTime).Seconds()
}

// Close finalizes the MP4 file
func (w *MP4Writer) Close() error {
	if err := w.muxer.WriteTrailer(); err != nil {
		return fmt.Errorf("failed to write trailer: %w", err)
	}
	return w.file.Close()
}
