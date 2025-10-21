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

class StreamTrack(MediaStreamTrack):
    kind = "video"

    def __init__(self, host_instance):
        super().__init__()
        self.host = host_instance
        self._interval = 1.0 / host_instance.fps
        self._queue = asyncio.Queue(maxsize=2)
        self._stopped = False
        self._pts = 0
        
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
        print(f"[Host] Stream started - Resolution: {self.host.width}x{self.host.height}, FPS: {self.host.fps}")

    async def _run(self):
        self.start_time = time.time()
        try:
            while not self._stopped and not self.host.stop_event.is_set():
                t0 = time.time()
                current_time = t0 - self.start_time
                
                # Determine if we should send red frame (only if latency check is active)
                should_be_red = False
                if self.host.check_latency:
                    should_be_red = (current_time - self.last_red_time) >= self.host.red_interval

                arr = np.zeros((self.host.height, self.host.width, 3), np.uint8)
                if should_be_red:
                    # "Red" frame with sequence number
                    self.special_frame_sequence_number += 1
                    arr[..., 0] = 255  # R
                    arr[..., 1] = self.special_frame_sequence_number  # G = sequence
                    arr[..., 2] = 0    # B
                    self.red_timestamps.append({
                        'frame': self.frame_count,
                        'timestamp': t0,
                        'relative_time': current_time,
                        'sequence_number': self.special_frame_sequence_number
                    })
                    self.last_red_time = current_time
                    # print(f"[Host] 🔴 RED FRAME sent at {t0:.6f} (frame {self.frame_count})")
                else:
                    # Blue frame (sequence 0)
                    arr[..., 0] = 0    # R
                    arr[..., 1] = 0    # G
                    arr[..., 2] = 255  # B

                frame = av.VideoFrame.from_ndarray(arr, format="rgb24")
                frame.pts = self._pts
                frame.time_base = Fraction(1, self.host.fps)
                self._pts += 1
                self.frame_count += 1

                if self._queue.full():
                    _ = self._queue.get_nowait()  # drop si backlog
                await self._queue.put(frame)

                elapsed = time.time() - t0
                await asyncio.sleep(max(0, self._interval - elapsed))
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
        """Save red frame timestamps to JSON file"""
        timestamp_file = os.path.join(self.host.output, "host_timestamps.json")
        data = {
            'session_info': {
                'start_time': datetime.fromtimestamp(self.start_time).isoformat() if self.start_time else None,
                'end_time': datetime.fromtimestamp(self.end_time).isoformat() if self.end_time else None,
                'red_interval': self.host.red_interval,
                'fps': self.host.fps,
                'resolution': f"{self.host.width}x{self.host.height}",
                'total_red_frames': len(self.red_timestamps),
                'exit_error': bool(self.exit_error),
                'exit_reason': str(self.exit_reason) if self.exit_reason else None,
                'total_frames': self.frame_count
            },
            'red_timestamps': self.red_timestamps
        }
        with open(timestamp_file, 'w') as f:
            json.dump(data, f, indent=2)
        print(f"[Host] 💾 Saved {len(self.red_timestamps)} red frame timestamps to {timestamp_file}")

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
    def __init__(self, url: str, stun_url: str, output: str, width=640, height=360, fps=30, red_interval=5.0, token=None):
        self.url = url
        self.stun_url = stun_url
        self.stop_event = None  # Will be created in the event loop
        self.check_latency = False
        self.task = None
        self.width = width
        self.height = height
        self.fps = fps 
        self.red_interval = red_interval
        self.token = token
        self.pc = None
        self.track = None
        self.loop = None
        self.thread = None
        
        os.makedirs(output, exist_ok=True)
        if not os.path.isdir(output) or not os.access(output, os.W_OK):
            raise Exception(f"Output directory {output} is not writable")
        self.output = output

    def start(self):
        """Start the streaming task - creates its own event loop in a thread if needed"""
        try:
            # Try to get the current event loop
            loop = asyncio.get_running_loop()
            # If we're already in an event loop, use start_async
            if self.stop_event is None:
                self.stop_event = asyncio.Event()
            if self.task is None or self.task.done():
                self.stop_event.clear()
                self.task = asyncio.create_task(self._run_stream())
                print("[Host] Starting stream...")
            else:
                print("[Host] Stream is already running")
        except RuntimeError:
            # No event loop running, create one in a thread
            if self.thread is None or not self.thread.is_alive():
                print("[Host] No event loop found, creating one in a thread...")
                self.thread = threading.Thread(target=self._start_event_loop, daemon=True)
                self.thread.start()
            else:
                print("[Host] Stream is already running in background thread")

    def _start_event_loop(self):
        """Start event loop in a thread"""
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.stop_event = asyncio.Event()
        try:
            self.loop.run_until_complete(self.start_async())
        except Exception as e:
            print(f"[Host] Error in event loop: {e}")
        finally:
            self.loop.close()

    async def start_async(self):
        """Start the streaming task in an async context"""
        if self.task is None or self.task.done():
            if self.stop_event is None:
                self.stop_event = asyncio.Event()
            self.stop_event.clear()
            self.task = asyncio.create_task(self._run_stream())
            print("[Host] Starting stream...")
            # Keep the event loop alive
            try:
                await self.task
            except asyncio.CancelledError:
                print("[Host] Stream task cancelled")
        else:
            print("[Host] Stream is already running")

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

        # Note: aiortc doesn't support RTCRtpEncodingParameters/RTCRtpSendParameters
        # Bitrate/framerate control will be done via SDP patching below

        # Patch SDP hints for bitrate control
        def patch_sdp_bitrates(sdp: str) -> str:
            # Build PT->codec map from a=rtpmap
            import re
            rtpmap = {}
            for line in sdp.splitlines():
                m = re.match(r"a=rtpmap:(\d+)\s+([A-Za-z0-9\-]+)/90000", line)
                if m:
                    rtpmap[m.group(1)] = m.group(2).upper()

            print(f"[Host] 🔍 Found codecs: {rtpmap}")

            # Prepare extra fmtp lines
            extra = []
            for pt, codec in rtpmap.items():
                if codec == "VP8":
                    extra.append(f"a=fmtp:{pt} x-google-start-bitrate=600;x-google-max-bitrate=800;x-google-min-bitrate=300")
                    print(f"[Host] 🎯 Adding VP8 bitrate control for PT {pt}")
                elif codec == "H264":
                    # Only add H264 fmtp if constrained-baseline shows up in SDP already
                    if "profile-level-id=42e01f" in sdp.lower():
                        extra.append(f"a=fmtp:{pt} level-asymmetry-allowed=1;packetization-mode=1;"
                                     f"profile-level-id=42e01f;x-google-start-bitrate=600;"
                                     f"x-google-max-bitrate=800;x-google-min-bitrate=300")
                        print(f"[Host] 🎯 Adding H264 bitrate control for PT {pt}")

            if not extra:
                print("[Host] ⚠️ No codecs to patch")
                return sdp

            # Append immediately after each corresponding a=rtpmap line
            out = []
            for line in sdp.splitlines():
                out.append(line)
                m = re.match(r"a=rtpmap:(\d+)\s+([A-Za-z0-9\-]+)/90000", line)
                if m:
                    pt = m.group(1)
                    for ex in list(extra):
                        if ex.startswith(f"a=fmtp:{pt} "):
                            out.append(ex)
                            extra.remove(ex)  # Remove to avoid duplicates
            return "\r\n".join(out)

        # Create and apply offer
        offer = await self.pc.createOffer()
        await self.pc.setLocalDescription(offer)

        # Wait for ICE gathering
        while self.pc.iceGatheringState != "complete":
            await asyncio.sleep(0.05)

        # For now, skip SDP patching to test basic connectivity
        original_sdp = self.pc.localDescription.sdp
        # sdp_patched = patch_sdp_bitrates(original_sdp)
        sdp_patched = original_sdp  # Use original SDP for now
        
        print(f"[Host] 📄 Using original SDP ({len(sdp_patched)} bytes)")
        
        # Debug: print first few lines of SDP
        sdp_lines = sdp_patched.split('\r\n')[:5]
        print(f"[Host] 🔍 SDP preview: {'; '.join(sdp_lines)}")

        print(f"[Host] ➡️  POST offer to WHIP: {self.url}")
        headers = {
            "Content-Type": "application/sdp",
            "Accept": "application/sdp",
            "User-Agent": "Host-Stream/1.0",
        }
        if self.token:
            headers["Authorization"] = self.token if self.token.lower().startswith("bearer ") else f"Bearer {self.token}"

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(self.url, data=sdp_patched.encode("utf-8"), headers=headers) as resp:
                    body = await resp.text()
                    if resp.status not in (200, 201):
                        print(f"[Host] ❌ WHIP POST failed: {resp.status} {body}")
                        return
                    print(f"[Host] ✅ Got answer (status {resp.status})")
                    await self.pc.setRemoteDescription(RTCSessionDescription(body, "answer"))

                print("[Host] ⏳ Waiting for WebRTC connected...")
                while self.pc.connectionState not in ("connected", "failed", "closed") and not self.stop_event.is_set():
                    await asyncio.sleep(0.1)

                if self.pc.connectionState != "connected":
                    print(f"[Host] ❌ Not connected (state: {self.pc.connectionState})")
                    return

                print("[Host] 🎥 Connected — streaming blue frames (red frames when latency check active)")

                # Keep alive until stopped
                while not self.stop_event.is_set() and self.pc.connectionState == "connected":
                    await asyncio.sleep(1.0)

        except Exception as e:
            print(f"[Host] ❌ Error during streaming: {e}")
        finally:
            if self.track:
                self.track.stop()
            if self.pc:
                await self.pc.close()
            print("[Host] ✅ Stream closed")


    async def stop(self):
        """Stop the streaming"""
        print("[Host] Stopping stream...")
        if self.stop_event:
            self.stop_event.set()
        if self.task:
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        print("[Host] Host stopped")

    def stop_sync(self):
        """Stop the streaming synchronously"""
        print("[Host] Stopping stream synchronously...")
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
                    print("[Host] No event loop available for clean stop")
        
        # Wait for thread to finish if it exists
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=5.0)
            if self.thread.is_alive():
                print("[Host] Warning: Thread did not stop within timeout")
        print("[Host] Host stopped synchronously")

    def start_check_latency(self):
        """Activate latency checking (red frames)"""
        if not self.check_latency:
            self.check_latency = True
            print(f"[Host] 🔴 Latency check activated - Red frames every {self.red_interval}s")
        else:
            print("[Host] Latency check already active")


