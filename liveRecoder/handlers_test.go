package main

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"sync/atomic"
	"testing"
	"time"
)

func writeRecording(t *testing.T, dir string, size int) string {
	t.Helper()
	path := filepath.Join(dir, "recording-room-1.mp4")
	if err := os.WriteFile(path, bytes.Repeat([]byte{0x42}, size), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func noRetryDelay(t *testing.T) {
	t.Helper()
	saved := publishRetryDelays
	publishRetryDelays = []time.Duration{0, 0, 0}
	t.Cleanup(func() { publishRetryDelays = saved })
}

func TestPublishStreamsFileAndFields(t *testing.T) {
	path := writeRecording(t, t.TempDir(), 1<<20)
	var gotTrack, gotSecret string
	var gotSize int64
	fields := map[string]string{}
	var order []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotSecret = r.Header.Get("X-Recording-Secret")
		reader, err := r.MultipartReader()
		if err != nil {
			t.Errorf("multipart: %v", err)
			return
		}
		for {
			part, err := reader.NextPart()
			if err == io.EOF {
				break
			}
			if err != nil {
				t.Errorf("part: %v", err)
				return
			}
			order = append(order, part.FormName())
			switch part.FormName() {
			case "file":
				gotSize, _ = io.Copy(io.Discard, part)
			default:
				b, _ := io.ReadAll(part)
				fields[part.FormName()] = string(b)
			}
		}
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	if err := publishToBackend(srv.URL, "track-1", path, "s3cret", segmentMeta{Duration: 3725.5, Problematic: true}); err != nil {
		t.Fatal(err)
	}
	gotTrack = fields["trackId"]
	if gotTrack != "track-1" || gotSecret != "s3cret" || gotSize != 1<<20 {
		t.Fatalf("got track=%q secret=%q size=%d", gotTrack, gotSecret, gotSize)
	}
	// The backend reads duration as a number of seconds and problematic as
	// 'true' / '1'; both come before the file part.
	if fields["duration"] != "3725.500" || fields["problematic"] != "true" {
		t.Fatalf("got duration=%q problematic=%q", fields["duration"], fields["problematic"])
	}
	if len(order) == 0 || order[len(order)-1] != "file" {
		t.Fatalf("fields must precede the file part, got %v", order)
	}
}

// The upload must not hold the file in memory: a 64 MiB recording used to
// need about three times its size in RAM.
func TestPublishMemoryStaysConstant(t *testing.T) {
	const size = 64 << 20
	path := writeRecording(t, t.TempDir(), size)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.Copy(io.Discard, r.Body)
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	runtime.GC()
	var before, after runtime.MemStats
	runtime.ReadMemStats(&before)
	if err := publishToBackend(srv.URL, "track-1", path, "s", segmentMeta{}); err != nil {
		t.Fatal(err)
	}
	runtime.ReadMemStats(&after)
	if allocated := after.TotalAlloc - before.TotalAlloc; allocated > size/4 {
		t.Fatalf("upload allocated %d MiB for a %d MiB file", allocated>>20, size>>20)
	}
}

func TestPublishWithRetryRetriesServerErrorsThenDeletesFile(t *testing.T) {
	noRetryDelay(t)
	path := writeRecording(t, t.TempDir(), 1024)
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.Copy(io.Discard, r.Body)
		if atomic.AddInt32(&calls, 1) < 3 {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	if err := publishWithRetry(srv.URL, "track-1", path, "s", segmentMeta{}); err != nil {
		t.Fatal(err)
	}
	if calls != 3 {
		t.Fatalf("expected 3 attempts, got %d", calls)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("file must be deleted once the backend accepted it")
	}
}

func TestPublishWithRetryStopsOnClientErrorAndKeepsFile(t *testing.T) {
	noRetryDelay(t)
	path := writeRecording(t, t.TempDir(), 1024)
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.Copy(io.Discard, r.Body)
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	if err := publishWithRetry(srv.URL, "track-1", path, "s", segmentMeta{}); err == nil {
		t.Fatal("expected an error")
	}
	if calls != 1 {
		t.Fatalf("a 4xx must not be retried, got %d attempts", calls)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatal("file must be kept for the stale-recording cleanup")
	}
}

func TestPublishWithRetryGivesUpAfterLastDelay(t *testing.T) {
	noRetryDelay(t)
	path := writeRecording(t, t.TempDir(), 1024)
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.Copy(io.Discard, r.Body)
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	if err := publishWithRetry(srv.URL, "track-1", path, "s", segmentMeta{}); err == nil {
		t.Fatal("expected an error")
	}
	if want := int32(len(publishRetryDelays) + 1); calls != want {
		t.Fatalf("expected %d attempts, got %d", want, calls)
	}
}

func TestCleanupStaleRecordingsDeletesOnlyOldRecordings(t *testing.T) {
	dir := t.TempDir()
	old := filepath.Join(dir, "recording-old-1.mp4")
	fresh := filepath.Join(dir, "recording-fresh-2.mp4")
	other := filepath.Join(dir, "other-old.mp4")
	for _, p := range []string{old, fresh, other} {
		if err := os.WriteFile(p, []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	past := time.Now().Add(-48 * time.Hour)
	for _, p := range []string{old, other} {
		if err := os.Chtimes(p, past, past); err != nil {
			t.Fatal(err)
		}
	}

	cleanupStaleRecordings(dir, 24*time.Hour)

	if _, err := os.Stat(old); !os.IsNotExist(err) {
		t.Error("old recording must be deleted")
	}
	if _, err := os.Stat(fresh); err != nil {
		t.Error("recent recording must be kept")
	}
	if _, err := os.Stat(other); err != nil {
		t.Error("files that are not recordings must be left alone")
	}
}

func TestRecordingRetention(t *testing.T) {
	t.Setenv("RECORDING_RETENTION_HOURS", "")
	if got := recordingRetention(); got != 24*time.Hour {
		t.Fatalf("default retention = %s", got)
	}
	t.Setenv("RECORDING_RETENTION_HOURS", "6")
	if got := recordingRetention(); got != 6*time.Hour {
		t.Fatalf("retention = %s", got)
	}
}

// A stop for a room that is not recording (already stopped by a WebRTC
// failure or an earlier stop) is a conflict, which the backend treats as
// already stopped.
func TestStopWithoutRecordingAnswersConflict(t *testing.T) {
	s := NewRecordingServer("")
	s.sharedSecret = "secret"
	w := httptest.NewRecorder()
	s.handleStop(w, signedRequest(t, "secret", http.MethodPost, "/recording/stop", `{"room_id":"r1"}`, time.Now()))
	if w.Code != http.StatusConflict {
		t.Fatalf("stop without recording = %d, want 409", w.Code)
	}
}
