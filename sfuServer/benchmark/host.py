import asyncio 
import os
import time
import json
import aiohttp
import numpy as np
import av
import threading
from aiortc import (
    RTCPeerConnection,
    RTCSessionDescription,
    MediaStreamTrack,
    RTCConfiguration,
    RTCIceServer,
    RTCRtpSender,
)
from fractions import Fraction
from datetime import datetime
from red_frame_utils import encode_sequence_simple, encode_sequence_diagonal, get_encoding_info

class StreamTrack(MediaStreamTrack):
    kind = "video"

    def __init__(self, host_instance):
        super().__init__()
        self.host = host_instance
        self._interval = 1.0 / host_instance.fps
        # Amélioration : Queue plus grande pour éviter les pertes
        self._queue = asyncio.Queue(maxsize=5)  # Au lieu de 2
        self._stopped = False
        self._pts = 0
        
        # Amélioration : Statistiques de performance
        self.frames_generated = 0
        self.frames_dropped = 0
        self.timing_errors = 0
        
        # Latency check specifics
        self.red_timestamps = []
        self.last_red_time = 0
        self.frame_count = 0
        self.special_frame_sequence_number = 0
        
        self._task = None
        
        # End/exit info
        self.start_time = None
        self.end_time = None
        self.exit_error = False
        self.exit_reason = None

    def start(self):
        self._task = asyncio.create_task(self._run())
        print(f"[Host] Stream started - Resolution: {self.host.width}x{self.host.height}, FPS: {self.host.fps}, Encoding: {self.host.encoding_info['name']}")

    async def _run(self):
        self.start_time = time.time()
        last_red_check = self.start_time  # Nouveau: référence fixe pour le timing
        
        try:
            while not self._stopped and not self.host.stop_event.is_set():
                t0 = time.time()
                current_time = t0 - self.start_time
                
                # Amélioration 1: Timing basé sur l'horloge absolue
                should_be_red = False
                if self.host.check_latency:
                    # Calculer le prochain moment où une frame rouge devrait être envoyée
                    next_red_time = last_red_check + self.host.red_interval
                    should_be_red = t0 >= next_red_time
                    
                    if should_be_red:
                        last_red_check = t0  # Mettre à jour la référence

                arr = np.zeros((self.host.height, self.host.width, 3), np.uint8)
                if should_be_red:
                    # Amélioration 2: Meilleur encodage de la séquence
                    self.special_frame_sequence_number += 1
                    
                    # Use encoding method from host configuration
                    if self.host.encoding_method == "simple":
                        r, g, b = encode_sequence_simple(self.special_frame_sequence_number)
                    else:  # diagonal
                        # For diagonal, we need to check if sequence number is within range
                        seq = self.special_frame_sequence_number % 128  # Wrap around at 128
                        r, g, b = encode_sequence_diagonal(seq)
                    
                    arr[..., 0] = r  # R = 255
                    arr[..., 1] = g  # G = encoded value
                    arr[..., 2] = b  # B = encoded value
                    
                    self.red_timestamps.append({
                        'frame': self.frame_count,
                        'timestamp': t0,
                        'relative_time': current_time,
                        'sequence_number': self.special_frame_sequence_number,
                        'expected_time': next_red_time - self.start_time,
                        'timing_error': t0 - next_red_time,
                        'encoding_method': self.host.encoding_method,
                        'rgb': (r, g, b)
                    })
                    self.last_red_time = current_time
                    print(f"[Host] 🔴 RED FRAME sent (Seq: {self.special_frame_sequence_number}, Method: {self.host.encoding_method}) at {t0:.6f} (error: {(t0-next_red_time)*1000:.1f}ms)")
                else:
                    # Frame bleue standard
                    arr[..., 0] = 0    # R
                    arr[..., 1] = 0    # G  
                    arr[..., 2] = 255  # B

                frame = av.VideoFrame.from_ndarray(arr, format="rgb24")
                frame.pts = self._pts
                frame.time_base = Fraction(1, self.host.fps)
                self._pts += 1
                self.frame_count += 1

                # Amélioration 3: Gestion de queue non-bloquante
                try:
                    if self._queue.full():
                        try:
                            dropped = self._queue.get_nowait()
                            self.frames_dropped += 1
                            print(f"[Host] ⚠️ Dropped frame {self.frame_count-1} (queue full)")
                        except asyncio.QueueEmpty:
                            pass
                    
                    self._queue.put_nowait(frame)
                    self.frames_generated += 1
                except asyncio.QueueFull:
                    self.frames_dropped += 1
                    print(f"[Host] ⚠️ Failed to queue frame {self.frame_count} (queue full)")

                # Amélioration 4: Timing plus précis et constant
                elapsed = time.time() - t0
                sleep_time = max(0, self._interval - elapsed)
                
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)
                elif elapsed > self._interval * 2:
                    self.timing_errors += 1
                    print(f"[Host] ⚠️ Frame generation too slow: {elapsed:.3f}s (target: {self._interval:.3f}s)")
        except Exception as e:
            self.exit_error = True
            self.exit_reason = str(e)
            self.end_time = time.time()
            print(f"[Host] ⚠️ Error in stream track: {e}")
        finally:
            # Save timestamps when stopping (if latency check was active)
            if self.host.check_latency and not hasattr(self, '_timestamps_saved'):
                # ensure end_time is set
                if not self.end_time:
                    self.end_time = time.time()
                self._save_timestamps()
                self._timestamps_saved = True
            print("[Host] Stream track stopped")

    def _save_timestamps(self):
        """Save red frame timestamps to JSON file with performance stats"""
        timestamp_file = os.path.join(self.host.output, "host_timestamps.json")
        
        # Calculer les statistiques de timing
        timing_errors = []
        if len(self.red_timestamps) > 1:
            for i in range(1, len(self.red_timestamps)):
                expected_interval = self.host.red_interval
                actual_interval = self.red_timestamps[i]['timestamp'] - self.red_timestamps[i-1]['timestamp']
                error = actual_interval - expected_interval
                timing_errors.append(error)
        
        data = {
            'session_info': {
                'start_time': datetime.fromtimestamp(self.start_time).isoformat() if self.start_time else None,
                'end_time': datetime.fromtimestamp(self.end_time).isoformat() if self.end_time else None,
                'red_interval': self.host.red_interval,
                'fps': self.host.fps,
                'resolution': f"{self.host.width}x{self.host.height}",
                'encoding_method': self.host.encoding_method,
                'encoding_info': {
                    'name': self.host.encoding_info['name'],
                    'max_sequence': self.host.encoding_info['max_sequence'],
                    'bits': self.host.encoding_info['bits'],
                    'has_redundancy': self.host.encoding_info['has_redundancy'],
                    'error_detection': self.host.encoding_info['error_detection'],
                },
                'total_red_frames': len(self.red_timestamps),
                'total_frames': self.frame_count,
                'frames_generated': self.frames_generated,
                'frames_dropped': self.frames_dropped,
                'timing_errors': self.timing_errors,
                'avg_timing_error': sum(timing_errors) / len(timing_errors) if timing_errors else 0,
                'max_timing_error': max(timing_errors) if timing_errors else 0,
                'exit_error': bool(self.exit_error),
                'exit_reason': str(self.exit_reason) if self.exit_reason else None,
            },
            'red_timestamps': self.red_timestamps,
            'performance_stats': {
                'timing_errors_ms': [e * 1000 for e in timing_errors],
                'frame_drop_rate': self.frames_dropped / max(1, self.frames_generated) * 100
            }
        }
        
        with open(timestamp_file, 'w') as f:
            json.dump(data, f, indent=2)
        print(f"[Host] 💾 Saved {len(self.red_timestamps)} red frames, {self.frames_dropped} drops, {self.timing_errors} timing errors")

    async def recv(self):
        return await self._queue.get()

    def stop(self):
        self._stopped = True
        if self._task:
            self._task.cancel()
        # Save timestamps when stopping
        if self.host.check_latency and not hasattr(self, '_timestamps_saved'):
            if not self.end_time:
                self.end_time = time.time()
            self._save_timestamps()
            self._timestamps_saved = True
        super().stop()


