package main

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
)

// sfuClient calls the SFU (control plane and workers). With SFU_CONTROL_TOKEN set, the
// workers only answer requests carrying it (sfuServer/pkg/controlauth); it is sent here only,
// never to Keycloak or the backend.
var sfuClient = &http.Client{Transport: sfuTokenTransport{base: http.DefaultTransport}}

const controlTokenHeader = "X-SFU-Control-Token"

type sfuTokenTransport struct{ base http.RoundTripper }

func (t sfuTokenTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	if token := os.Getenv("SFU_CONTROL_TOKEN"); token != "" {
		r = r.Clone(r.Context())
		r.Header.Set(controlTokenHeader, token)
	}
	return t.base.RoundTrip(r)
}

// controlTokenValid reports whether r carries SFU_CONTROL_TOKEN. Only the backend drives the
// recorder: with a token configured, /recording/* refuses everyone else.
func controlTokenValid(r *http.Request) bool {
	token := os.Getenv("SFU_CONTROL_TOKEN")
	if token == "" {
		return true
	}
	return subtle.ConstantTimeCompare([]byte(r.Header.Get(controlTokenHeader)), []byte(token)) == 1
}

// discoverIngestion asks the control plane (CONTROL_PLANE_URL) which worker carries roomID's
// live, and its key. The recorder never connects to an address given by its caller: the
// control plane only knows workers that registered with the control token.
func discoverIngestion(roomID string) (sfuURL, roomKey string, err error) {
	cp := strings.TrimSuffix(os.Getenv("CONTROL_PLANE_URL"), "/")
	if cp == "" {
		return "", "", fmt.Errorf("CONTROL_PLANE_URL is not set")
	}
	resp, err := sfuClient.Get(cp + "/recorder?room_id=" + url.QueryEscape(roomID))
	if err != nil {
		return "", "", fmt.Errorf("control plane unreachable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("control plane answered %d for room %s", resp.StatusCode, roomID)
	}
	var found struct {
		SfuURL  string `json:"sfu_url"`
		RoomKey string `json:"room_key"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&found); err != nil {
		return "", "", fmt.Errorf("control plane answer: %w", err)
	}
	u, err := url.Parse(found.SfuURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return "", "", fmt.Errorf("control plane gave an invalid worker URL %q", found.SfuURL)
	}
	return u.Scheme + "://" + u.Host, found.RoomKey, nil
}
