# RTMP-HLS Docker

**Docker image for video streaming server that supports RTMP, HLS, and DASH streams.**


## Description

This Docker image can be used to create a video streaming server that supports [**RTMP**](https://en.wikipedia.org/wiki/Real-Time_Messaging_Protocol), [**HLS**](https://en.wikipedia.org/wiki/HTTP_Live_Streaming), [**DASH**](https://en.wikipedia.org/wiki/Dynamic_Adaptive_Streaming_over_HTTP) out of the box. 
It also allows adaptive streaming and custom transcoding of video streams.
The module is built from source on Alpine Linux base image.

## Features
 * The backend is [**Nginx**](http://nginx.org/en/) with [**nginx-rtmp-module**](https://github.com/arut/nginx-rtmp-module).
 * [**FFmpeg**](https://www.ffmpeg.org/) for transcoding and adaptive streaming.
 * Default settings: 
	* RTMP is ON
	* HLS is ON (adaptive, 5 variants)
	* DASH is ON 
	* Other Nginx configuration file is also provided to allow for no-FFmpeg transcoding. 
 * Statistic page of RTMP streams at `http://<server ip>:<server port>/stats`.
 * Available web video players (based on [video.js](https://videojs.com/) and [hls.js](https://github.com/video-dev/hls.js/)) at `/usr/local/nginx/html/players`. 

Current Image is built using:
 * Nginx 1.21.5 (compiled from source) (more recent versions of Nginx seems to have issues with stats page (pid 8))
 * Nginx-rtmp-module 1.2.2 (compiled from source)
 * FFmpeg 6.0 (compiled from source)

## Usage

### To build the image
```
docker build -t ochocast_rtmp_server .
```

### To run the server
```
docker run -d -p 1935:1935 -p 8080:8080 ochocast_rtmp_server
```
where `1935` is the RTMP port and `8080` is the HTTP port.


### To stream to the server
 * **Stream live RTMP content to:**
	```
	rtmp://<server ip>:1935/live/<stream_key>
	```
	where `<stream_key>` is any stream key you specify.

 * **Configure [OBS](https://obsproject.com/) to stream content:** <br />
Go to Settings > Stream, choose the following settings:
   * Service: Custom Streaming Server.
   * Server: `rtmp://<server ip>:1935/live`. 
   * Stream key: anything you want, however provided video players assume stream key is `test`

### To view the stream
 * **Using [VLC](https://www.videolan.org/vlc/index.html):**
	 * Go to Media > Open Network Stream.
	 * Enter the streaming URL: `rtmp://<server ip>:1935/live/<stream-key>`
	   Replace `<server ip>` with the IP of where the server is running, and
	   `<stream-key>` with the stream key you used when setting up the stream.
	 * For HLS and DASH, the URLs are of the forms: 
	 `http://<server ip>:8080/hls/<stream-key>.m3u8` and 
	 `http://<server ip>:8080/dash/<stream-key>_src.mpd` respectively.
	 * Click Play.

* **Using provided web players: (provided in the poc repo)** <br/>
The provided demo players assume the stream-key is called `test`. 
	* To play HLS content: `http://<server ip>:8080/players/hls.html`
	* To play HLS content using hls.js library: `http://<server ip>:8080/players/hls_hlsjs.html`
	* To play DASH content: `http://<server ip>:8080/players/dash.html`


## Copyright
Released under MIT license.

## deploy
rtmp recovery link: `rg.fr-par.scw.cloud/rtmp-server-images/ochocast_rtmp_server:latest`
