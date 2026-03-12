#!/usr/bin/env python3
"""
Simple HTTP server for local development and TV testing.
Serves the frontend/ directory on all interfaces.
"""

import http.server
import socketserver
import os
import sys
from pathlib import Path

# Serve from frontend directory
FRONTEND_DIR = Path(__file__).parent / "frontend"
PORT = 9000
INTERFACE = "0.0.0.0"  # Listen on all interfaces

os.chdir(FRONTEND_DIR)

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        super().end_headers()

    def log_message(self, format, *args):
        # Custom logging with timestamp
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        sys.stderr.write(f"[{timestamp}] {format % args}\n")

try:
    with socketserver.TCPServer((INTERFACE, PORT), CORSRequestHandler) as httpd:
        print(f"🎮 Firefly React Speed Game — Dev Server")
        print(f"📍 Local:   http://localhost:{PORT}")
        print(f"📡 Network: http://192.168.1.39:{PORT}")
        print(f"📂 Serving: {FRONTEND_DIR}")
        print(f"\n⏸  Press Ctrl+C to stop\n")
        httpd.serve_forever()
except KeyboardInterrupt:
    print("\n\n✅ Server stopped")
    sys.exit(0)
except OSError as e:
    print(f"❌ Error: {e}")
    print(f"   Make sure port {PORT} is not in use")
    sys.exit(1)
