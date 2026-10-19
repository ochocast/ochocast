package main

import (
	"net/http"
	"os"
)

// sfuClient calls the SFU (control plane and workers). With SFU_CONTROL_TOKEN set, the
// workers only answer requests carrying it (sfuServer/pkg/controlauth); it is sent here only,
// never to Keycloak or the backend.
var sfuClient = &http.Client{Transport: sfuTokenTransport{base: http.DefaultTransport}}

type sfuTokenTransport struct{ base http.RoundTripper }

func (t sfuTokenTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	if token := os.Getenv("SFU_CONTROL_TOKEN"); token != "" {
		r = r.Clone(r.Context())
		r.Header.Set("X-SFU-Control-Token", token)
	}
	return t.base.RoundTrip(r)
}
