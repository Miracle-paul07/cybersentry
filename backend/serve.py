"""
One command to run CyberSentry: API + built website, then open the browser.
Used by run.bat.

    python -m backend.serve [--port 8000] [--no-browser]
"""
import argparse
import json
import logging
import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser

import uvicorn

HOST = "127.0.0.1"


def port_open(port):
    try:
        with socket.create_connection((HOST, port), timeout=0.5):
            return True
    except OSError:
        return False


def is_cybersentry(port):
    try:
        with urllib.request.urlopen(f"http://{HOST}:{port}/api/health", timeout=8) as r:
            return "models" in json.load(r)
    except Exception:
        return False


def announce_when_ready(port, open_browser):
    # uvicorn only opens the port after the models have loaded
    while not port_open(port):
        time.sleep(0.5)
    url = f"http://{HOST}:{port}"
    print(f"\n  CyberSentry is running at {url}\n  Press Ctrl+C here to stop it.\n", flush=True)
    if open_browser:
        webbrowser.open(url)


def main():
    parser = argparse.ArgumentParser(description="Run CyberSentry")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-browser", action="store_true", help="do not open the browser")
    parser.add_argument("--rebuild", action="store_true", help="handled by run.bat: rebuild the website first")
    args = parser.parse_args()

    if port_open(args.port):
        if is_cybersentry(args.port):
            url = f"http://{HOST}:{args.port}"
            print(f"CyberSentry is already running at {url}", flush=True)
            if not args.no_browser:
                webbrowser.open(url)
            return 0
        print(f"Port {args.port} is being used by another program. Try: run.bat --port 8001", flush=True)
        return 1

    # On Windows, asyncio prints a traceback each time a browser drops a connection. It's harmless.
    logging.getLogger("asyncio").setLevel(logging.CRITICAL)

    print("Loading the detection models, this can take a little while...", flush=True)
    threading.Thread(target=announce_when_ready, args=(args.port, not args.no_browser), daemon=True).start()
    uvicorn.run("backend.main:app", host=HOST, port=args.port, log_level="warning")

    # A running job may be waiting on Groq's rate limit. Nothing needs saving, so don't wait for it.
    sys.stdout.flush()
    os._exit(0)


if __name__ == "__main__":
    sys.exit(main())
