# /// script
# dependencies = ["websocket-client"]
# ///
# Evaluate an (async) JS expression inside a live webOS web-app via CDP.
#
# Prereq: SSH-forward the TV's CDP port first, e.g.
#   ssh -f -N -L 9977:localhost:9998 <tv-host>
#
# Usage:
#   echo '(async()=>({href:location.href}))()' | uv run cdp_eval.py
#   uv run cdp_eval.py --port 9977 --target decotv < expr.js
#
# The expression runs in the app's REAL origin: read/modify localStorage, run
# fetch() as the app, inspect the DOM, drive the SPA (window.__router...), etc.
import json, sys, argparse, urllib.request
from websocket import create_connection

ap = argparse.ArgumentParser()
ap.add_argument("--port", default="9977", help="local forwarded CDP port")
ap.add_argument("--target", default="", help="substring to match the page title/url (first page if empty)")
ap.add_argument("--no-await", action="store_true", help="do not awaitPromise")
args = ap.parse_args()
LOCAL = f"http://localhost:{args.port}"

def find_target(sub):
    data = json.load(urllib.request.urlopen(LOCAL + "/json", timeout=8))
    pages = [t for t in data if t.get("type") == "page" and t.get("webSocketDebuggerUrl")]
    if not pages:
        raise SystemExit("No running page target. Launch the app first (Telnet luna).")
    if sub:
        for t in pages:
            if sub.lower() in (t.get("title", "") + t.get("url", "")).lower():
                return t["webSocketDebuggerUrl"]
        raise SystemExit(f"No page matches '{sub}'. Targets: " + ", ".join(p.get('title', '') for p in pages))
    return pages[0]["webSocketDebuggerUrl"]

def main():
    expr = sys.stdin.read()
    ws = create_connection(find_target(args.target), timeout=40, max_size=None)
    n = [0]
    def cmd(method, params):
        n[0] += 1
        ws.send(json.dumps({"id": n[0], "method": method, "params": params}))
        while True:
            m = json.loads(ws.recv())
            if m.get("id") == n[0]:
                return m
    cmd("Runtime.enable", {})
    res = cmd("Runtime.evaluate", {
        "expression": expr,
        "awaitPromise": not args.no_await,
        "returnByValue": True,
        "userGesture": True,
    })
    ws.close()
    r = res.get("result", res)
    if r.get("result", {}).get("subtype") == "error" or "exceptionDetails" in r:
        print(json.dumps(r, ensure_ascii=False, indent=2))
    else:
        print(json.dumps(r.get("result", {}).get("value", r), ensure_ascii=False, indent=2))

main()
