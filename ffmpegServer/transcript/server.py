"""Whisper worker: load once per VM boot, stream signed audio URLs to disk."""
import hmac
import json
import logging
import os
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from urllib.request import build_opener, HTTPRedirectHandler

LOG = logging.getLogger("transcript")
MODEL = None
BUSY = threading.Lock()


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def download_audio(url, destination):
    parsed = urlsplit(url)
    allowed = set(os.environ.get("TRANSCRIPT_ALLOWED_AUDIO_HOSTS", "").split(","))
    if parsed.hostname not in allowed or parsed.username or parsed.password:
        raise ValueError("Audio host is not allowed")
    protocols = {"https"} if os.environ.get("NODE_ENV") == "production" else {"https", "http"}
    if parsed.scheme not in protocols:
        raise ValueError("Audio URL must use HTTPS in production")
    maximum = int(os.environ.get("TRANSCRIPT_MAX_AUDIO_BYTES", str(512 * 1024 * 1024)))
    total = 0
    with build_opener(NoRedirect).open(url, timeout=60) as response:
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            if total > maximum:
                raise ValueError("Audio exceeds the configured limit")
            destination.write(chunk)


def transcribe(audio_url, language):
    with tempfile.NamedTemporaryFile(suffix=".wav") as audio:
        download_audio(audio_url, audio)
        audio.flush()
        segments, info = MODEL.transcribe(
            audio.name, language=language, vad_filter=True,
            condition_on_previous_text=False,
        )
        cues = [
            {"start": float(s.start), "end": float(s.end), "text": s.text.strip()}
            for s in segments if s.text.strip()
        ]
        return {"text": " ".join(s["text"] for s in cues),
                "language": info.language, "duration": info.duration, "segments": cues}


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200 if MODEL is not None else 503, {"ready": MODEL is not None})
        else:
            self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/v1/audio/transcriptions":
            self.send_json(404, {"error": "Not found"})
            return
        key = os.environ.get("TRANSCRIPT_API_KEY", "")
        if not key or not hmac.compare_digest(self.headers.get("Authorization", ""), f"Bearer {key}"):
            self.send_json(401, {"error": "Unauthorized"})
            return
        if MODEL is None:
            self.send_json(503, {"error": "Model is loading"})
            return
        if not BUSY.acquire(blocking=False):
            self.send_json(409, {"error": "Worker is busy"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 16_384:
                raise ValueError("Expected a small JSON request")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload.get("audio_url"), str):
                raise ValueError("audio_url is required")
            self.send_json(200, transcribe(payload["audio_url"], payload.get("language", "fr")))
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
        except Exception:
            # Do not log signed URLs or Authorization headers.
            LOG.error("Transcription failed")
            self.send_json(500, {"error": "Transcription failed"})
        finally:
            BUSY.release()


def load_model():
    global MODEL
    from faster_whisper import WhisperModel
    device = os.environ.get("WHISPER_DEVICE", "cpu")
    model = WhisperModel(
        os.environ.get("LOCAL_WHISPER_MODEL", "small"), device=device,
        compute_type=os.environ.get("WHISPER_COMPUTE_TYPE", "float16" if device == "cuda" else "int8"),
        download_root=os.environ.get("WHISPER_MODEL_CACHE", "/models"),
    )
    # Exercise the inference path before health becomes ready (checks CUDA/cuDNN).
    import numpy as np
    segments, _ = model.transcribe(np.zeros(16_000, dtype=np.float32), language="fr", vad_filter=False)
    list(segments)
    MODEL = model
    LOG.info("Whisper model ready on %s", device)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    if len(os.environ.get("TRANSCRIPT_API_KEY", "")) < 32:
        raise SystemExit("Set TRANSCRIPT_API_KEY to at least 32 characters")
    if not os.environ.get("TRANSCRIPT_ALLOWED_AUDIO_HOSTS"):
        raise SystemExit("Set TRANSCRIPT_ALLOWED_AUDIO_HOSTS")
    # HTTP health responds 503 during loading so the backend can wait for readiness.
    threading.Thread(target=load_model, daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("TRANSCRIPT_PORT", "8080"))), Handler)
    server.serve_forever()
