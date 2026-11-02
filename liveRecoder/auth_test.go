package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"
)

func signedRequest(t *testing.T, secret, method, target, body string, at time.Time) *http.Request {
	t.Helper()
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	ts := strconv.FormatInt(at.Unix(), 10)
	req.Header.Set(signatureTimestampHeader, ts)
	req.Header.Set(signatureHeader, signRequest(secret, ts, method, req.URL.RequestURI(), []byte(body)))
	return req
}

func TestRequireSignatureAcceptsValidRequestAndKeepsBody(t *testing.T) {
	s := &RecordingServer{sharedSecret: "secret"}
	req := signedRequest(t, "secret", http.MethodPost, "/recording/start", `{"room_id":"r1"}`, time.Now())
	w := httptest.NewRecorder()

	if !requireSignature(s, w, req) {
		t.Fatalf("valid request rejected: %d", w.Code)
	}
	body, _ := io.ReadAll(req.Body)
	if string(body) != `{"room_id":"r1"}` {
		t.Fatalf("handler must still read the body, got %q", body)
	}
}

func TestRequireSignatureRejects(t *testing.T) {
	now := time.Now()
	cases := map[string]func() *http.Request{
		"wrong secret": func() *http.Request {
			return signedRequest(t, "other", http.MethodPost, "/recording/start", `{}`, now)
		},
		"tampered body": func() *http.Request {
			req := signedRequest(t, "secret", http.MethodPost, "/recording/start", `{"room_id":"a"}`, now)
			req.Body = io.NopCloser(strings.NewReader(`{"room_id":"b"}`))
			return req
		},
		"other path": func() *http.Request {
			req := signedRequest(t, "secret", http.MethodPost, "/recording/start", `{}`, now)
			req.URL.Path = "/recording/stop"
			return req
		},
		"expired": func() *http.Request {
			return signedRequest(t, "secret", http.MethodPost, "/recording/start", `{}`, now.Add(-10*time.Minute))
		},
		"from the future": func() *http.Request {
			return signedRequest(t, "secret", http.MethodPost, "/recording/start", `{}`, now.Add(10*time.Minute))
		},
		"unsigned (old shared-secret header)": func() *http.Request {
			req := httptest.NewRequest(http.MethodPost, "/recording/start", strings.NewReader(`{}`))
			req.Header.Set("X-Recording-Secret", "secret")
			return req
		},
	}
	for name, build := range cases {
		t.Run(name, func(t *testing.T) {
			w := httptest.NewRecorder()
			if requireSignature(&RecordingServer{sharedSecret: "secret"}, w, build()) {
				t.Fatal("request must be rejected")
			}
			if w.Code != http.StatusUnauthorized {
				t.Fatalf("expected 401, got %d", w.Code)
			}
		})
	}
}

func TestRequireSignatureRejectsEverythingWithoutSecret(t *testing.T) {
	req := signedRequest(t, "", http.MethodGet, "/recording/status", "", time.Now())
	w := httptest.NewRecorder()
	if requireSignature(&RecordingServer{}, w, req) {
		t.Fatal("a recorder without RECORDING_SHARED_SECRET must reject all requests")
	}
}

// Known vector, shared with the backend test (recording-vm.gateway.spec.ts).
func TestSignRequestVector(t *testing.T) {
	got := signRequest("secret", "1700000000", "POST", "/recording/start", []byte(`{"room_id":"r1"}`))
	if got != "2883f07f678b24eeb1b5d6ce478df81f2f3f9f57af031717348e1dd6bb2b5b24" {
		t.Fatalf("signature changed: %s", got)
	}
}

// The SFU comes from the configuration only: a sfu_url in the request is
// ignored, and without RECORDER_SFU_URL the recorder refuses to record.
func TestStartIgnoresRequestSfuURL(t *testing.T) {
	s := NewRecordingServer("")
	s.sharedSecret = "secret"
	s.sfuURL = ""
	w := httptest.NewRecorder()
	body := `{"room_id":"r1","sfu_url":"http://attacker.example"}`
	s.handleStart(w, signedRequest(t, "secret", http.MethodPost, "/recording/start", body, time.Now()))
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("without RECORDER_SFU_URL the recorder must refuse, got %d", w.Code)
	}
}
