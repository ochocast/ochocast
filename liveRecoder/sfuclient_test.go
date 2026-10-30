package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestControlTokenValid(t *testing.T) {
	t.Setenv("SFU_CONTROL_TOKEN", "s3cret")
	r := httptest.NewRequest(http.MethodPost, "/recording/start", nil)
	if controlTokenValid(r) {
		t.Fatal("request without the token accepted")
	}
	r.Header.Set(controlTokenHeader, "s3cret")
	if !controlTokenValid(r) {
		t.Fatal("request with the token refused")
	}
}

func TestDiscoverIngestionAsksTheControlPlane(t *testing.T) {
	t.Setenv("SFU_CONTROL_TOKEN", "s3cret")
	cp := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get(controlTokenHeader) != "s3cret" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if r.URL.Path != "/recorder" || r.URL.Query().Get("room_id") != "room 1" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Write([]byte(`{"sfu_url":"http://10.0.0.5:8190/ignored/path","room_key":"k"}`))
	}))
	defer cp.Close()
	t.Setenv("CONTROL_PLANE_URL", cp.URL)

	url, key, err := discoverIngestion("room 1")
	if err != nil {
		t.Fatal(err)
	}
	if url != "http://10.0.0.5:8190" || key != "k" {
		t.Fatalf("got %q %q", url, key)
	}
}

func TestDiscoverIngestionRefusesBadAnswers(t *testing.T) {
	cp := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"sfu_url":"file:///etc/passwd","room_key":"k"}`))
	}))
	defer cp.Close()
	t.Setenv("CONTROL_PLANE_URL", cp.URL)
	if _, _, err := discoverIngestion("r"); err == nil {
		t.Fatal("non-HTTP worker URL accepted")
	}
	t.Setenv("CONTROL_PLANE_URL", "")
	if _, _, err := discoverIngestion("r"); err == nil {
		t.Fatal("missing CONTROL_PLANE_URL accepted")
	}
}
