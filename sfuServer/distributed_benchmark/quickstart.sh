#!/bin/bash
# Quick start script for distributed benchmark with WebSocket reporting

set -e

echo "=========================================="
echo "🚀 Distributed Benchmark - Quick Start"
echo "=========================================="
echo "📡 WebSocket Reporting System v2.0"
echo "=========================================="
echo ""

# Check if config.yaml exists
if [ ! -f "config.yaml" ]; then
    echo "⚠️  config.yaml not found!"
    echo ""
    echo "Creating config.yaml from example..."
    cp config.example.yaml config.yaml
    echo "✅ config.yaml created"
    echo ""
    echo "⚠️  IMPORTANT: Please edit config.yaml and update:"
    echo "   - Worker IPs (workers section)"
    echo "   - SFU URL (sfu.url)"
    echo "   - Number of viewers (benchmark.total_viewers)"
    echo ""
    read -p "Press Enter after editing config.yaml..."
fi

# Check Python version
echo "🔍 Checking Python version..."
python3 --version

# Check if dependencies are installed
echo ""
echo "🔍 Checking dependencies..."
if python3 -c "import aiohttp, aiortc, av, numpy, flask, yaml, requests, matplotlib, websockets, psutil" 2>/dev/null; then
    echo "✅ All dependencies installed"
else
    echo "⚠️  Some dependencies are missing"
    read -p "Install dependencies? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "📦 Installing dependencies..."
        pip3 install -r requirements.txt
        echo "✅ Dependencies installed"
    else
        echo "❌ Cannot proceed without dependencies"
        exit 1
    fi
fi

# Ask what to do
echo ""
echo "=========================================="
echo "What would you like to do?"
echo "=========================================="
echo "1) Start a worker (for remote machines)"
echo "2) Start the controller (for main machine)"
echo "3) Run analysis on existing data"
echo "4) Exit"
echo ""
read -p "Choose an option (1-4): " choice

case $choice in
    1)
        echo ""
        read -p "Port (default 8080): " port
        port=${port:-8080}
        read -p "Controller host (default localhost): " controller_host
        controller_host=${controller_host:-localhost}
        read -p "Controller WebSocket port (default 9000): " ws_port
        ws_port=${ws_port:-9000}
        read -p "Metrics interval in seconds (default 5.0): " metrics_interval
        metrics_interval=${metrics_interval:-5.0}
        echo ""
        echo "🚀 Starting worker on port $port..."
        echo "   Controller: $controller_host:$ws_port"
        echo "   Metrics interval: ${metrics_interval}s"
        echo ""
        echo "Press Ctrl+C to stop"
        echo ""
        python3 worker.py --port $port --controller-host $controller_host --controller-ws-port $ws_port --metrics-interval $metrics_interval
        ;;
    2)
        echo ""
        echo "🚀 Starting controller..."
        echo "This will:"
        echo "  - Start WebSocket server (port 9000)"
        echo "  - Check worker availability"
        echo "  - Start the host (streamer)"
        echo "  - Distribute viewers to workers"
        echo "  - Monitor the benchmark in real-time"
        echo "  - Collect detections and metrics via WebSocket"
        echo "  - Save results to JSON files"
        echo ""
        read -p "Press Enter to start or Ctrl+C to cancel..."
        python3 controller.py --config config.yaml
        ;;
    3)
        echo ""
        read -p "Input directory (default: ./distributed_benchmark_data): " input_dir
        input_dir=${input_dir:-./distributed_benchmark_data}
        read -p "Output directory (default: ./analysis_results): " output_dir
        output_dir=${output_dir:-./analysis_results}
        echo ""
        echo "📊 Running analysis..."
        echo "This will generate:"
        echo "  - Latency graphs"
        echo "  - Worker metrics graphs (CPU, RAM, Network)"
        echo "  - Worker comparison"
        echo "  - Metrics-latency correlation"
        echo "  - Detailed reports"
        echo ""
        python3 analyse_distributed.py "$input_dir" "$output_dir"
        ;;
    4)
        echo "👋 Goodbye!"
        exit 0
        ;;
    *)
        echo "❌ Invalid option"
        exit 1
        ;;
esac
