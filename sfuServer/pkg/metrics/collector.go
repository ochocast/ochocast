package metrics

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"

	"whip-server/internal/models"
)

// cpuStats tracks last read for delta calculation (real CPU from /proc/stat)
type cpuStats struct {
	user   uint64
	system uint64
	idle   uint64
	time   time.Time
}

// Collector collects and sends metrics to the control plane
type Collector struct {
	sfuID            string
	serverURL        string
	controlPlaneURL  string
	interval         time.Duration
	stopCh           chan struct{}
	getRoomStats     func() (activeHosts, activeViewers int) // Callback to get room stats
	getDetailedStats func() map[string]models.RoomStats      // Callback to get per-room stats
	// ⚡ OPTIMIZATION: Cache fields to reduce runtime.ReadMemStats() calls
	lastMemStats    runtime.MemStats
	lastMemUsage    float64
	lastGCCount     int
	collectionCount int64
	// ⚡ CPU MEASUREMENT: Track /proc/stat for real CPU usage (not goroutine-based)
	lastCPU cpuStats
}

// NewCollector creates a new metrics collector
func NewCollector(sfuID, serverURL, controlPlaneURL string, interval time.Duration) *Collector {
	return &Collector{
		sfuID:           sfuID,
		serverURL:       serverURL,
		controlPlaneURL: controlPlaneURL,
		interval:        interval,
		stopCh:          make(chan struct{}),
	}
}

// SetRoomStatsCallback sets the callback function to get room statistics
func (c *Collector) SetRoomStatsCallback(fn func() (activeHosts, activeViewers int)) {
	c.getRoomStats = fn
}

// SetDetailedStatsCallback sets the callback function to get per-room statistics
func (c *Collector) SetDetailedStatsCallback(fn func() map[string]models.RoomStats) {
	c.getDetailedStats = fn
}

// Start begins the metrics collection and reporting loop
func (c *Collector) Start() {
	if c.controlPlaneURL == "" {
		log.Println("[METRICS] No control plane URL configured, metrics collection disabled")
		return
	}

	log.Printf("[METRICS] Starting metrics collector (interval: %v)", c.interval)
	ticker := time.NewTicker(c.interval)

	go func() {
		// Send initial metrics immediately
		c.collectAndSend()

		for {
			select {
			case <-ticker.C:
				c.collectAndSend()
			case <-c.stopCh:
				ticker.Stop()
				log.Println("[METRICS] Metrics collector stopped")
				return
			}
		}
	}()
}

// Stop stops the metrics collector
func (c *Collector) Stop() {
	close(c.stopCh)
}

// collectAndSend collects current metrics and sends them to the control plane
func (c *Collector) collectAndSend() {
	metrics := c.collectMetrics()
	if err := c.sendToControlPlane(metrics); err != nil {
		log.Printf("[METRICS] Failed to send metrics: %v", err)
	} else {
		log.Printf("[METRICS][%s] Sent: CPU=%.2f%% (Goroutines=%d), Mem=%.2f%%, Hosts=%d, Viewers=%d, GCs=%d",
			metrics.SFUID, metrics.CPU*100, runtime.NumGoroutine(), metrics.Memory*100,
			metrics.ActiveHosts, metrics.ActiveViewers, metrics.GCCount)
	}
}

// collectMetrics gathers current system and application metrics
func (c *Collector) collectMetrics() *models.SFUMetrics {
	// ⚡ OPTIMIZATION: runtime.ReadMemStats() is expensive and can block for significant time
	// Only read it every 3rd collection (15 seconds instead of every 5 seconds)
	// This reduces GC pause impact while still providing reasonable metrics
	var m runtime.MemStats
	var memUsage, cpuUsage float64
	var gcCount int

	// Only call ReadMemStats every ~15 seconds (3 * 5s intervals)
	if c.collectionCount%3 == 0 {
		runtime.ReadMemStats(&m)
		memUsage = float64(m.Alloc) / float64(m.Sys)
		if memUsage > 1.0 {
			memUsage = 1.0
		}
		gcCount = int(m.NumGC)
		log.Printf("[METRICS] Expensive metrics read (GCs=%d)", gcCount)
	} else {
		// Use cached values between reads
		m = c.lastMemStats
		memUsage = c.lastMemUsage
		gcCount = c.lastGCCount
	}

	// Get CPU usage (simplified - in production use a proper CPU monitor like cgroup metrics)
	cpuUsage = c.estimateCPUUsage()

	// Get room statistics
	activeHosts := 0
	activeViewers := 0
	if c.getRoomStats != nil {
		activeHosts, activeViewers = c.getRoomStats()
	}

	// Get detailed per-room statistics
	var roomStats map[string]models.RoomStats
	if c.getDetailedStats != nil {
		roomStats = c.getDetailedStats()
	}

	// TODO: Implement RTT measurement to other SFUs
	rttMatrix := make(map[string]int)

	// Cache values for next iteration
	c.lastMemStats = m
	c.lastMemUsage = memUsage
	c.lastGCCount = gcCount
	c.collectionCount++

	return &models.SFUMetrics{
		SFUID:         c.sfuID,
		ServerURL:     c.serverURL,
		CPU:           cpuUsage,
		Memory:        memUsage,
		ActiveHosts:   activeHosts,
		ActiveViewers: activeViewers,
		Bandwidth:     0.0, // TODO: Implement bandwidth measurement
		RTTMatrix:     rttMatrix,
		Timestamp:     time.Now(),
		RoomStats:     roomStats,
		GCCount:       gcCount,
	}
}

