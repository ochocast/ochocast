#!/usr/bin/env python3
"""
Test script for the Viewer class
"""
import asyncio
import time
from viewer import Viewer

async def test_viewer():
    """Test the viewer functionality"""
    # Create a viewer instance
    viewer = Viewer(
        viewer_id="test_viewer_01",
        red_threshold=128.0,
        output="./benchmark_data",
        url="http://localhost:8090/viewer",  # Adjust as needed
        stun_url="stun:stun.l.google.com:19302"
    )
    
    print("Starting viewer...")
    await viewer.start_async()
    
    # Let it run for a bit (in real scenario, this would be until you want to stop)
    print("Viewer running... (press Ctrl+C to stop)")
    try:
        await asyncio.sleep(30)  # Run for 30 seconds
    except KeyboardInterrupt:
        print("Keyboard interrupt received")
    
    print("Stopping viewer...")
    await viewer.stop()
    print("Test completed")

def test_viewer_sync():
    """Test the viewer with synchronous start (threaded)"""
    viewer = Viewer(
        viewer_id="test_viewer_sync",
        red_threshold=128.0,
        output="./benchmark_data",
        url="http://localhost:8090/viewer",
        stun_url="stun:stun.l.google.com:19302"
    )
    
    print("Starting viewer in background thread...")
    viewer.start()
    
    try:
        print("Viewer running in background... (press Ctrl+C to stop)")
        time.sleep(30)  # Run for 30 seconds
    except KeyboardInterrupt:
        print("Keyboard interrupt received")
    
    print("Stopping viewer...")
    viewer.stop_sync()
    print("Test completed")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "sync":
        test_viewer_sync()
    else:
        asyncio.run(test_viewer())
