#!/usr/bin/env python3
import argparse, asyncio, time
import aiohttp
import numpy as np
import av
from aiortc import (
    RTCPeerConnection,
    RTCSessionDescription,
    MediaStreamTrack,
    RTCConfiguration,
    RTCIceServer,
    RTCRtpSender,
)
from fractions import Fraction

# ---- Track actif (push) qui génère une frame bleue à FPS constant
class PushBlueTrack(MediaStreamTrack):
    kind = "video"

    def __init__(self, width=640, height=360, fps=30, log_fps=True):
        super().__init__()
        self.width, self.height, self.fps = width, height, fps
        self._interval = 1.0 / fps
        self._queue = asyncio.Queue(maxsize=2)
        self._stopped = False
        self._pts = 0
        self._log_fps = log_fps
        self._frames_in_window = 0
        self._last_log = time.time()
        self._task = None

    def start(self):
        self._task = asyncio.create_task(self._run())

    async def _run(self):
        
        # def make_noisy_frame(h, w):
        #     # génère bruit pseudo-aléatoire mais stable par frame pour éviter chutes mémoire
        #     return np.random.randint(0, 256, (h, w, 3), dtype=np.uint8)
        # print(f"[Track] start {self.width}x{self.height}@{self.fps}fps (push)")
        while not self._stopped:
            t0 = time.time()
            # arr = make_noisy_frame(self.height, self.width)
            arr = np.zeros((self.height, self.width, 3), np.uint8)
            arr[..., 2] = 255
            frame = av.VideoFrame.from_ndarray(arr, format="rgb24")
            frame.pts = self._pts
            frame.time_base = Fraction(1, self.fps)
            self._pts += 1

            if self._queue.full():
                _ = self._queue.get_nowait()  # drop si backlog
            await self._queue.put(frame)

            if self._log_fps:
                self._frames_in_window += 1
                now = time.time()
                if now - self._last_log >= 1.0:
                    fps_real = self._frames_in_window / (now - self._last_log)
                    print(f"[Track] ts={now:.3f}  fps_real={fps_real:.2f}")
                    self._frames_in_window = 0
                    self._last_log = now

            elapsed = time.time() - t0
            await asyncio.sleep(max(0, self._interval - elapsed))

        print("[Track] stopped")

    async def recv(self):
        return await self._queue.get()

    def stop(self):
        self._stopped = True
        if self._task:
            self._task.cancel()
        super().stop()


async def whip_push(whip_url: str, token: str | None, stun_url: str):
    # Configuration WebRTC : STUN + pas de trickle (on attend la fin ICE locale)
    config = RTCConfiguration(iceServers=[RTCIceServer(stun_url)])
    pc = RTCPeerConnection(configuration=config)

    # Logs d’état utiles
    @pc.on("icegatheringstatechange")
    async def _g():
        print("ICE gathering:", pc.iceGatheringState)

    @pc.on("iceconnectionstatechange")
    async def _i():
        print("ICE conn:", pc.iceConnectionState)

    @pc.on("connectionstatechange")
    async def _c():
        print("PC state:", pc.connectionState)

    # Track vidéo "push" avec configuration low-latency
    track = PushBlueTrack(640, 400, 30)
    track.start()

    # Forcer un transceiver vidéo sendonly + préférer AV1 (compat Pion)
    transceiver = pc.addTransceiver(track, direction="sendonly")

    # Préférer AV1 en tête avec paramètres optimisés
    video_caps = RTCRtpSender.getCapabilities("video").codecs
    av1_first = [c for c in video_caps if c.mimeType.lower() == "video/av01"]
    others = [c for c in video_caps if c.mimeType.lower() != "video/av01"]
    transceiver.setCodecPreferences(av1_first + others)

    # Créer offre + attendre fins des candidats locaux (pas de trickle côté serveur)
    offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    while pc.iceGatheringState != "complete":
        await asyncio.sleep(0.05)

    print("➡️  POST offer to WHIP:", whip_url)
    headers = {"Content-Type": "application/sdp", "Accept": "application/sdp", "User-Agent": "OBS/30 (simulated)"}
    if token:
        headers["Authorization"] = token if token.lower().startswith("bearer ") else f"Bearer {token}"

    async with aiohttp.ClientSession() as session:
        async with session.post(whip_url, data=pc.localDescription.sdp.encode("utf-8"), headers=headers) as resp:
            body = await resp.text()
            if resp.status not in (200, 201):
                print("❌ WHIP POST failed:", resp.status, body)
                await pc.close()
                return
            print("✅ got answer (status", resp.status, ")")
            await pc.setRemoteDescription(RTCSessionDescription(body, "answer"))

        print("⏳ waiting for WebRTC connected …")
        # Attendre l’état connecté (DTLS-SRTP établi) => RTP part réellement
        while pc.connectionState not in ("connected", "failed", "closed"):
            await asyncio.sleep(0.1)

        if pc.connectionState != "connected":
            print("❌ not connected (state:", pc.connectionState, ")")
            await pc.close()
            return

        print("🎥 connected — pushing RTP to SFU (watch your Go logs)")
        try:
            # Boucle de stats simple : bytesSent pour confirmer le push
            last_bytes = 0
            last_t = time.time()
            while True:
                await asyncio.sleep(2.0)
                stats = await pc.getStats()
                # trouver outbound-rtp video
                for s in stats.values():
                    if s.type == "outbound-rtp" and getattr(s, "kind", None) == "video":
                        now = time.time()
                        bytes_sent = getattr(s, "bytesSent", 0)
                        delta_b = bytes_sent - last_bytes
                        delta_t = now - last_t
                        if delta_t > 0 and delta_b >= 0:
                            kbps = (delta_b * 8) / 1000.0 / delta_t
                            print(f"[stats] outbound video ~ {kbps:.1f} kbps, packetsSent={getattr(s,'packetsSent',0)}")
                        last_bytes, last_t = bytes_sent, now
                        break
        except KeyboardInterrupt:
            print("Stopping…")

    track.stop()
    await pc.close()
    print("✅ closed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="WHIP push client (OBS-like, VP8, no-trickle)")
    parser.add_argument("url", help="WHIP ingest URL (ex: http://localhost:8090/whip)")
    parser.add_argument("--token", help="Bearer token (if any)")
    parser.add_argument("--stun", default="stun:stun.l.google.com:19302")
    args = parser.parse_args()
    asyncio.run(whip_push(args.url, args.token, args.stun))