// estimateCPUUsage provides actual CPU usage from /proc/stat
// ⚡ FIXED: Now uses real CPU measurement instead of goroutine count!
// goroutines don't = CPU usage. 1266 goroutines can be 10% or 80% CPU depending on blocking
func (c *Collector) estimateCPUUsage() float64 {
	user, system, idle, err := readProcStat()
	if err != nil {
		// Fallback if /proc/stat not available
		return 0.0
	}

	now := time.Now()
	if c.lastCPU.time.IsZero() {
		// First reading, just store it
		c.lastCPU = cpuStats{user: user, system: system, idle: idle, time: now}
		return 0.0
	}

	// Calculate delta
	userDelta := user - c.lastCPU.user
	systemDelta := system - c.lastCPU.system
	idleDelta := idle - c.lastCPU.idle
	totalDelta := userDelta + systemDelta + idleDelta

	if totalDelta == 0 {
		return 0.0
	}

	// CPU usage = (user + system) / total
	cpuUsage := float64(userDelta+systemDelta) / float64(totalDelta)
	if cpuUsage > 1.0 {
		cpuUsage = 1.0
	}

	// Update last reading
	c.lastCPU = cpuStats{user: user, system: system, idle: idle, time: now}

	log.Printf("[METRICS-CPU] Real CPU: %.2f%% (delta: user=%d system=%d idle=%d)",
		cpuUsage*100, userDelta, systemDelta, idleDelta)

	return cpuUsage
}

// readProcStat reads CPU stats from /proc/stat
// Returns: user, system, idle jiffy counts
func readProcStat() (uint64, uint64, uint64, error) {
	data, err := os.ReadFile("/proc/stat")
	if err != nil {
		return 0, 0, 0, err
	}

	scanner := bufio.NewScanner(bytes.NewReader(data))
	if !scanner.Scan() {
		return 0, 0, 0, fmt.Errorf("empty /proc/stat")
	}

	// First line is "cpu user nice system idle iowait irq softirq..."
	fields := strings.Fields(scanner.Text())
	if len(fields) < 5 {
		return 0, 0, 0, fmt.Errorf("invalid /proc/stat format")
	}

	user, _ := strconv.ParseUint(fields[1], 10, 64)
	system, _ := strconv.ParseUint(fields[3], 10, 64)
	idle, _ := strconv.ParseUint(fields[4], 10, 64)

	return user, system, idle, nil
}

// sendToControlPlane sends metrics to the control plane heartbeat endpoint
func (c *Collector) sendToControlPlane(metrics *models.SFUMetrics) error {
	url := fmt.Sprintf("%s/control/heartbeat", c.controlPlaneURL)

	jsonData, err := json.Marshal(metrics)
	if err != nil {
		return fmt.Errorf("failed to marshal metrics: %w", err)
	}

	resp, err := http.Post(url, "application/json", bytes.NewReader(jsonData))
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted {
		return fmt.Errorf("control plane returned status %d", resp.StatusCode)
	}

	return nil
}

// MeasureRTT measures round-trip time to another SFU
func MeasureRTT(targetURL string) (int, error) {
	start := time.Now()

	resp, err := http.Get(fmt.Sprintf("%s/health", targetURL))
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("health check failed with status %d", resp.StatusCode)
	}

	rtt := time.Since(start).Milliseconds()
	return int(rtt), nil
}
