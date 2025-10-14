# Simple SFU Server with WHIP Support

This project implements a simple Selective Forwarding Unit (SFU) WebRTC server using Pion WebRTC in Go.

## Run

Lauch the Scaleway instance and connect via SSH.

Build the server:
```bash
go build -o server.exe
```

Run the server:
```bash
./server.exe
```

## Host

Open OBS, the minimum version is 31.X.XX

Go to Settings -> Stream, select "WHIP" as the service, and enter the server URL:

```
http://<scaleway-server-ip>:8090/whip
```