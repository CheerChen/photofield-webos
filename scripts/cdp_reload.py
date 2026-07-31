# /// script
# dependencies = ["websocket-client"]
# ///
# Reload the live webOS web-app page via CDP Page.reload (ignoreCache: true).
# No reboot, no close/launch — just reloads the file:// page in-place.
#
# Usage: uv run cdp_reload.py [app_name_substring] [local_cdp_port]
#   default app_name_substring = "decotv", default port = 9977
#   The script finds the CDP target whose title/description contains the substring.

import sys, json, urllib.request, websocket

APP_SUBSTRING = sys.argv[1] if len(sys.argv) > 1 else "decotv"
PORT = sys.argv[2] if len(sys.argv) > 2 else "9977"
CDP_LIST_URL = f"http://localhost:{PORT}/json"

pages = json.loads(urllib.request.urlopen(CDP_LIST_URL).read())
target = None
for p in pages:
    if APP_SUBSTRING.lower() in (p.get("title", "") + p.get("description", "")).lower():
        target = p
        break
if not target:
    print(f"ERROR: no CDP target matching '{APP_SUBSTRING}'", file=sys.stderr)
    sys.exit(1)

ws_url = target["webSocketDebuggerUrl"]
ws = websocket.create_connection(ws_url, max_size=10 * 1024 * 1024)

# Page.reload — reloads the current page (file://) in-place, bypassing cache
msg = json.dumps({"id": 1, "method": "Page.reload", "params": {"ignoreCache": True}})
ws.send(msg)
resp = json.loads(ws.recv())
ws.close()

if resp.get("error"):
    print(json.dumps(resp["error"], indent=2), file=sys.stderr)
    sys.exit(1)
print(f"Page.reload OK — app '{target.get('title', APP_SUBSTRING)}' reloaded from file://")
