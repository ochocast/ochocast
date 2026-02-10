"""
Viewer adapté pour le mode distribué.
Basé sur benchmark/rework/viewer.py avec adaptations pour fonctionner sur un worker.
"""
import asyncio
import os
import time
import json
import aiohttp
import queue
import threading
from aiortc import (
    RTCPeerConnection,
    RTCSessionDescription,
    RTCConfiguration,
    RTCIceServer,
    RTCRtpSender,
)
from datetime import datetime
from red_frame_utils import (
    decode_sequence_simple,
    decode_sequence_diagonal,
    is_red_frame,
    get_encoding_info
)


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
    """Viewer pour le benchmark distribué - avec queue thread-safe pour les détections"""
    
    def __init__(
        self, 
        viewer_id: str,
        url: str, 
        stun_url: str = "stun:stun.l.google.com:19302",
        encoding_method: str = "simple",
        detection_queue_size: int = 100,
        active_detector: bool = True,
        downscale_size: int = None
    ):
        self.viewer_id = viewer_id
        self.url = url
        self.stun_url = stun_url
        self.stop_event = None
        self.pc = None
        
        # Encoding configuration
        if encoding_method not in ["simple", "diagonal"]:
            raise ValueError(f"encoding_method must be 'simple' or 'diagonal', got '{encoding_method}'")
        self.encoding_method = encoding_method
        self.encoding_info = get_encoding_info(encoding_method)
        
        # Queue thread-safe pour les détections
        self.detection_queue = queue.Queue(maxsize=detection_queue_size)
        
        # Première frame
        self.first_frame_received = False
        self.first_frame_timestamp = None
        
        # Red detection tracking
        self.frame_count = 0
        self.red_detections_count = 0
        self.dropped_detections = 0
        self.start_time = None
        
        # Recent detections for duplicate prevention (keep last 10)
        self._recent_detections = []

        # End/exit info
        self.end_time = None
        self.exit_error = False
        self.exit_reason = None
        
        # Status
        self.connected = False
        self.running = False
        
        # Performance tuning
        self.active_detector = bool(active_detector)
        self.downscale_size = int(downscale_size) if downscale_size and downscale_size > 0 else None
        
        print(f"[Viewer {self.viewer_id}] 🎯 Mode: {'ACTIF' if self.active_detector else 'PASSIF'}, Downscale: {self.downscale_size if self.downscale_size else 'FULL'}")

    def detect_and_decode_red_frame(self, img, timestamp):
        """
        Détecte et décode une frame rouge selon la méthode d'encodage configurée.
        
        Returns:
            dict ou None: Detection info si frame rouge détectée et valide, None sinon
        """
        # 1. Extraire la couleur moyenne (BGR format from aiortc)
        mean_color = img.mean(axis=(0, 1))  # BGR
        b, g, r = mean_color
        
        # Convertir en int pour les fonctions d'encodage
        r_int, g_int, b_int = int(round(r)), int(round(g)), int(round(b))
        
        # 2. Vérifier si c'est une frame rouge
        if not is_red_frame(r_int, g_int, b_int):
            return None
        
        # 3. Décoder selon la méthode
        sequence_number = None
        is_valid = False
        
        try:
            if self.encoding_method == "simple":
                sequence_number = decode_sequence_simple(r_int, g_int, b_int)
                is_valid = True  # Simple encoding n'a pas de validation
            else:  # diagonal
                sequence_number, is_valid = decode_sequence_diagonal(r_int, g_int, b_int)
        except ValueError as e:
            # Frame rouge mais invalide (ne devrait pas arriver avec is_red_frame)
            print(f"[Viewer {self.viewer_id}] ⚠️ Red frame decode error: {e}")
            return None
        
        # 4. Validation supplémentaire du numéro de séquence
        if sequence_number is None or sequence_number < 0:
            return None
        
        max_seq = self.encoding_info['max_sequence']
        if sequence_number > max_seq:
            print(f"[Viewer {self.viewer_id}] ⚠️ Sequence {sequence_number} exceeds max {max_seq}")
            return None
        
        # 5. Créer l'objet de détection
        detection = {
            'timestamp': timestamp,
            'sequence_number': sequence_number,
            'is_valid': is_valid,
            'viewer_id': self.viewer_id,
            'rgb': (r_int, g_int, b_int),
            'relative_time': timestamp - self.start_time if self.start_time else 0,
            'frame_number': self.frame_count,
            'encoding_method': self.encoding_method
        }
        
        return detection
    
    def is_duplicate_detection(self, detection):
        """
        Vérifie si une détection est un doublon récent.
        Compare avec les 10 dernières détections.
        """
        for recent in self._recent_detections[-10:]:
            if recent['sequence_number'] == detection['sequence_number']:
                time_diff = abs(detection['timestamp'] - recent['timestamp'])
                if time_diff < 0.1:  # Moins de 100ms d'écart = doublon
                    return True
        return False
    
    def enqueue_detection(self, detection):
        """
        Ajoute une détection à la queue (non-bloquant, drop oldest si pleine).
        """
        # Vérifier les doublons
        if self.is_duplicate_detection(detection):
            print(f"[Viewer {self.viewer_id}] ⏭️  Duplicate detection ignored (Seq: {detection['sequence_number']})")
            return
        
        # Ajouter aux récentes pour la détection de doublons
        self._recent_detections.append(detection)
        if len(self._recent_detections) > 10:
            self._recent_detections.pop(0)
        
        # Tenter d'ajouter à la queue
        try:
            self.detection_queue.put_nowait(detection)
            self.red_detections_count += 1
            
            valid_str = "✓" if detection['is_valid'] else "✗"
            print(f"[Viewer {self.viewer_id}] 🔴 RED detected (Seq: {detection['sequence_number']}, Valid: {valid_str}) at {detection['timestamp']:.6f}")
        except queue.Full:
            # Queue pleine - drop oldest et réessayer
            try:
                dropped = self.detection_queue.get_nowait()
                self.dropped_detections += 1
                print(f"[Viewer {self.viewer_id}] ⚠️ Queue full! Dropped detection (Seq: {dropped['sequence_number']})")
                
                # Réessayer
                self.detection_queue.put_nowait(detection)
                self.red_detections_count += 1
            except:
                self.dropped_detections += 1
                print(f"[Viewer {self.viewer_id}] ⚠️ Failed to enqueue detection even after drop")
    
    def get_status(self) -> dict:
        """Retourne le statut actuel du viewer"""
        return {
            'viewer_id': self.viewer_id,
            'connected': self.connected,
            'running': self.running,
            'frame_count': self.frame_count,
            'red_detections': self.red_detections_count,
            'first_frame_received': self.first_frame_received,
            'first_frame_timestamp': self.first_frame_timestamp,
            'queue_size': self.detection_queue.qsize(),
            'dropped_detections': self.dropped_detections,
            'encoding_method': self.encoding_method,
            'exit_error': self.exit_error,
            'active_detector': self.active_detector,
            'downscale_size': self.downscale_size
        }
    
    def set_active(self, active: bool):
        """Change le mode actif/passif du viewer"""
        old_mode = self.active_detector
        self.active_detector = active
        print(f"[Viewer {self.viewer_id}] 🔄 Mode changed: {'ACTIF' if old_mode else 'PASSIF'} → {'ACTIF' if active else 'PASSIF'}")
    
    def get_detection(self, block=False, timeout=None):
        """
        Récupère une détection de la queue.
        
        Args:
            block: Si True, bloque jusqu'à ce qu'une détection soit disponible
            timeout: Timeout en secondes si block=True
            
        Returns:
            dict ou None: Detection ou None si queue vide (mode non-bloquant)
            
        Raises:
            queue.Empty: Si timeout dépassé en mode bloquant
        """
        try:
            return self.detection_queue.get(block=block, timeout=timeout)
        except queue.Empty:
            if block:
                raise
            return None
    
    def get_all_detections(self):
        """
        Récupère toutes les détections disponibles dans la queue.
        Non-bloquant.
        
        Returns:
            list: Liste des détections
        """
        detections = []
        while True:
            try:
                detection = self.detection_queue.get_nowait()
                detections.append(detection)
            except queue.Empty:
                break
        return detections

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
                    
                    # Première frame
                    if not self.first_frame_received:
                        self.first_frame_received = True
                        self.first_frame_timestamp = time.time()
                        print(f"[Viewer {self.viewer_id}] 🎬 First frame received at {self.first_frame_timestamp:.6f}")

                    self.frame_count += 1
                    timestamp = time.time()

                    # Si viewer PASSIF: consommer la frame sans traitement (simule charge serveur)
                    if not self.active_detector:
                        # Pause coopérative pour l'event loop tous les 100 frames
                        if self.frame_count % 100 == 0:
                            await asyncio.sleep(0)
                        continue

                    # Viewer ACTIF: traiter la frame avec downscaling si configuré
                    try:
                        if self.downscale_size:
                            # Downscale pour réduire CPU (1x1 = juste couleur moyenne)
                            small = frame.reformat(width=self.downscale_size, height=self.downscale_size)
                            img = small.to_ndarray(format="bgr24")
                        else:
                            # Full resolution
                            img = frame.to_ndarray(format="bgr24")
                    except Exception as e:
                        # Fallback: conversion full si reformat échoue
                        print(f"[Viewer {self.viewer_id}] ⚠️ Reformat failed, using full: {e}")
                        img = frame.to_ndarray(format="bgr24")
                    
                    # Détecter et décoder frame rouge
                    detection = self.detect_and_decode_red_frame(img, timestamp)
                    if detection:
                        self.enqueue_detection(detection)
                    
                    # Log every 300 frames for monitoring
                    if self.frame_count % 300 == 0:
                        queue_size = self.detection_queue.qsize()
                        print(f"[Viewer {self.viewer_id}] Frame {self.frame_count:05d} - {self.red_detections_count} reds, queue: {queue_size}")

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
