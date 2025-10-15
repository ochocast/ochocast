#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import asyncio
import aiohttp
import cv2
import signal
import time
import re

from aiortc import (
    RTCPeerConnection,
    RTCSessionDescription,
    RTCConfiguration,
    RTCIceServer,
    RTCRtpSender,
)

# -----------------------------
# Gestion propre de Ctrl+C
# -----------------------------
stop_flag = asyncio.Event()
def handle_sigint(*_):
    print("\n🟥 Ctrl+C détecté — fermeture en cours…")
    stop_flag.set()
signal.signal(signal.SIGINT, handle_sigint)


# -----------------------------
# SDP utils
# -----------------------------
def _extract_mids(sdp: str):
    """Retourne la liste des a=mid:<id> dans l'ordre d'apparition."""
    return re.findall(r"^a=mid:([^\r\n]+)", sdp, flags=re.MULTILINE)

def sanitize_sdp(sdp: str) -> str:
    """
    Nettoyage léger et ajout de directives utiles pour réduire la latence initiale :
    - Port m= 9 (WHIP/Pion toléré)
    - c=IN IP4 0.0.0.0
    - a=setup:actpass si manquant
    - a=group:BUNDLE <mids> si manquant
    - a=rtcp-mux si manquant
    - a=end-of-candidates final si manquant
    """
    lines = sdp.splitlines()
    out = []

    for ln in lines:
        if ln.startswith("m="):
            parts = ln.split()
            if len(parts) >= 2:
                parts[1] = "9"  # discard port (WHIP style)
            ln = " ".join(parts)
        elif ln.startswith("c=IN IP4"):
            ln = "c=IN IP4 0.0.0.0"
        out.append(ln)

    sdp2 = "\r\n".join(out) + "\r\n"

    # setup:actpass
    if "a=setup:actpass" not in sdp2:
        sdp2 = sdp2.replace("t=0 0", "t=0 0\r\na=setup:actpass", 1)

    # group:BUNDLE avec les mids réels si disponibles
    mids = _extract_mids(sdp2)
    if "a=group:BUNDLE" not in sdp2:
        if mids:
            bundle_line = "a=group:BUNDLE " + " ".join(mids)
            sdp2 = sdp2.replace("t=0 0", f"t=0 0\r\n{bundle_line}", 1)
        else:
            # fallback minimal si aucun mid trouvé
            sdp2 = sdp2.replace("t=0 0", "t=0 0\r\na=group:BUNDLE 0", 1)

    # rtcp-mux global (certains serveurs l'acceptent aussi par m-line, ici on l'ajoute si absent)
    if "a=rtcp-mux" not in sdp2:
        sdp2 += "a=rtcp-mux\r\n"

    # Fin de candidates global
    if not sdp2.strip().endswith("a=end-of-candidates"):
        sdp2 += "a=end-of-candidates\r\n"

    return sdp2


