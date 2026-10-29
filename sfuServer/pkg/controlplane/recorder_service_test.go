package controlplane

import "testing"

func TestRecorderServiceURL(t *testing.T) {
	cases := []struct{ sfuURL, port, want string }{
		{"http://51.15.1.2:8090", "8083", "http://51.15.1.2:8083"},
		{"http://localhost:8091", "8083", "http://localhost:8083"},
		{"http://[2001:db8::1]:8090", "8083", "http://[2001:db8::1]:8083"},
		{"http://51.15.1.2:8090", "", ""},
		{"not a url", "8083", ""},
	}
	for _, c := range cases {
		if got := recorderServiceURL(c.sfuURL, c.port); got != c.want {
			t.Errorf("recorderServiceURL(%q, %q) = %q, want %q", c.sfuURL, c.port, got, c.want)
		}
	}
}
