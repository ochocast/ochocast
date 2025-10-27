"""
Viewer adapté pour le mode distribué.
Basé sur benchmark/rework/viewer.py avec adaptations pour fonctionner sur un worker.
"""
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


class DistributedViewer:
    """Viewer pour le benchmark distribué - version simplifiée sans thread"""
    
    def __init__(
        self, 
        viewer_id: str, 
        red_threshold: float, 
        url: str, 
        stun_url: str = "stun:stun.l.google.com:19302",
        on_detection_callback = None
    ):
        self.viewer_id = viewer_id
        self.red_threshold = red_threshold
        self.url = url
        self.stun_url = stun_url
        self.stop_event = None
        self.pc = None
        
        # Callback pour envoyer les détections immédiatement
        self.on_detection_callback = on_detection_callback
        
        # Red detection data
        self.red_detections = []
        self.frame_count = 0
        self.start_time = None
        self.first_frame_timestamp = None
        self._last_save_time = 0
        self._save_interval = 5.0

        # End/exit info
        self.end_time = None
        self.exit_error = False
        self.exit_reason = None
        
        # Status
        self.connected = False
        self.running = False

    def detect_red_frame(self, img):
        """Detect if frame is predominantly red and extract sequence number."""
        mean_color = img.mean(axis=(0, 1))  # BGR format
        b, g, r = mean_color
        
        is_red = (r > self.red_threshold) and (r > b + 100) and (r > g + 100)
        
        sequence_number = 0
        if is_red:
            seq_low = int(round(g))
            seq_high = int(round(b))
            sequence_number = seq_low + (seq_high << 8)
            
            if sequence_number <= 0 or sequence_number > 65535:
                is_red = False
                sequence_number = 0
        
        return is_red, (b, g, r), sequence_number
    
    def log_red_detection(self, timestamp, mean_color, sequence_number):
        """Log a red frame detection with improved duplicate prevention"""
        relative_time = timestamp - self.start_time if self.start_time else 0
        
        # Prévention des doublons
        duplicate = False
        for detection in self.red_detections[-10:]:
            if detection['sequence_number'] == sequence_number:
                time_diff = abs(timestamp - detection['timestamp'])
                if time_diff < 0.1:
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
            
            # Envoyer immédiatement via callback si disponible
            if self.on_detection_callback:
                try:
                    self.on_detection_callback(detection)
                except Exception as e:
                    print(f"[Viewer {self.viewer_id}] ⚠️ Callback error: {e}")
    
    def get_timestamps_data(self) -> dict:
        """Retourne les données de timestamps au format JSON"""
        return {
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
    
    def get_status(self) -> dict:
        """Retourne le statut actuel du viewer"""
        first_frame_received = self.first_frame_timestamp is not None
        return {
            'viewer_id': self.viewer_id,
            'connected': self.connected,
            'running': self.running,
            'frame_count': self.frame_count,
            'red_detections': len(self.red_detections),
            'first_frame_received': first_frame_received,
            'first_frame_timestamp': self.first_frame_timestamp,
            'exit_error': self.exit_error
        }

    async def run(self):
        """Main viewer coroutine"""
        self.running = True
        self.stop_event = asyncio.Event()
        
        config = RTCConfiguration(iceServers=[RTCIceServer(self.stun_url)])
        self.pc = RTCPeerConnection(configuration=config)

        @self.pc.on("track")
        async def on_track(track):
            print(f"[Viewer {self.viewer_id}] ✅ Received track: {track.kind}")
            if track.kind != "video":
                return

            self.start_time = time.time()
            self.connected = True
            
            try:
                while True:
                    if self.stop_event.is_set():
                        break
                    
                    frame = await track.recv()
                    
                    if self.first_frame_timestamp is None:
                        self.first_frame_timestamp = time.time()
                        print(f"[Viewer {self.viewer_id}] 🎬 First frame received")

                    img = frame.to_ndarray(format="bgr24")
                    self.frame_count += 1
                    timestamp = time.time()
                    
                    # Detect red frame
                    is_red, mean_color, sequence_number = self.detect_red_frame(img)
                    if is_red:
                        self.log_red_detection(timestamp, mean_color, sequence_number)
                    
                    # Log every 300 frames for monitoring
                    if self.frame_count % 300 == 0:
                        print(f"[Viewer {self.viewer_id}] Frame {self.frame_count:05d} - {len(self.red_detections)} reds")

            except Exception as e:
                print(f"[Viewer {self.viewer_id}] ⚠️ Error in video loop: {e}")
                self.exit_error = True
                self.exit_reason = str(e)
            finally:
                if not self.end_time:
                    self.end_time = time.time()
                self.stop_event.set()

        @self.pc.on("connectionstatechange")
        async def on_conn_state():
            print(f"[Viewer {self.viewer_id}] PC state: {self.pc.connectionState}")
            if self.pc.connectionState == "connected":
                self.connected = True
            elif self.pc.connectionState in ("failed", "closed"):
                self.connected = False

        print(f"[Viewer {self.viewer_id}] Adding transceivers (recvonly)")
        t_video = self.pc.addTransceiver("video", direction="recvonly")

        # VP8 priorité
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
                headers={
                    "Content-Type": "application/sdp",
                    "Accept": "application/sdp",
                    "User-Agent": f"DistributedViewer/{self.viewer_id}"
                },
            ) as resp:
                body = await resp.text()
                print(f"[Viewer {self.viewer_id}] HTTP {resp.status}")
                if resp.status not in (200, 201):
                    print(f"[Viewer {self.viewer_id}] ❌ Server response:\n", body)
                    await self.pc.close()
                    self.running = False
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
            self.running = False
            return

        # Wait until stopped
        await self.stop_event.wait()
        
        if self.pc.connectionState not in ("closed", "failed"):
            await self.pc.close()
        
        self.running = False
        self.connected = False
        print(f"[Viewer {self.viewer_id}] ✅ Viewer closed")

    async def stop(self):
        """Stop the viewer"""
        print(f"[Viewer {self.viewer_id}] Stopping viewer...")
        if self.stop_event:
            self.stop_event.set()
        if not self.end_time:
            self.end_time = time.time()
        print(f"[Viewer {self.viewer_id}] Viewer stopped")
