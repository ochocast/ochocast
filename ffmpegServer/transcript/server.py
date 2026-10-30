"""Whisper worker: load once per VM boot, stream signed audio URLs to disk."""
import hmac
import json
import logging
import os
import re
import tempfile
import threading
from http.client import HTTPException
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import build_opener, HTTPRedirectHandler

LOG = logging.getLogger("transcript")
MODEL = None
MODEL_FAILED = False
# An invalid setting found at startup. /health reports it, so the backend fails
# its batch at once and names it, instead of waiting for a worker that exits.
CONFIG_ERROR = None
BUSY = threading.Lock()


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Refused(Exception):
    """Answered with its own status. The backend counts every failure against
    the video, but continues its batch only after 413, 422 or 500, the
    failures caused by this audio: other refusals hit every video alike."""

    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def max_audio_bytes():
    """The download limit; checked at startup, so a bad value never answers 500
    per request."""
    value = os.environ.get("TRANSCRIPT_MAX_AUDIO_BYTES", str(512 * 1024 * 1024))
    if not re.fullmatch(r"[1-9][0-9]*", value):
        raise ValueError("TRANSCRIPT_MAX_AUDIO_BYTES must be a positive integer")
    return int(value)


def download_audio(url, destination):
    parsed = urlsplit(url)
    allowed = set(os.environ.get("TRANSCRIPT_ALLOWED_AUDIO_HOSTS", "").split(","))
    if parsed.hostname not in allowed or parsed.username or parsed.password:
        raise Refused(403, "Audio host is not allowed")
    protocols = {"https"} if os.environ.get("NODE_ENV") == "production" else {"https", "http"}
    if parsed.scheme not in protocols:
        raise Refused(403, "Audio URL must use HTTPS in production")
    maximum = max_audio_bytes()
    total = 0
    try:
        with build_opener(NoRedirect).open(url, timeout=60) as response:
            # Parsed like http.client does (surrounding spaces allowed).
            try:
                expected = int(response.headers.get("Content-Length", ""))
            except ValueError:
                expected = None
            if expected is not None and expected > maximum:
                raise Refused(413, "Audio exceeds the configured limit")
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > maximum:
                    raise Refused(413, "Audio exceeds the configured limit")
                destination.write(chunk)
            # http.client ends a body closed early without an error.
            if expected is not None and total != expected:
                raise Refused(502, "Audio download was truncated")
    except HTTPError as error:
        # A missing object is this video's; any other answer is the storage's.
        raise Refused(422 if error.code == 404 else 502,
                      f"Audio download failed (HTTP {error.code})") from None
    except (OSError, HTTPException) as error:
        raise Refused(502, f"Audio download failed ({type(error).__name__})") from None


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
            failed = MODEL_FAILED or CONFIG_ERROR is not None
            body = {"ready": MODEL is not None, "failed": failed}
            if CONFIG_ERROR:
                body["error"] = CONFIG_ERROR
            self.send_json(500 if failed else 200 if MODEL is not None else 503, body)
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
            self.send_json(503, {"error": CONFIG_ERROR or "Model is loading"})
            return
        if not BUSY.acquire(blocking=False):
            self.send_json(409, {"error": "Worker is busy"})
            return
        try:
            # Only a malformed request is a 400: decoding errors of the audio
            # itself, PyAV's included, are ValueErrors too and answer 500.
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length < 1 or length > 16_384:
                    raise ValueError("Expected a small JSON request")
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict) or not isinstance(payload.get("audio_url"), str):
                    raise ValueError("audio_url is required")
            except ValueError as error:
                self.send_json(400, {"error": str(error)})
                return
            self.send_json(200, transcribe(payload["audio_url"], payload.get("language", "fr")))
        except Refused as error:
            # Refusal messages never contain the signed URL.
            LOG.warning("Transcription refused (%s): %s", error.status, error)
            self.send_json(error.status, {"error": str(error)})
        except Exception as error:
            # Do not log signed URLs or Authorization headers.
            LOG.error("Transcription failed (%s)", type(error).__name__)
            self.send_json(500, {"error": "Transcription failed"})
        finally:
            BUSY.release()


def load_model():
    global MODEL, MODEL_FAILED
    try:
        _load_model()
    except Exception:
        MODEL_FAILED = True
        LOG.exception("Whisper model initialization failed")


def _load_model():
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
    try:
        max_audio_bytes()
    except ValueError as error:
        CONFIG_ERROR = str(error)
        LOG.error("%s", CONFIG_ERROR)
    else:
        # HTTP health responds 503 during loading so the backend can wait for readiness.
        threading.Thread(target=load_model, daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("TRANSCRIPT_PORT", "8080"))), Handler)
    server.serve_forever()
