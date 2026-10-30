"""Status contract with the backend: python3 -m unittest discover -s ffmpegServer/transcript"""
import io
import json
import os
import socket
import subprocess
import sys
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

os.environ["TRANSCRIPT_API_KEY"] = "k" * 32
import server  # noqa: E402


class Storage(BaseHTTPRequestHandler):
    """Answers like S3, plus the failures a download can meet."""

    def log_message(self, *args):
        pass

    def do_GET(self):
        status = {"/missing": 404, "/broken": 500}.get(self.path, 200)
        # Announced lengths that the 8-byte body does not match.
        announced = {"/big": "64", "/truncated": "20", "/spaced": "20 "}
        body = b"x" * (64 if self.path == "/unsized" else 8)
        self.send_response(status)
        if self.path in announced:
            self.send_header("Content-Length", announced[self.path])
        elif self.path != "/unsized":
            self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class Segment:
    start, end, text = 0.0, 1.0, " Bonjour "


class Info:
    language, duration = "fr", 1.0


class Model:
    error = None

    def transcribe(self, *args, **kwargs):
        if self.error:
            raise self.error
        return iter([Segment()]), Info()


def serve(handler):
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.storage = serve(Storage)
        cls.api = serve(server.Handler)
        cls.base = f"http://127.0.0.1:{cls.storage.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.storage.shutdown()
        cls.api.shutdown()

    def setUp(self):
        os.environ["TRANSCRIPT_ALLOWED_AUDIO_HOSTS"] = "127.0.0.1"
        os.environ["TRANSCRIPT_MAX_AUDIO_BYTES"] = "32"
        os.environ.pop("NODE_ENV", None)
        server.MODEL = Model()

    def download(self, path):
        try:
            server.download_audio(self.base + path, io.BytesIO())
            return 200
        except server.Refused as error:
            return error.status

    def post(self, body, base=None):
        base = base or f"http://127.0.0.1:{self.api.server_port}"
        request = urllib.request.Request(
            f"{base}/v1/audio/transcriptions",
            data=body, method="POST",
            headers={"Authorization": "Bearer " + "k" * 32})
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.load(error)

    def test_download_refusals_carry_their_cause(self):
        self.assertEqual(self.download("/ok"), 200)
        self.assertEqual(self.download("/missing"), 422)
        self.assertEqual(self.download("/broken"), 502)
        # Refused from its announced length, before reading the body.
        self.assertEqual(self.download("/big"), 413)
        self.assertEqual(self.download("/unsized"), 413)
        self.assertEqual(self.download("/truncated"), 502)
        self.assertEqual(self.download("/spaced"), 502)
        os.environ["TRANSCRIPT_ALLOWED_AUDIO_HOSTS"] = "storage.test"
        self.assertEqual(self.download("/ok"), 403)

    def test_audio_limit_must_be_a_positive_integer(self):
        for value in ["", "0", "-1", "5e8", "512MiB", "536870912.0", "²"]:
            os.environ["TRANSCRIPT_MAX_AUDIO_BYTES"] = value
            with self.assertRaises(ValueError, msg=value):
                server.max_audio_bytes()
        os.environ["TRANSCRIPT_MAX_AUDIO_BYTES"] = "536870912"
        self.assertEqual(server.max_audio_bytes(), 536870912)

    def test_a_bad_limit_is_reported_by_health_at_startup(self):
        # Started as in the image: the backend reads /health before sending any
        # audio, so its batch fails at once, naming the setting, and no request
        # answers 500.
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        worker = subprocess.Popen(
            [sys.executable, "-B", "server.py"],
            cwd=os.path.dirname(os.path.abspath(server.__file__)),
            env=dict(os.environ, TRANSCRIPT_MAX_AUDIO_BYTES="512MiB",
                     TRANSCRIPT_PORT=str(port)),
            stderr=subprocess.DEVNULL)
        self.addCleanup(worker.wait, 5)
        self.addCleanup(worker.terminate)
        base = f"http://127.0.0.1:{port}"
        for _ in range(100):
            try:
                urllib.request.urlopen(base + "/health", timeout=1).close()
                self.fail("/health must not be ready")
            except urllib.error.HTTPError as error:
                health = error.code, json.load(error)
                error.close()
                break
            except OSError:
                time.sleep(0.05)
        else:
            self.fail("the worker did not start")
        self.assertEqual(health, (500, {
            "ready": False, "failed": True,
            "error": "TRANSCRIPT_MAX_AUDIO_BYTES must be a positive integer"}))
        self.assertEqual(self.post(b"{}", base)[0], 503)

    def test_only_a_malformed_request_is_a_400(self):
        self.assertEqual(self.post(b"[]")[0], 400)
        self.assertEqual(self.post(b'{"audio_url": 1}')[0], 400)
        status, body = self.post(json.dumps({"audio_url": self.base + "/ok"}).encode())
        self.assertEqual((status, body["text"]), (200, "Bonjour"))

    def test_undecodable_audio_is_a_500(self):
        # PyAV's InvalidDataError subclasses ValueError.
        server.MODEL.error = type("InvalidDataError", (ValueError,), {})("bad")
        status, _ = self.post(json.dumps({"audio_url": self.base + "/ok"}).encode())
        self.assertEqual(status, 500)


if __name__ == "__main__":
    unittest.main()
