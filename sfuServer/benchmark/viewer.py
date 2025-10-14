#!/usr/bin/env python3
import argparse, asyncio, aiohttp, cv2, re, signal
from aiortc import (
    RTCPeerConnection,
    RTCSessionDescription,
    RTCConfiguration,
    RTCIceServer,
    RTCRtpSender,
)

# --- Pour fermer proprement avec Ctrl+C
stop_flag = asyncio.Event()
def handle_sigint(*_):
    print("\n🟥 Ctrl+C detected — closing viewer...")
    stop_flag.set()
signal.signal(signal.SIGINT, handle_sigint)

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

    # Ajoute setup/actpass global et end-of-candidates global
    sdp2 = "\r\n".join(out) + "\r\n"
    if "a=setup:actpass" not in sdp2:
        sdp2 = sdp2.replace("t=0 0", "t=0 0\r\na=setup:actpass", 1)
    if not sdp2.strip().endswith("a=end-of-candidates"):
        sdp2 += "a=end-of-candidates\r\n"
    return sdp2


async def whip_viewer(viewer_url: str, stun_url: str):
    config = RTCConfiguration(iceServers=[RTCIceServer(stun_url)])
    pc = RTCPeerConnection(configuration=config)

    @pc.on("icecandidate")
    async def on_ice_candidate(cand):
        if cand:
            print("[ICE] candidate:", cand)
        else:
            print("[ICE] Gathering complete")

    @pc.on("track")
    async def on_track(track):
        print(f"[Viewer] ✅ Received track: {track.kind}")
        if track.kind != "video":
            return

        frame_count = 0
        print("[Viewer] Waiting for frames... (press Ctrl+C to quit)")
        try:
            while not stop_flag.is_set():
                frame = await track.recv()
                img = frame.to_ndarray(format="bgr24")

                # ---- 🎨 Calculer la couleur moyenne (B, G, R)
                mean_color = img.mean(axis=(0, 1))
                b, g, r = mean_color
                print(f"[Frame {frame_count:05d}] Mean BGR = (" \
                      f"{b:.1f}, {g:.1f}, {r:.1f})")
                frame_count += 1
                # Suppression de l'affichage de l'image et de la gestion du clavier
                # cv2.imshow("Viewer", img)
                # key = cv2.waitKey(1) & 0xFF
                # if key == ord("q"):
                #     print("🟨 Quit via Q key")
                #     stop_flag.set()
                #     break

        except Exception as e:
            print(f"⚠️ Error in video loop: {e}")
        finally:
            print("🧹 Cleaning up viewer window")
            # cv2.destroyAllWindows()  # plus nécessaire
            await pc.close()
            stop_flag.set()

    @pc.on("connectionstatechange")
    async def on_conn_state():
        print(f"[Viewer] PC state: {pc.connectionState}")

    print("[Viewer] Adding transceivers (recvonly)")
    t_video = pc.addTransceiver("video", direction="recvonly")

    # VP8 priorité
    video_caps = RTCRtpSender.getCapabilities("video").codecs
    vp8_first = [c for c in video_caps if c.mimeType.lower() == "video/vp8"]
    others = [c for c in video_caps if c.mimeType.lower() != "video/vp8"]
    if vp8_first:
        t_video.setCodecPreferences(vp8_first + others)

    offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    while pc.iceGatheringState != "complete":
        await asyncio.sleep(0.1)

    sdp = sanitize_sdp(pc.localDescription.sdp)

    print("➡️  POST offer to", viewer_url)
    async with aiohttp.ClientSession() as session:
        async with session.post(
            viewer_url,
            data=sdp.encode("utf-8"),
            headers={"Content-Type": "application/sdp", "Accept": "application/sdp"},
        ) as resp:
            body = await resp.text()
            print(f"[Viewer] HTTP {resp.status}")
            if resp.status not in (200, 201):
                print("❌ Server response:\n", body)
                await pc.close()
                return
            await pc.setRemoteDescription(RTCSessionDescription(body, "answer"))
            print("✅ Got SDP answer")

    while pc.connectionState not in ("connected", "failed", "closed"):
        await asyncio.sleep(0.1)

    if pc.connectionState == "connected":
        print("🎥 Viewer connected — receiving stream")
    else:
        print("❌ Viewer failed:", pc.connectionState)

    # Attendre jusqu’à Ctrl+C ou fermeture
    await stop_flag.wait()
    if not pc.isClosed:
        await pc.close()
    print("✅ Closed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="WebRTC viewer for Go SFU (VP8, global ICE/DTLS)")
    parser.add_argument("url", help="Viewer endpoint, ex: http://host:8090/viewer")
    parser.add_argument("--stun", default="stun:stun.l.google.com:19302")
    args = parser.parse_args()
    asyncio.run(whip_viewer(args.url, args.stun))
