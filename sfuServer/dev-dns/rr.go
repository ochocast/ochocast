package main

import (
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"sync/atomic"
)

var backends = []string{
	"http://localhost:8090",
	"http://localhost:8091",
	"http://localhost:8092",
}

var counter uint64

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Round robin index
		idx := atomic.AddUint64(&counter, 1)
		target := backends[idx%uint64(len(backends))]

		u, _ := url.Parse(target)
		proxy := httputil.NewSingleHostReverseProxy(u)

		log.Println("→", target)
		proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
			w.WriteHeader(502)
			io.WriteString(w, "Bad gateway: "+err.Error())
		}
		proxy.ServeHTTP(w, r)
	})

	log.Println("LB listening on :8079")
	log.Fatal(http.ListenAndServe(":8079", nil))
}
