# RTMP Server
## Docker RTMP-HLS

**Docker image for a video streaming server supporting RTMP, HLS and DASH out of the box.**

## Description

This Docker image can be used to build a video streaming server supporting [**RTMP**](https://en.wikipedia.org/wiki/Real-Time_Messaging_Protocol), [**HLS**](https://en.wikipedia.org/wiki/HTTP_Live_Streaming) and [**DASH**](https://en.wikipedia.org/wiki/Dynamic_Adaptive_Streaming_over_HTTP) immediately. It also supports adaptive streaming and custom transcoding.
The module is built from source on an Alpine Linux base image.

## Features

* Backend is [**Nginx**](http://nginx.org/) with the [**nginx-rtmp-module**](https://github.com/arut/nginx-rtmp-module).
* [**FFmpeg**](https://www.ffmpeg.org/) for transcoding and adaptive streaming.
* Default settings:
  * RTMP enabled
  * HLS enabled (adaptive, 5 variants)
  * DASH enabled
  * An alternate Nginx configuration is provided to allow streaming without FFmpeg transcoding.
* RTMP stats page available at `http://<server_ip>:<server_port>/stats`.
* Web video players included (based on [video.js](https://videojs.com/) and [hls.js](https://github.com/video-dev/hls.js/)) in `/usr/local/nginx/html/players`.

The current image is built with:
* Nginx 1.21.5 (compiled from source)
* nginx-rtmp-module 1.2.2 (compiled from source)
* FFmpeg 6.0 (compiled from source)

## Usage

### Build the image
```
docker build -t octocast_rtmp_server .
```

### Run the server
```
docker run -d -p 1935:1935 -p 8080:8080 octocast_rtmp_server
```
where `1935` is the RTMP port and `8080` is the HTTP port.

### Stream to the server

* **Publish an RTMP stream to:**
```
rtmp://<server ip>:1935/live/<stream_key>
```
where `<stream_key>` is the stream key you choose.

* **Configure [OBS](https://obsproject.com/) to stream:**
Go to Settings > Stream and use:
* Service: Custom Streaming Server
* Server: `rtmp://<server_ip>:1935/live`
* Stream key: any value (demo players assume `test` as the stream key)

### Play the stream
* **With [VLC](https://www.videolan.org/vlc/):**
  - Open Media > Open Network Stream.
  - Enter: `rtmp://<server_ip>:1935/live/<stream-key>`
* For HLS and DASH the URLs are:
  `http://<server_ip>:8080/hls/<stream-key>.m3u8` and
  `http://<server_ip>:8080/dash/<stream-key>_src.mpd`

* **Using the included web players (demo):**
  - HLS: `http://<server_ip>:8080/players/hls.html`
  - HLS with hls.js: `http://<server_ip>:8080/players/hls_hlsjs.html`
  - DASH: `http://<server_ip>:8080/players/dash.html`

## License
Published under the MIT license.

## Deployment
RTMP image registry: `rg.fr-par.scw.cloud/rtmp-server-images/octocast_rtmp_server:latest`
