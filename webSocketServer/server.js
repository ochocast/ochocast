import logger from "../frontend/utils/logger";

const WebSocketServer = require("ws").Server;
const child_process = require("child_process");
const url = require("url");

const port = 8081;
const transcode = process.env.SMART_TRANSCODE || true;

const wss = new WebSocketServer({
  port: port,
});

wss.on("connection", (ws, req) => {
  logger.info("Streaming socket connected");
  ws.send("Socket Connected");

  const queryString = url.parse(req.url).search;
  const params = new URLSearchParams(queryString);
  const key = params.get("key");
  const rtmpUrl = "rtmp://51.15.220.120:1935/live/" + key;
  const video = params.get("video");
  const audio = params.get("audio");

  //const rtmpUrl = `${baseUrl}/${key}`;

  const videoCodec =
    video === "h264" && !transcode
      ? ["-c:v", "copy"]
      : // video codec config: low latency, adaptive bitrate
        [
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-tune",
          "zerolatency",
          "-vf",
          "scale=w=-2:0",
        ];

  const audioCodec =
    audio === "aac" && !transcode
      ? ["-c:a", "copy"]
      : // audio codec config: sampling frequency (11025, 22050, 44100)
        ["-c:a", "aac", "-ar", "44100"]; //, '-b:a', '64k' to adjust bitrate

  const ffmpeg = child_process.spawn("ffmpeg", [
    "-i",
    "-",

    //force to overwrite
    "-y",

    // used for audio sync
    "-use_wallclock_as_timestamps",
    "1",
    "-async",
    "1",

    ...videoCodec,

    ...audioCodec,
    //'-filter_complex', 'aresample=44100', // resample audio to 44100Hz, needed if input is not 44100
    //'-strict', 'experimental',
    "-bufsize",
    "1000",
    "-f",
    "flv",

    rtmpUrl,
  ]);

  // Kill the WebSocket connection if ffmpeg dies.
  ffmpeg.on("close", (code, signal) => {
    logger.info(
      "FFmpeg child process closed, code " + code + ", signal " + signal
    );
    ws.terminate();
  });

  // Handle STDIN pipe errors by logging to the console.
  // These errors most commonly occur when FFmpeg closes and there is still
  // data to write.f If left unhandled, the server will crash.
  ffmpeg.stdin.on("error", (e) => {
    logger.info("FFmpeg STDIN Error", e);
  });

  // FFmpeg outputs all of its messages to STDERR. Let's log them to the console.
  ffmpeg.stderr.on("data", (data) => {
    ws.send("ffmpeg got some data");
    logger.info("FFmpeg STDERR:", data.toString());
  });

  ws.on("message", (msg) => {
    if (Buffer.isBuffer(msg)) {
      logger.info("this is some video data");
      ffmpeg.stdin.write(msg);
    } else {
      logger.info(msg);
    }
  });

  ws.on("close", (e) => {
    logger.info("Websocket connection closed");
    ffmpeg.kill("SIGINT");
  });
});
logger.info("The websocket is listening to port 8081");
