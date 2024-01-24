import React, {FC} from "react";

/* eslint-disable */

type Settings = {
    format: string,
    video: string,
    audio: string,
}

const getRecorderSettings = () => {
    const settings : Settings = {format: '', video: '', audio: ''};
    if (MediaRecorder.isTypeSupported('video/mp4')) {
      settings.format = 'mp4';
      settings.video = 'h264';
      settings.audio = 'aac';
    } else {
      settings.format = 'webm';
      settings.audio = 'opus';
      settings.video = MediaRecorder.isTypeSupported('video/webm;codecs=h264') ? 'h264' : 'vp8';
    }
    return settings;
};

const getRecorderMimeType = () => {
  const settings = getRecorderSettings();
  const codecs = settings.format === 'webm' ? `;codecs="${settings.video}, ${settings.audio}"` : '';
  return `video/${settings.format}${codecs}`;
};

export interface LiveStreamProps {
    streamKey: string;

};

const LiveStream : FC<LiveStreamProps> = ({streamKey}) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const videoRef = React.useRef<HTMLVideoElement>(null);
    const requestAnimationRef = React.useRef(0);
  
    const [preview, setPreview]= React.useState(false);
    const [streaming, setStreaming] = React.useState(false);
    const [wsConnected, setWsConnected] = React.useState(false);
    
    const serverIP = process.env.REACT_APP_SERVER_IP;
  
    const previewStream = async (): Promise<void> => {
      if (preview || !videoRef || !videoRef.current) return; //MAY BE SHITING IN THE FUTURE
      //GET SCREEN INPUT
      const screenInput = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
      videoRef.current.srcObject = screenInput;
      //GET CAMERA INPUT
      //const cameraInput = await navigator.mediaDevices.getUserMedia({ video: true });
      //videoRef.current.srcObject = cameraInput;
  
      await videoRef.current.play();
      setPreview(true);
      requestAnimationRef.current = requestAnimationFrame(updateCanva);
    };
  
    const updateCanva = () : void => {
      if(videoRef.current?.ended || videoRef.current?.paused || !canvasRef.current || !videoRef.current) return;
      canvasRef.current.height = videoRef.current.clientHeight;
      canvasRef.current.width = videoRef.current.clientWidth;
  
      const ctx = canvasRef.current?.getContext('2d');
      ctx?.drawImage(
        videoRef.current,
        0,
        0,
        videoRef.current?.clientWidth,
        videoRef.current?.clientHeight
      );
      requestAnimationRef.current = requestAnimationFrame(updateCanva);
  
    };
  
    const stopStreaming = (): void => {
      setPreview(false);
      setStreaming(false);
      videoRef.current?.pause();
    };
  
    const startStreaming = (): void => {
      setStreaming(true);
      const settings : Settings = getRecorderSettings();

      //Setting up ws url with all params
      const wsUrl = new URL(`ws://${serverIP}/rtmp`);
      wsUrl.searchParams.set('video', settings.video);
      wsUrl.searchParams.set('audio', settings.audio);
      wsUrl.searchParams.set('url', '');
      wsUrl.searchParams.set('key', streamKey);

      const ws = new WebSocket(wsUrl);
  
      ws.addEventListener('open', () => {
        setWsConnected(true);        
      });
  
      ws.addEventListener('close', () => {
        setWsConnected(false);
        stopStreaming();        
      });
  
      const canvas = document.getElementById("canvas") as HTMLCanvasElement;
      const mediaStream = canvas.captureStream(30);
      const mediaRecorder = new MediaRecorder(mediaStream,{mimeType: getRecorderMimeType(),videoBitsPerSecond: 3000000});
      
      mediaRecorder.addEventListener('dataavailable', event => {ws.send(event.data);});
      mediaRecorder.addEventListener('stop', () => {stopStreaming();});
      mediaRecorder.start(1000);
    };

    return (
        <div>
            <div>{
                !streaming ?
                <>
                <button onClick={previewStream}>Preview</button>
                <button onClick={startStreaming}>Start Streaming</button>
                </>
                :
                <button onClick={stopStreaming}>Stop Streaming</button> 
              }
            </div>
            <div>
                <video ref={videoRef} height="400px" width="800px" muted autoPlay></video>
                <canvas ref={canvasRef} id="canvas" ></canvas>
            </div>
        </div>
    );
};

export default LiveStream;