class Host: 
    def __init__(self, url: str, stun_url: str, output: str, width=640, height=360, fps=30, red_interval=5.0, token=None, encoding_method="simple", connection_timeout=30.0, http_timeout=10.0):
        self.url = url
        self.stun_url = stun_url
        self.width = width
        self.height = height
        self.fps = fps 
        self.red_interval = red_interval
        self.token = token
        self.connection_timeout = connection_timeout
        self.http_timeout = http_timeout
        
        # Thread-safe check_latency with lock
        self._check_latency = False
        self._latency_lock = threading.Lock()
        
        # Event loop management - simplified
        self.stop_event = None
        self.task = None
        self.pc = None
        self.track = None
        
        # Encoding method configuration
        if encoding_method not in ["simple", "diagonal"]:
            raise ValueError(f"encoding_method must be 'simple' or 'diagonal', got '{encoding_method}'")
        self.encoding_method = encoding_method
        self.encoding_info = get_encoding_info(encoding_method)
        
        os.makedirs(output, exist_ok=True)
        if not os.path.isdir(output) or not os.access(output, os.W_OK):
            raise Exception(f"Output directory {output} is not writable")
        self.output = output
    
    @property
    def check_latency(self):
        """Thread-safe getter for check_latency"""
        with self._latency_lock:
            return self._check_latency
    
    @check_latency.setter
    def check_latency(self, value):
        """Thread-safe setter for check_latency"""
        with self._latency_lock:
            self._check_latency = value

    def start(self):
        """Start the streaming task - only works in async context, use start_in_thread() for sync"""
        raise RuntimeError("Use 'await start_async()' in async context or 'start_in_thread()' in sync context")

    def start_in_thread(self):
        """Start the streaming in a background thread (for synchronous usage)"""
        def _thread_runner():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(self.start_async())
            except Exception as e:
                print(f"[Host] Error in thread: {e}")
            finally:
                loop.close()
        
        thread = threading.Thread(target=_thread_runner, daemon=True)
        thread.start()
        print("[Host] Stream started in background thread")
        return thread

    async def start_async(self):
        """Start the streaming task in an async context"""
        if self.stop_event is None:
            self.stop_event = asyncio.Event()
        
        if self.task is None or self.task.done():
            self.stop_event.clear()
            self.task = asyncio.create_task(self._run_stream())
            print("[Host] Starting stream...")
            try:
                await self.task
            except asyncio.CancelledError:
                print("[Host] Stream task cancelled")
        else:
            print("[Host] Stream is already running")

    # Amélioration des paramètres WebRTC
    def patch_sdp_bitrates(self, sdp: str) -> str:
        import re
        
        lines = sdp.replace('\r\n', '\n').replace('\r', '\n').split('\n')
        
        rtpmap = {}
        for line in lines:
            m = re.match(r"a=rtpmap:(\d+)\s+([A-Za-z0-9\-]+)/90000", line)
            if m:
                rtpmap[m.group(1)] = m.group(2).upper()

        extra = []
        for pt, codec in rtpmap.items():
            if codec == "VP8":
                # Paramètres optimisés pour faible latence
                extra.append(f"a=fmtp:{pt} "
                            f"x-google-start-bitrate=2000;"
                            f"x-google-max-bitrate=4000;"
                            f"x-google-min-bitrate=1000;"
                            f"x-google-cpu-overuse-detection=false;"
                            f"max-fr=30")
            elif codec == "H264":
                extra.append(f"a=fmtp:{pt} "
                            f"level-asymmetry-allowed=1;"
                            f"packetization-mode=1;"
                            f"profile-level-id=42e01f;"
                            f"x-google-start-bitrate=2000;"
                            f"x-google-max-bitrate=4000")

        # Insérer les paramètres + ajouter des paramètres de latence
        out = []
        for line in lines:
            out.append(line)
            if line.startswith("m=video"):
                # Ajouter des paramètres de latence après la ligne m=video
                out.append("a=rtcp-fb:* nack")
                out.append("a=rtcp-fb:* ccm fir") 
                out.append("a=rtcp-fb:* goog-remb")
            
            m = re.match(r"a=rtpmap:(\d+)\s+([A-Za-z0-9\-]+)/90000", line)
            if m:
                pt = m.group(1)
                for ex in list(extra):
                    if ex.startswith(f"a=fmtp:{pt} "):
                        out.append(ex)
                        extra.remove(ex)
        
        result = "\r\n".join(line for line in out if line.strip())
        if not result.endswith('\r\n'):
            result += '\r\n'
        
        return result

    async def _run_stream(self):
        """Main streaming coroutine optimized for low-latency VP8 benchmark"""
        config = RTCConfiguration(iceServers=[RTCIceServer(self.stun_url)])
        self.pc = RTCPeerConnection(configuration=config)

        @self.pc.on("icegatheringstatechange")
        async def _g():
            print("[Host] ICE gathering:", self.pc.iceGatheringState)

        @self.pc.on("iceconnectionstatechange")
        async def _i():
            print("[Host] ICE conn:", self.pc.iceConnectionState)

        @self.pc.on("connectionstatechange")
        async def _c():
            print("[Host] PC state:", self.pc.connectionState)

        # Create and start track (custom StreamTrack class)
        self.track = StreamTrack(self)
        self.track.start()

        # Add transceiver in sendonly mode
        transceiver = self.pc.addTransceiver(self.track, direction="sendonly")

        # 🔹 Prefer VP8 (simple, robust, no B-frames)
        video_caps = RTCRtpSender.getCapabilities("video").codecs
        vp8 = [c for c in video_caps if c.mimeType.lower() == "video/vp8"]
        h264_cb = [c for c in video_caps
                   if c.mimeType.lower() == "video/h264"
                   and c.parameters.get("profile-level-id", "").lower() == "42e01f"]
        others = [c for c in video_caps if c not in vp8 + h264_cb]
        transceiver.setCodecPreferences(vp8 + h264_cb + others)

        # Create and apply offer
        offer = await self.pc.createOffer()
        await self.pc.setLocalDescription(offer)

        # Wait for ICE gathering
        while self.pc.iceGatheringState != "complete":
            await asyncio.sleep(0.05)

        # Get original SDP
        original_sdp = self.pc.localDescription.sdp
        
        # Try to send original SDP first, fall back to patched if needed
        use_patched = False
        try:
            # Validate original SDP format
            if not original_sdp.strip().endswith('\r\n'):
                original_sdp = original_sdp.strip() + '\r\n'
            
            # Try patching only if specifically needed
            if any(codec.mimeType.lower() in ["video/vp8", "video/h264"] for codec in video_caps):
                sdp_to_send = self.patch_sdp_bitrates(original_sdp)
                use_patched = True
                print(f"[Host] 📄 Using patched SDP ({len(sdp_to_send)} bytes)")
            else:
                sdp_to_send = original_sdp
                print(f"[Host] 📄 Using original SDP ({len(sdp_to_send)} bytes)")
                
        except Exception as e:
            print(f"[Host] ⚠️ SDP patching failed: {e}, using original")
            sdp_to_send = original_sdp
            use_patched = False
        
        # Debug: validate SDP format
        if not sdp_to_send.startswith('v=0'):
            print(f"[Host] ⚠️ Invalid SDP format: doesn't start with v=0")
        if not sdp_to_send.endswith('\r\n'):
            print(f"[Host] ⚠️ SDP doesn't end with CRLF")
            sdp_to_send = sdp_to_send.rstrip() + '\r\n'
        
        # Debug: print SDP structure
        sdp_lines = sdp_to_send.split('\r\n')
        print(f"[Host] 🔍 SDP has {len(sdp_lines)} lines, patched: {use_patched}")
        print(f"[Host] 🔍 First 3 lines: {sdp_lines[:3]}")
        print(f"[Host] 🔍 Last 3 lines: {[line for line in sdp_lines[-5:] if line.strip()]}")

        print(f"[Host] ➡️  POST offer to WHIP: {self.url}")
        headers = {
            "Content-Type": "application/sdp",
            "Accept": "application/sdp",
            "User-Agent": "Host-Stream/1.0",
        }
        if self.token:
            headers["Authorization"] = self.token if self.token.lower().startswith("bearer ") else f"Bearer {self.token}"

        try:
            # Create session with timeout
            timeout = aiohttp.ClientTimeout(total=self.http_timeout)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                # Send SDP as bytes to avoid encoding issues
                sdp_bytes = sdp_to_send.encode("utf-8")
                print(f"[Host] 📤 Sending {len(sdp_bytes)} bytes (timeout: {self.http_timeout}s)")
                
                async with session.post(self.url, data=sdp_bytes, headers=headers) as resp:
                    body = await resp.text()
                    if resp.status not in (200, 201):
                        print(f"[Host] ❌ WHIP POST failed: {resp.status} {body}")
                        # If patched SDP failed, try original
                        if use_patched and resp.status == 500:
                            print(f"[Host] 🔄 Retrying with original SDP...")
                            original_bytes = original_sdp.encode("utf-8")
                            async with session.post(self.url, data=original_bytes, headers=headers) as resp2:
                                body = await resp2.text()
                                if resp2.status not in (200, 201):
                                    print(f"[Host] ❌ Original SDP also failed: {resp2.status} {body}")
                                    return
                                print(f"[Host] ✅ Original SDP worked (status {resp2.status})")
                                await self.pc.setRemoteDescription(RTCSessionDescription(body, "answer"))
                        else:
                            return
                    else:
                        print(f"[Host] ✅ Got answer (status {resp.status})")
                        await self.pc.setRemoteDescription(RTCSessionDescription(body, "answer"))

                print(f"[Host] ⏳ Waiting for WebRTC connected (timeout: {self.connection_timeout}s)...")
                connection_start = time.time()
                while self.pc.connectionState not in ("connected", "failed", "closed") and not self.stop_event.is_set():
                    # Check timeout
                    if time.time() - connection_start > self.connection_timeout:
                        print(f"[Host] ❌ Connection timeout after {self.connection_timeout}s (state: {self.pc.connectionState})")
                        return
                    await asyncio.sleep(0.1)

                if self.pc.connectionState != "connected":
                    print(f"[Host] ❌ Not connected (state: {self.pc.connectionState})")
                    return

                print("[Host] 🎥 Connected — streaming blue frames (red frames when latency check active)")

                # Keep alive until stopped
                while not self.stop_event.is_set() and self.pc.connectionState == "connected":
                    await asyncio.sleep(1.0)

        except asyncio.TimeoutError:
            print(f"[Host] ❌ HTTP request timeout after {self.http_timeout}s")
        except Exception as e:
            print(f"[Host] ❌ Error during streaming: {e}")
            import traceback
            traceback.print_exc()
        finally:
            if self.track:
                self.track.stop()
            if self.pc:
                await self.pc.close()
            print("[Host] ✅ Stream closed")

    def stop(self):
        """Stop the streaming (sets the stop event)"""
        print("[Host] Stopping stream...")
        if self.stop_event:
            # This is thread-safe - just set the event flag
            try:
                loop = asyncio.get_running_loop()
                loop.call_soon_threadsafe(self.stop_event.set)
            except RuntimeError:
                # If no running loop, try to set it directly (works with asyncio.Event)
                if hasattr(self.stop_event, '_loop'):
                    self.stop_event._loop.call_soon_threadsafe(self.stop_event.set)
                else:
                    print("[Host] Warning: Cannot stop cleanly, no event loop")
        print("[Host] Stop signal sent")

    def start_check_latency(self):
        """Activate latency checking (red frames)"""
        if not self.check_latency:
            self.check_latency = True
            max_seq = self.encoding_info['max_sequence']
            redundancy = " (with redundancy)" if self.encoding_info['has_redundancy'] else ""
            print(f"[Host] 🔴 Latency check activated - Red frames every {self.red_interval}s using {self.encoding_info['name']} (max seq: {max_seq}){redundancy}")
        else:
            print("[Host] Latency check already active")


