package controlauth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func ok(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }

func TestRequire(t *testing.T) {
	t.Setenv("SFU_CONTROL_TOKEN", "s3cret")
	h := Require(ok)

	cases := []struct {
		name, method, token string
		want                int
	}{
		{"no token", http.MethodPost, "", http.StatusUnauthorized},
		{"wrong token", http.MethodPost, "nope", http.StatusUnauthorized},
		{"right token", http.MethodPost, "s3cret", http.StatusOK},
		{"CORS preflight", http.MethodOptions, "", http.StatusOK},
	}
	for _, c := range cases {
		r := httptest.NewRequest(c.method, "/control/register_sfu", nil)
		if c.token != "" {
			r.Header.Set(Header, c.token)
		}
		w := httptest.NewRecorder()
		h(w, r)
		if w.Code != c.want {
			t.Errorf("%s: got %d, want %d", c.name, w.Code, c.want)
		}
	}
}

func TestOpenWithoutToken(t *testing.T) {
	t.Setenv("SFU_CONTROL_TOKEN", "")
	w := httptest.NewRecorder()
	Require(ok)(w, httptest.NewRequest(http.MethodPost, "/room/create", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("protection off: got %d, want 200", w.Code)
	}
}

func TestRequireExcept(t *testing.T) {
	t.Setenv("SFU_CONTROL_TOKEN", "s3cret")
	h := RequireExcept(http.HandlerFunc(ok), "/health")

	for path, want := range map[string]int{"/health": 200, "/room/get": 401, "/": 401} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		if w.Code != want {
			t.Errorf("%s: got %d, want %d", path, w.Code, want)
		}
	}
}

func TestWrapAddsToken(t *testing.T) {
	t.Setenv("SFU_CONTROL_TOKEN", "s3cret")
	var got string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Get(Header)
	}))
	defer srv.Close()

	client := &http.Client{Transport: Wrap(nil)}
	resp, err := client.Get(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if got != "s3cret" {
		t.Fatalf("token not sent: %q", got)
	}
}
