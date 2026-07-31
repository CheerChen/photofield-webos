# /// script
# dependencies = ["websocket-client"]
# ///
# Capture CDP Network events (Set-Cookie + cookie-block reasons) while running a
# JS snippet in a live webOS web-app. This is how you learn *why* a cookie was
# not stored/sent (blockedReasons like ["SameSiteLax"]) instead of guessing.
#
# Prereq: ssh -f -N -L 9977:localhost:9998 <tv-host>
# Usage:  echo '<js that triggers requests>' | uv run cdp_net.py --target decotv
#   default JS re-logs-in and hits a protected endpoint; override via stdin.
import json, sys, argparse, urllib.request, time
from websocket import create_connection

ap = argparse.ArgumentParser()
ap.add_argument("--port", default="9977")
ap.add_argument("--target", default="")
ap.add_argument("--seconds", type=float, default=12.0, help="how long to collect events")
args = ap.parse_args()
LOCAL = f"http://localhost:{args.port}"

def find_target(sub):
    data = json.load(urllib.request.urlopen(LOCAL + "/json", timeout=8))
    pages = [t for t in data if t.get("type") == "page" and t.get("webSocketDebuggerUrl")]
    if not pages:
        raise SystemExit("No running page target. Launch the app first.")
    for t in pages:
        if not sub or sub.lower() in (t.get("title", "") + t.get("url", "")).lower():
            return t["webSocketDebuggerUrl"]
    raise SystemExit(f"No page matches '{sub}'.")

expr = sys.stdin.read().strip() or "'no expr given'"

ws = create_connection(find_target(args.target), timeout=args.seconds + 20, max_size=None)
n = [0]
def cmd(method, params=None):
    n[0] += 1
    cid = n[0]
    ws.send(json.dumps({"id": cid, "method": method, "params": params or {}}))
    while True:
        m = json.loads(ws.recv())
        if m.get("id") == cid:
            return m

cmd("Network.enable")
cmd("Runtime.enable")
n[0] += 1
ws.send(json.dumps({"id": n[0], "method": "Runtime.evaluate",
                    "params": {"expression": expr, "awaitPromise": True, "returnByValue": True}}))

events, deadline = [], time.time() + args.seconds
while time.time() < deadline:
    try:
        ws.settimeout(max(0.1, deadline - time.time()))
        m = json.loads(ws.recv())
    except Exception:
        break
    if m.get("method", "").startswith("Network."):
        events.append(m)

out = []
for m in events:
    p, meth = m.get("params", {}), m["method"]
    if meth == "Network.requestWillBeSent":
        out.append({"ev": "req", "url": p.get("request", {}).get("url", "")[-55:]})
    elif meth == "Network.responseReceived":
        out.append({"ev": "resp", "url": p.get("response", {}).get("url", "")[-55:],
                    "status": p.get("response", {}).get("status")})
    elif meth == "Network.responseReceivedExtraInfo":
        out.append({"ev": "respExtra",
                    "hasSetCookie": any(k.lower() == "set-cookie" for k in p.get("headers", {})),
                    "blockedCookies": [{"reasons": b.get("blockedReasons"),
                                        "name": b.get("cookie", {}).get("name"),
                                        "sameSite": b.get("cookie", {}).get("sameSite")}
                                       for b in p.get("blockedCookies", [])]})
    elif meth == "Network.requestWillBeSentExtraInfo":
        ac = [{"name": c.get("cookie", {}).get("name"), "blockedReasons": c.get("blockedReasons")}
              for c in p.get("associatedCookies", [])]
        if ac:
            out.append({"ev": "reqExtra", "associatedCookies": ac})
print(json.dumps(out, ensure_ascii=False, indent=1))
ws.close()
