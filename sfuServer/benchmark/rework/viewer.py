import asyncio
import os
import time
import json
import aiohttp
import threading
from aiortc import (
    RTCPeerConnection,
    RTCSessionDescription,
    RTCConfiguration,
    RTCIceServer,
    RTCRtpSender,
)
from datetime import datetime

def sanitize_sdp(sdp: str) -> str:
    """Nettoie et complète la SDP pour compatibilité Pion."""
    lines = sdp.splitlines()
    out = []
    current_dir = None
    for ln in lines:
        if ln.startswith("m="):
            parts = ln.split()
            if len(parts) >= 4:
                parts[1] = "9"  # discard port
            ln = " ".join(parts)
            current_dir = None
        elif ln.startswith("c=IN IP4"):
            ln = "c=IN IP4 0.0.0.0"
        elif ln.startswith(("a=recvonly", "a=sendonly", "a=sendrecv", "a=inactive")):
            current_dir = ln
        if current_dir == "a=recvonly" and (
            ln.startswith("a=ssrc:")
            or ln.startswith("a=ssrc-group:")
            or ln.startswith("a=msid:")
        ):
            continue
        out.append(ln)

    sdp2 = "\r\n".join(out) + "\r\n"
    if "a=setup:actpass" not in sdp2:
        sdp2 = sdp2.replace("t=0 0", "t=0 0\r\na=setup:actpass", 1)
    if not sdp2.strip().endswith("a=end-of-candidates"):
        sdp2 += "a=end-of-candidates\r\n"
    return sdp2

