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

func TestServerMuxDeletesAuthenticatedWHIPResource(t *testing.T) {
	t.Setenv("CONTROL_PLANE_URL", "")
	sfuServer = NewSFUServer()
	if err := sfuServer.CreateRoomWithKey("room-obs", "room-key"); err != nil {
		t.Fatal(err)
	}

	invalid := httptest.NewRequest(http.MethodDelete, "/whip/resource/room-obs/wrong-key", nil)
	invalidRecorder := httptest.NewRecorder()
	newServerMux().ServeHTTP(invalidRecorder, invalid)
	if invalidRecorder.Code != http.StatusUnauthorized {
		t.Fatalf("DELETE with invalid key = %d, want %d", invalidRecorder.Code, http.StatusUnauthorized)
	}

	request := httptest.NewRequest(http.MethodDelete, "/whip/resource/room-obs/room-key", nil)
	recorder := httptest.NewRecorder()
	newServerMux().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("DELETE WHIP resource = %d (%s), want %d", recorder.Code, recorder.Body.String(), http.StatusOK)
	}

	room, err := sfuServer.GetRoom("room-obs")
	if err != nil {
		t.Fatal(err)
	}
	if !room.CancelScheduledCleanup() {
		t.Fatal("WHIP resource deletion did not schedule host cleanup")
	}
}
