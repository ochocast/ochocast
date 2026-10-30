package main

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/pion/rtp"
)

// newTestWriter returns a writer with an H.264 track; withVideo writes an
// SPS, a PPS and IDR frames spanning 4 s (plus one reordered packet).
func newTestWriter(t *testing.T, withVideo bool) *MP4Writer {
	t.Helper()
	w, err := NewMP4Writer(filepath.Join(t.TempDir(), "recording-test.mp4"))
	if err != nil {
		t.Fatal(err)
	}
	w.AddVideoTrack("video/H264", 90000, 1280, 720)
	if !withVideo {
		return w
	}
	sps := []byte{0x67, 0x42, 0xc0, 0x1f, 0xda, 0x01, 0x40, 0x16, 0xec, 0x04, 0x40, 0x00, 0x00, 0x03, 0x00, 0x40, 0x00, 0x00, 0x0f, 0x23, 0xc6, 0x0c, 0x92}
	pps := []byte{0x68, 0xce, 0x3c, 0x80}
	idr := []byte{0x65, 0x88, 0x84, 0x00, 0x33, 0xff}
	packets := []struct {
		ts      uint32
		payload []byte
	}{
		{1000, sps}, {1000, pps}, {1000, idr},
		{1000 + 2*90000, idr}, {1000 + 4*90000, idr},
		{500, idr}, // older than the first packet: must not count as 13 h
	}
	for _, p := range packets {
		if err := w.WriteVideoRTP(&rtp.Packet{Header: rtp.Header{Timestamp: p.ts}, Payload: p.payload}); err != nil {
			t.Fatal(err)
		}
	}
	return w
}

func TestSegmentMeta(t *testing.T) {
	cases := []struct {
		name            string
		withVideo       bool
		failed          bool
		closeErr        error
		wantProblematic bool
	}{
		{"complete recording", true, false, nil, false},
		{"cut by a WebRTC failure", true, true, nil, true},
		{"file not finalized", true, false, errors.New("trailer"), true},
		{"no video written", false, false, nil, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := newTestWriter(t, c.withVideo)
			if err := w.Close(); err != nil {
				t.Fatal(err)
			}
			meta := (&RecordingSession{mp4Writer: w}).segmentMeta(c.failed, c.closeErr)
			if meta.Problematic != c.wantProblematic {
				t.Fatalf("problematic = %t, want %t", meta.Problematic, c.wantProblematic)
			}
			if wantDuration := map[bool]float64{true: 4, false: 0}[c.withVideo]; meta.Duration != wantDuration {
				t.Fatalf("duration = %v, want %v", meta.Duration, wantDuration)
			}
		})
	}
}

// blockingBackend accepts uploads only once release is closed.
func blockingBackend(t *testing.T) (srv *httptest.Server, arrived chan struct{}, release chan struct{}) {
	t.Helper()
	arrived = make(chan struct{}, 1)
	release = make(chan struct{})
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.Copy(io.Discard, r.Body)
		arrived <- struct{}{}
		<-release
		w.WriteHeader(http.StatusCreated)
	}))
	t.Cleanup(srv.Close)
	return srv, arrived, release
}

func TestShutdownWaitsForInFlightPublish(t *testing.T) {
	srv, arrived, release := blockingBackend(t)
	path := writeRecording(t, t.TempDir(), 1024)
	s := NewRecordingServer("")
	s.sharedSecret = "secret"

	publishAsync(&s.uploads, srv.URL, "track-1", path, "s", segmentMeta{Duration: 1})
	<-arrived

	// The control plane reads the upload in the status and keeps the worker.
	w := httptest.NewRecorder()
	s.handleStatus(w, signedRequest(t, "secret", http.MethodGet, "/recording/status", "", time.Now()))
	var status MultiStatusResponse
	if err := json.Unmarshal(w.Body.Bytes(), &status); err != nil || status.PendingUploads != 1 {
		t.Fatalf("status = %s (%v), want pending_uploads 1", w.Body.String(), err)
	}

	done := make(chan bool, 1)
	go func() { done <- s.shutdown(5 * time.Second) }()
	select {
	case <-done:
		t.Fatal("shutdown returned while an upload was in flight")
	case <-time.After(100 * time.Millisecond):
	}

	close(release)
	select {
	case ok := <-done:
		if !ok {
			t.Fatal("shutdown reported an interrupted upload")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("shutdown did not return once the upload finished")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("the uploaded file must be deleted before the process exits")
	}
}

func TestShutdownGivesUpAfterGrace(t *testing.T) {
	srv, arrived, release := blockingBackend(t)
	defer close(release) // after the test, before srv.Close
	path := writeRecording(t, t.TempDir(), 1024)
	s := NewRecordingServer("")

	publishAsync(&s.uploads, srv.URL, "track-1", path, "s", segmentMeta{})
	<-arrived

	start := time.Now()
	if s.shutdown(50 * time.Millisecond) {
		t.Fatal("shutdown must report the upload it interrupts")
	}
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Fatalf("shutdown waited %s, beyond its grace", elapsed)
	}
}

func TestStartRefusedDuringShutdown(t *testing.T) {
	s := NewRecordingServer("")
	s.sharedSecret = "secret"
	s.sfuURL = "http://127.0.0.1:1"
	s.shuttingDown = true
	w := httptest.NewRecorder()
	s.handleStart(w, signedRequest(t, "secret", http.MethodPost, "/recording/start", `{"room_id":"r1","track_id":"t1"}`, time.Now()))
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("start during shutdown = %d, want 503", w.Code)
	}
}

func TestShutdownGrace(t *testing.T) {
	t.Setenv("RECORDER_SHUTDOWN_GRACE_SECONDS", "")
	if got := shutdownGrace(); got != 10*time.Minute {
		t.Fatalf("default grace = %s", got)
	}
	t.Setenv("RECORDER_SHUTDOWN_GRACE_SECONDS", "30")
	if got := shutdownGrace(); got != 30*time.Second {
		t.Fatalf("grace = %s", got)
	}
}
