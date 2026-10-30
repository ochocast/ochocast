package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"
)

// The recorder runs on the on-demand SFU worker and is reached over plain
// HTTP, so the shared secret never travels: each backend request carries a
// timestamp and an HMAC-SHA256 of
//
//	timestamp \n method \n path?query \n sha256(body)
//
// keyed with RECORDING_SHARED_SECRET. Requests older than signatureMaxSkew
// are rejected, which bounds replays.
const (
	signatureTimestampHeader = "X-Recording-Timestamp"
	signatureHeader          = "X-Recording-Signature"
	signatureMaxSkew         = 5 * time.Minute
	maxSignedBodyBytes       = 64 * 1024
)

// signRequest returns the hex signature of a request (shared with the
// backend's implementation, see recording-vm.gateway.ts).
func signRequest(secret, timestamp, method, pathAndQuery string, body []byte) string {
	bodyHash := sha256.Sum256(body)
	mac := hmac.New(sha256.New, []byte(secret))
	io.WriteString(mac, timestamp+"\n"+method+"\n"+pathAndQuery+"\n"+hex.EncodeToString(bodyHash[:]))
	return hex.EncodeToString(mac.Sum(nil))
}

// requireSignature checks the request signature. The body is read, verified
// and put back for the handler. Returns false after writing 401 otherwise.
func requireSignature(s *RecordingServer, w http.ResponseWriter, r *http.Request) bool {
	if s.sharedSecret == "" {
		log.Printf("[SECURITY] RECORDING_SHARED_SECRET is not set — rejecting all requests")
		http.Error(w, "Recording endpoint not configured", http.StatusUnauthorized)
		return false
	}

	timestamp := r.Header.Get(signatureTimestampHeader)
	seconds, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return false
	}
	if skew := time.Since(time.Unix(seconds, 0)); skew > signatureMaxSkew || skew < -signatureMaxSkew {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return false
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, maxSignedBodyBytes+1))
	if err != nil || len(body) > maxSignedBodyBytes {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return false
	}
	r.Body = io.NopCloser(bytes.NewReader(body))

	expected := signRequest(s.sharedSecret, timestamp, r.Method, r.URL.RequestURI(), body)
	if !hmac.Equal([]byte(expected), []byte(r.Header.Get(signatureHeader))) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return false
	}
	return true
}
