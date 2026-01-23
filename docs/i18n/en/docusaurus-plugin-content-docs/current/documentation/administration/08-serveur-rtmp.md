# RTMP Server
## Docker RTMP-HLS

**Docker image for video streaming server that supports RTMP, HLS and DASH streams.**

## Description

This Docker image can be used to create a video streaming server supporting [**RTMP**](https://en.wikipedia.org/wiki/Real-Time_Messaging_Protocol), [**HLS**](https://en.wikipedia.org/wiki/HTTP_Live_Streaming), [**DASH**](https://en.wikipedia.org/wiki/Dynamic_Adaptive_Streaming_over_HTTP) streams out of the box. It also allows adaptive streaming and custom transcoding of video streams.
The module is built from source code on an Alpine Linux base image.

## Features

* The backend is [**Nginx**](http://nginx.org/en/) with the [**nginx-rtmp-module**](https://github.com/arut/nginx-rtmp-module).
* [**FFmpeg**](https://www.ffmpeg.org/) for transcoding and adaptive streaming.
* Default settings:
  * RTMP enabled
  * HLS enabled (adaptive, 5 variants)
  * DASH enabled
  * Another Nginx configuration file is also provided to allow streaming without transcoding via FFmpeg.
* RTMP stream statistics page accessible at `http://<server_ip>:<server_port>/stats`.
* Web video players available (based on [video.js](https://videojs.com/) and [hls.js](https://github.com/video-dev/hls.js/)) in `/usr/local/nginx/html/players`.

The current image is built with:
* Nginx 1.21.5 (compiled from source) (newer versions of Nginx seem to have issues with the stats page (pid 8))
* Nginx-rtmp-module 1.2.2 (compiled from source)
* FFmpeg 6.0 (compiled from source)

## Usage

### To build the image
```
docker build -t octocast_rtmp_server .
```

### To run the server
```
docker run -d -p 1935:1935 -p 8080:8080 octocast_rtmp_server
```
where `1935` is the RTMP port and `8080` is the HTTP port.

### To stream to the server
 * **Stream live RTMP content to:**
	```
	rtmp://<server ip>:1935/live/<stream_key>
	```
	where `<stream_key>` is the stream key you specify.

 * **Configure [OBS](https://obsproject.com/) to stream content:** <br />
Go to Settings > Stream, choose the following settings:
* Service: Custom Streaming Server.
* Server: `rtmp://<server_ip>:1935/live`. 
* Stream key: choose what you want, however the provided video players assume the stream key is `test`.

### To view the stream
* **With [VLC](https://www.videolan.org/vlc/index.html):**
* Go to Media > Open Network Stream.
* Enter the stream URL: `rtmp://<server_ip>:1935/live/<stream-key>`
  Replace `<server_ip>` with the server's IP address, and `<stream-key>` with the stream key you used to configure the stream.
* For HLS and DASH, the URLs are in the forms:  
  `http://<server_ip>:8080/hls/<stream-key>.m3u8` and  
  `http://<server_ip>:8080/dash/<stream-key>_src.mpd` respectively.
* Click Play.

* **With the provided web players: (provided in the poc repo)**  
The demo players assume the stream key is called `test`.  
* To play HLS content: `http://<server_ip>:8080/players/hls.html`
* To play HLS content with hls.js library: `http://<server_ip>:8080/players/hls_hlsjs.html`
* To play DASH content: `http://<server_ip>:8080/players/dash.html`

## Copyright
Published under the MIT license.

## Deployment
RTMP retrieval link: `rg.fr-par.scw.cloud/rtmp-server-images/octocast_rtmp_server:latest`
