package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

// serveWithDrain runs srv until SIGTERM or SIGINT, then drains: it tells the control plane
// (which stops placing new lives and viewers here), waits for the lives on this worker to
// end, and stops. DRAIN_TIMEOUT (a Go duration, e.g. "2h") caps the wait; empty or 0 means
// no cap of its own, so the orchestrator's grace period (Kubernetes
// terminationGracePeriodSeconds) decides. A second signal stops at once.
func serveWithDrain(srv *http.Server, listen func() error) {
	errCh := make(chan error, 1)
	go func() { errCh <- listen() }()

	sig := make(chan os.Signal, 2)
	signal.Notify(sig, syscall.SIGTERM, syscall.SIGINT)
	select {
	case err := <-errCh:
		log.Fatal(err)
	case s := <-sig:
		log.Printf("[DRAIN] %s received: no new lives, waiting for the current ones to end", s)
	}

	var deadline time.Time
	if d, err := time.ParseDuration(os.Getenv("DRAIN_TIMEOUT")); err == nil && d > 0 {
		deadline = time.Now().Add(d)
	}
	if sfuServer.metricsCollector != nil {
		notified := sfuServer.metricsCollector.SetDraining()
		// Wait briefly for the control plane to learn about draining, including
		// for an idle worker, without delaying a deadline or a second signal.
		wait := 3 * time.Second
		if !deadline.IsZero() && time.Until(deadline) < wait {
			wait = time.Until(deadline)
		}
		select {
		case <-notified:
		case <-time.After(wait):
			log.Println("[DRAIN] control plane notification timed out")
		case s := <-sig:
			log.Printf("[DRAIN] second %s: stopping now", s)
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_ = srv.Shutdown(ctx)
			return
		}
	}

wait:
	for {
		hosts, viewers := sfuServer.GetRoomStats()
		if hosts == 0 {
			log.Println("[DRAIN] no live left")
			break
		}
		if !deadline.IsZero() && time.Now().After(deadline) {
			log.Printf("[DRAIN] DRAIN_TIMEOUT reached with %d live(s) still running", hosts)
			break
		}
		log.Printf("[DRAIN] waiting for %d live(s) (%d viewer(s)) to end", hosts, viewers)
		wait := 10 * time.Second
		if !deadline.IsZero() && time.Until(deadline) < wait {
			wait = time.Until(deadline)
		}
		select {
		case <-time.After(wait):
		case s := <-sig:
			log.Printf("[DRAIN] second %s: stopping now", s)
			break wait
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	log.Println("[DRAIN] stopped")
}
