package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestServerMuxRegistersSyncCreateRoom(t *testing.T) {
	t.Setenv("CONTROL_PLANE_URL", "")
	sfuServer = NewSFUServer()

	req := httptest.NewRequest(
		http.MethodPost,
		"/room/sync-create",
		strings.NewReader(`{"room_id":"room-cold-start","key":"room-key"}`),
	)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	newServerMux().ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("POST /room/sync-create = %d (%s), want %d", rec.Code, rec.Body.String(), http.StatusCreated)
	}
	room, err := sfuServer.GetRoom("room-cold-start")
	if err != nil {
		t.Fatalf("synchronized room not created: %v", err)
	}
	if room.Key != "room-key" {
		t.Fatalf("synchronized room key = %q, want %q", room.Key, "room-key")
	}
}