class Viewer:
    def __init__(self, viewer_id: str, red_threshold: float, output: str, url: str, stun_url: str = "stun:stun.l.google.com:19302"):
        self.viewer_id = viewer_id
        self.red_threshold = red_threshold
        self.url = url
        self.stun_url = stun_url
        self.stop_event = None  # Will be created in the event loop
        self.task = None
        self.pc = None
        self.loop = None
        self.thread = None
        
        # Red detection data
        self.red_detections = []
        self.frame_count = 0
        self.start_time = None
        self.first_frame_timestamp = None  # Timestamp of the first frame received
        self._last_save_time = 0
        self._save_interval = 5.0  # Save every 5 seconds

        # End/exit info
        self.end_time = None
        self.exit_error = False
        self.exit_reason = None

        os.makedirs(output, exist_ok=True)
        if not os.path.isdir(output) or not os.access(output, os.W_OK):
            raise Exception(f"Output directory {output} is not writable")
        self.output = output

    def detect_red_frame(self, img):
        """Detect if frame is predominantly red and extract sequence number."""
        mean_color = img.mean(axis=(0, 1))  # BGR format
        b, g, r = mean_color
        
        # Amélioration 1: Seuil plus strict
        is_red = (r > self.red_threshold) and (r > b + 100) and (r > g + 100)
        
        sequence_number = 0
        if is_red:
            # Amélioration 2: Décodage amélioré du numéro de séquence
            seq_low = int(round(g))
            seq_high = int(round(b))
            sequence_number = seq_low + (seq_high << 8)
            
            # Validation du numéro de séquence
            if sequence_number <= 0 or sequence_number > 65535:
                print(f"[Viewer {self.viewer_id}] ⚠️ Invalid sequence number: {sequence_number} (g={g}, b={b})")
                is_red = False
                sequence_number = 0
        
        return is_red, (b, g, r), sequence_number
    
    def log_red_detection(self, timestamp, mean_color, sequence_number):
        """Log a red frame detection with improved duplicate prevention"""
        relative_time = timestamp - self.start_time if self.start_time else 0
        
        # Amélioration 3: Prévention des doublons avec fenêtre temporelle
        duplicate = False
        for detection in self.red_detections[-10:]:  # Vérifier les 10 dernières
            if detection['sequence_number'] == sequence_number:
                time_diff = abs(timestamp - detection['timestamp'])
                if time_diff < 0.1:  # Moins de 100ms = probable doublon
                    print(f"[Viewer {self.viewer_id}] ⚠️ Duplicate sequence {sequence_number} ignored (Δt={time_diff*1000:.1f}ms)")
                    duplicate = True
                    break
        
        if not duplicate:
            detection = {
                'frame': self.frame_count,
                'timestamp': timestamp,
                'relative_time': relative_time,
                'mean_bgr': list(mean_color),
                'viewer_id': self.viewer_id,
                'sequence_number': sequence_number
            }
            self.red_detections.append(detection)
            print(f"[Viewer {self.viewer_id}] 🔴 RED DETECTED (Seq: {sequence_number}) at {timestamp:.6f}")
    
    def save_timestamps(self):
        """Save red frame detections to JSON file"""
        timestamp_file = os.path.join(self.output, f"viewer_{self.viewer_id}_timestamps.json")
        data = {
            'session_info': {
                'viewer_id': self.viewer_id,
                'start_time': datetime.fromtimestamp(self.start_time).isoformat() if self.start_time else None,
                'first_frame_timestamp': datetime.fromtimestamp(self.first_frame_timestamp).isoformat() if self.first_frame_timestamp else None,
                'end_time': datetime.fromtimestamp(self.end_time).isoformat() if self.end_time else None,
                'exit_error': bool(self.exit_error),
                'exit_reason': str(self.exit_reason) if self.exit_reason else None,
                'red_threshold': self.red_threshold,
                'total_red_detections': len(self.red_detections)
            },
            'red_detections': self.red_detections
        }
        with open(timestamp_file, 'w') as f:
            json.dump(data, f, indent=2)
        # print(f"[Viewer {self.viewer_id}] 💾 Saved {len(self.red_detections)} red detections to {timestamp_file}")

    def start(self):
        """Start the viewer task - creates its own event loop in a thread if needed"""
        try:
            # Try to get the current event loop
            loop = asyncio.get_running_loop()
            # If we're already in an event loop, use start_async
            if self.stop_event is None:
                self.stop_event = asyncio.Event()
            if self.task is None or self.task.done():
                self.stop_event.clear()
                self.task = asyncio.create_task(self._run_viewer())
                print(f"[Viewer {self.viewer_id}] Starting viewer...")
            else:
                print(f"[Viewer {self.viewer_id}] Viewer is already running")
        except RuntimeError:
            # No event loop running, create one in a thread
            if self.thread is None or not self.thread.is_alive():
                print(f"[Viewer {self.viewer_id}] No event loop found, creating one in a thread...")
                self.thread = threading.Thread(target=self._start_event_loop, daemon=True)
                self.thread.start()
            else:
                print(f"[Viewer {self.viewer_id}] Viewer is already running in background thread")

    def _start_event_loop(self):
        """Start event loop in a thread"""
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.stop_event = asyncio.Event()
        try:
            self.loop.run_until_complete(self.start_async())
        except Exception as e:
            print(f"[Viewer {self.viewer_id}] Error in event loop: {e}")
        finally:
            self.loop.close()

    async def start_async(self):
        """Start the viewer task in an async context"""
        if self.task is None or self.task.done():
            if self.stop_event is None:
                self.stop_event = asyncio.Event()
            self.stop_event.clear()
            self.task = asyncio.create_task(self._run_viewer())
            print(f"[Viewer {self.viewer_id}] Starting viewer...")
            # Keep the event loop alive
            try:
                await self.task
            except asyncio.CancelledError:
                print(f"[Viewer {self.viewer_id}] Viewer task cancelled")
        else:
            print(f"[Viewer {self.viewer_id}] Viewer is already running")

    async def _run_viewer(self):
        """Main viewer coroutine based on viewer_benchmark.py"""
        config = RTCConfiguration(iceServers=[RTCIceServer(self.stun_url)])
        self.pc = RTCPeerConnection(configuration=config)

        @self.pc.on("icecandidate")
        async def on_ice_candidate(cand):
            if cand:
                print(f"[Viewer {self.viewer_id}] [ICE] candidate:", cand)
            else:
                print(f"[Viewer {self.viewer_id}] [ICE] Gathering complete")

        @self.pc.on("track")
        async def on_track(track):
            print(f"[Viewer {self.viewer_id}] ✅ Received track: {track.kind}")
            if track.kind != "video":
                return

            self.start_time = time.time()
            frame_receive_times = []  # Pour analyser la régularité
            
            try:
                while True:
                    if self.stop_event.is_set():
                        break
                    
                    frame_start = time.time()
                    frame = await track.recv()
                    frame_receive_times.append(frame_start)
                    
                    # Analyse de la régularité des frames
                    if len(frame_receive_times) > 1:
                        interval = frame_receive_times[-1] - frame_receive_times[-2]
                        if interval > 0.1:  # Plus de 100ms entre frames
                            print(f"[Viewer {self.viewer_id}] ⚠️ Long interval: {interval:.3f}s")
                    
                    # Set timestamp for the very first frame
                    if self.first_frame_timestamp is None:
                        self.first_frame_timestamp = time.time()

                    img = frame.to_ndarray(format="bgr24")
                    self.frame_count += 1
                    timestamp = time.time()
                    
                    # Detect red frame
                    is_red, mean_color, sequence_number = self.detect_red_frame(img)
                    if is_red:
                        self.log_red_detection(timestamp, mean_color, sequence_number)
                    
                    # Periodic save (every 5 seconds) or when red frame detected
                    if is_red or (timestamp - self._last_save_time) >= self._save_interval:
                        self.save_timestamps()
                        self._last_save_time = timestamp
                    
                    # Log every 300 frames for monitoring (less frequent to avoid spam)
                    if self.frame_count % 300 == 0:
                        b, g, r = mean_color
                        seq_num_str = f" (Seq: {int(round(g))})" if r > self.red_threshold else ""
                        print(f"[Viewer {self.viewer_id}] Frame {self.frame_count:05d} - BGR=({b:.1f}, {g:.1f}, {r:.1f}){seq_num_str} - {len(self.red_detections)} reds detected")

            except Exception as e:
                print(f"[Viewer {self.viewer_id}] ⚠️ Error in video loop: {e}")
                # mark exit as error and record reason
                self.exit_error = True
                self.exit_reason = str(e)
                self.end_time = time.time()
            finally:
                print(f"[Viewer {self.viewer_id}] 🧹 Cleaning up viewer")
                if not self.end_time:
                    self.end_time = time.time()
                self.save_timestamps()
                self.stop_event.set()

        @self.pc.on("connectionstatechange")
        async def on_conn_state():
            print(f"[Viewer {self.viewer_id}] PC state: {self.pc.connectionState}")

        print(f"[Viewer {self.viewer_id}] Adding transceivers (recvonly)")
        t_video = self.pc.addTransceiver("video", direction="recvonly")

        # VP8 priorité (comme dans l'original)
        video_caps = RTCRtpSender.getCapabilities("video").codecs
        vp8_first = [c for c in video_caps if c.mimeType.lower() == "video/vp8"]
        others = [c for c in video_caps if c.mimeType.lower() != "video/vp8"]
        if vp8_first:
            t_video.setCodecPreferences(vp8_first + others)

        offer = await self.pc.createOffer()
        await self.pc.setLocalDescription(offer)
        while self.pc.iceGatheringState != "complete":
            await asyncio.sleep(0.1)

        sdp = sanitize_sdp(self.pc.localDescription.sdp)

        print(f"[Viewer {self.viewer_id}] ➡️  POST offer to {self.url}")
        async with aiohttp.ClientSession() as session:
            async with session.post(
                self.url,
                data=sdp.encode("utf-8"),
                headers={"Content-Type": "application/sdp", "Accept": "application/sdp", "User-Agent": f"Viewer/{self.viewer_id}"},
            ) as resp:
                body = await resp.text()
                print(f"[Viewer {self.viewer_id}] HTTP {resp.status}")
                if resp.status not in (200, 201):
                    print(f"[Viewer {self.viewer_id}] ❌ Server response:\n", body)
                    await self.pc.close()
                    return
                await self.pc.setRemoteDescription(RTCSessionDescription(body, "answer"))
                print(f"[Viewer {self.viewer_id}] ✅ Got SDP answer")

        while self.pc.connectionState not in ("connected", "failed", "closed") and not self.stop_event.is_set():
            await asyncio.sleep(0.1)

        if self.pc.connectionState == "connected":
            print(f"[Viewer {self.viewer_id}] 🎥 Viewer connected — detecting red frames")
        else:
            print(f"[Viewer {self.viewer_id}] ❌ Viewer failed: {self.pc.connectionState}")
            await self.pc.close()
            return

        # Wait until stopped
        await self.stop_event.wait()
        
        if self.pc.connectionState not in ("closed", "failed"):
            await self.pc.close()
        print(f"[Viewer {self.viewer_id}] ✅ Viewer closed")

    async def stop(self):
        """Stop the viewer"""
        print(f"[Viewer {self.viewer_id}] Stopping viewer...")
        if self.stop_event:
            self.stop_event.set()
        if self.task:
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        # Final save
        if not self.end_time:
            self.end_time = time.time()
        self.exit_error = self.exit_error or False
        self.save_timestamps()
        print(f"[Viewer {self.viewer_id}] Viewer stopped")

    def stop_sync(self):
        """Stop the viewer synchronously"""
        print(f"[Viewer {self.viewer_id}] Stopping viewer synchronously...")
        if self.stop_event:
            if self.loop and self.loop.is_running():
                # Schedule the stop in the event loop
                asyncio.run_coroutine_threadsafe(self.stop(), self.loop)
            else:
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(self.stop())
                except RuntimeError:
                    # No event loop, can't stop properly
                    print(f"[Viewer {self.viewer_id}] No event loop available for clean stop")
        
        # Wait for thread to finish if it exists
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=5.0)
            if self.thread.is_alive():
                print(f"[Viewer {self.viewer_id}] Warning: Thread did not stop within timeout")
        
        # Final save
        if not self.end_time:
            self.end_time = time.time()
        self.save_timestamps()
        print(f"[Viewer {self.viewer_id}] Viewer stopped synchronously")

