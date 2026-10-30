// Package controlauth protects the internal SFU API with a shared token.
//
// SFU_CONTROL_TOKEN is shared by the control plane, the workers, the backend and the
// live recorder. When it is set:
//   - the control plane requires it on worker registration, heartbeats, topology,
//     room creation, recorder discovery and metrics, and only reveals room keys
//     (whip_url) to callers that present it;
//   - workers require it on every endpoint except /health: only the control plane,
//     other workers and the recorder call them;
//   - every call between these components carries it in the Header below.
//
// When it is empty nothing is checked, which keeps local development setups working.
package controlauth

import (
	"crypto/subtle"
	"net/http"
	"os"
	"strings"
)

// Header carries the token. Not "Authorization": WHIP clients may use that one.
const Header = "X-SFU-Control-Token"

// Token returns the shared token, empty when protection is off.
func Token() string {
	return os.Getenv("SFU_CONTROL_TOKEN")
}

// Enabled reports whether a token is configured.
func Enabled() bool {
	return Token() != ""
}

// Valid reports whether r carries the token. Always true when protection is off.
func Valid(r *http.Request) bool {
	token := Token()
	if token == "" {
		return true
	}
	given := r.Header.Get(Header)
	if given == "" {
		// Prometheus and other scrapers can only send "Authorization: Bearer".
		given = strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	}
	return subtle.ConstantTimeCompare([]byte(given), []byte(token)) == 1
}

// Require answers 401 to requests without the token.
func Require(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodOptions && !Valid(r) {
			http.Error(w, "missing or invalid control token", http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

// RequireExcept wraps a whole mux: every path but the exempt ones needs the token.
func RequireExcept(next http.Handler, exempt ...string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for _, p := range exempt {
			if r.URL.Path == p {
				next.ServeHTTP(w, r)
				return
			}
		}
		if r.Method != http.MethodOptions && !Valid(r) {
			http.Error(w, "missing or invalid control token", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

type transport struct{ base http.RoundTripper }

func (t transport) RoundTrip(r *http.Request) (*http.Response, error) {
	token := Token()
	if token == "" {
		return t.base.RoundTrip(r)
	}
	r = r.Clone(r.Context())
	r.Header.Set(Header, token)
	return t.base.RoundTrip(r)
}

// Wrap returns a RoundTripper adding the token to every request. Use it only for
// clients that talk to the control plane or the workers, never to third parties.
func Wrap(base http.RoundTripper) http.RoundTripper {
	if base == nil {
		base = http.DefaultTransport
	}
	return transport{base: base}
}
