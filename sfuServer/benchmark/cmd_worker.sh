apt update
apt install python3-websockets python3-aiohttp python3-aiortc -y
nano .ssh/deploy
chmod 600 ~/.ssh/deploy
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/deploy
git clone git@github.com:ochocast/ochocast-webapp.git
cd ochocast-webapp
git checkout feat/sfu-benchmark
cd sfuServer/benchmark/
python3 worker.py --host-ws ws://0.tcp.eu.ngrok.io:13617 --worker-id worker_local_1
