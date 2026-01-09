#!/bin/bash

if [ -f .pids ]; then
    echo "Stopping all services..."
    while read pid; do
        if kill -0 $pid 2>/dev/null; then
            echo "Stopping process $pid..."
            kill $pid
        fi
    done < .pids
    rm .pids
    echo "All services stopped."
else
    echo "No .pids file found. Manually stop processes:"
    echo "  ps aux | grep -E '(controlplane|whip-server)'"
fi