# -----------------------------
# Viewer principal
# -----------------------------
async def whip_viewer(viewer_url: str, stun_url: str, turn_url: str = None, turn_user: str = None, turn_pass: str = None):
    start_time = time.time()

    # ICE servers (STUN + éventuellement TURN)
    ice_servers = [RTCIceServer(urls=stun_url)] if stun_url else []
    if turn_url:
        ice_servers.append(RTCIceServer(urls=turn_url, username=turn_user or "", credential=turn_pass or ""))

    config = RTCConfiguration(iceServers=ice_servers)
    pc = RTCPeerConnection(configuration=config)

    # Events pour synchronisation
    ice_done = asyncio.Event()

    # --------- Logs utiles ----------
    @pc.on("icegatheringstatechange")
    async def on_ice_gathering_change():
        print(f"[ICE] Gathering state = {pc.iceGatheringState}")
        if pc.iceGatheringState == "complete":
            ice_done.set()

    @pc.on("iceconnectionstatechange")
    async def on_ice_connection_change():
        print(f"[ICE] Connection state = {pc.iceConnectionState}")

    @pc.on("connectionstatechange")
    async def on_connection_change():
        print(f"[PC]  PeerConnection state = {pc.connectionState}")

    # ---------- Réception des tracks ----------
    @pc.on("track")
    async def on_track(track):
        print(f"[Viewer] ✅ Track reçu: kind={track.kind} (après {time.time() - start_time:.2f}s depuis lancement)")
        if track.kind != "video":
            return

        # Lancer la réception immédiatement (évite de rater les premières frames)
        async def reader():
            frame_count = 0
            print("[Viewer] 🎬 Démarrage lecture frames… (Ctrl+C pour quitter)")
            try:
                while not stop_flag.is_set():
                    frame = await track.recv()  # bloque jusqu'à frame
                    img = frame.to_ndarray(format="bgr24")
                    mean_color = img.mean(axis=(0, 1))
                    b, g, r = mean_color
                    if frame_count == 0:
                        print(f"[Viewer] ✅ Track reçu: (après {time.time() - start_time:.2f}s depuis lancement)")
                        

                    print(f"[Frame {frame_count:05d}] Mean BGR = ({b:.1f}, {g:.1f}, {r:.1f})")
                    frame_count += 1
            except Exception as e:
                print(f"⚠️  Erreur dans la boucle vidéo: {e}")
            finally:
                # Nettoyage local (fermeture PC gérée plus bas)
                print("🧹 Arrêt lecture frames")

        asyncio.create_task(reader())

        # (Optionnel - DEBUG SEULEMENT) Demande de keyframe côté publisher via PLI
        # Certains SFU/publishers envoient une keyframe seulement sur demande.
        # Les appels internes aiortc ne sont pas API publique: à activer ponctuellement.
        # try:
        #     await track._receiver._transport._rtcp_send_pli(track._ssrc)
        #     print("[RTP] PLI envoyé pour déclencher une keyframe")
        # except Exception:
        #     pass

    # ---------- Préparation de l'offre ----------
    print("[Viewer] Ajout transceiver (video recvonly)")
    t_video = pc.addTransceiver("video", direction="recvonly")

    # Prioriser VP8
    video_caps = RTCRtpSender.getCapabilities("video").codecs
    vp8_first = [c for c in video_caps if c.mimeType.lower() == "video/vp8"]
    others = [c for c in video_caps if c.mimeType.lower() != "video/vp8"]
    if vp8_first:
        t_video.setCodecPreferences(vp8_first + others)

    print("[Viewer] Création de l'offre…")
    offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    # Attendre la fin de la collecte ICE (fiable)
    await ice_done.wait()
    print("[ICE] Gathering complete ✅")

    # SDP final optimisé
    sdp = sanitize_sdp(pc.localDescription.sdp)

    # ---------- Envoi de l'offre (WHIP viewer endpoint) ----------
    print(f"➡️  POST SDP vers {viewer_url}")
    async with aiohttp.ClientSession() as session:
        async with session.post(
            viewer_url,
            data=sdp.encode("utf-8"),
            headers={"Content-Type": "application/sdp", "Accept": "application/sdp"},
        ) as resp:
            body = await resp.text()
            print(f"[HTTP] Statut = {resp.status}")
            if resp.status not in (200, 201):
                print("❌ Réponse serveur:\n", body)
                await pc.close()
                return
            await pc.setRemoteDescription(RTCSessionDescription(body, "answer"))
            print("✅ SDP answer reçue")

    # ---------- Attendre connexion ----------
    while pc.connectionState not in ("connected", "failed", "closed"):
        await asyncio.sleep(0.1)

    if pc.connectionState == "connected":
        print(f"🎥 Connecté (time-to-connected: {time.time() - start_time:.2f}s) — en attente de frames…")
    else:
        print("❌ Échec de connexion:", pc.connectionState)

    # ---------- Attente utilisateur ----------
    await stop_flag.wait()

    # ---------- Fermeture ----------
    if not pc.isClosed:
        await pc.close()
    print("✅ Fermeture propre effectuée.")


# -----------------------------
# Entrée CLI
# -----------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="WebRTC viewer (Go/Pion SFU) — faible latence d'initialisation")
    parser.add_argument("url", help="Endpoint viewer (ex: http://host:8090/viewer)")
    parser.add_argument("--stun", default="stun:stun.l.google.com:19302", help="URL STUN (par ex. stun:stun.l.google.com:19302)")
    parser.add_argument("--turn", default=None, help="URL TURN (par ex. turn:turn.example.com:3478)")
    parser.add_argument("--turn-user", default=None, help="TURN username")
    parser.add_argument("--turn-pass", default=None, help="TURN password")
    args = parser.parse_args()

    asyncio.run(whip_viewer(args.url, args.stun, args.turn, args.turn_user, args.turn_pass))
