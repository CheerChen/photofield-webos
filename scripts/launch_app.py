# /// script
# dependencies = []
# ///
# Launch (or foreground) a webOS app via Telnet + luna-send, so WAM exposes its
# CDP target on :9998. SSH luna-send is ACL-dropped; Telnet (hbchannel) works.
#
# Usage: uv run launch_app.py <tv-ip> <appId>
#   uv run launch_app.py 192.168.0.107 com.cheerchen.decotv
import socket, time, sys

tv_ip = sys.argv[1] if len(sys.argv) > 1 else "192.168.0.107"
app_id = sys.argv[2] if len(sys.argv) > 2 else "com.cheerchen.decotv"

s = socket.socket(); s.settimeout(15); s.connect((tv_ip, 23)); time.sleep(1.5)
try: s.recv(4096)
except Exception: pass
cmd = ('luna-send -n 1 -f luna://com.webos.service.applicationManager/launch '
       '\'{"id":"%s"}\'\n' % app_id)
s.sendall(cmd.encode())
time.sleep(4)
print(s.recv(65536).decode("utf-8", "replace"))
s.close()
# returnValue:true = launched. Wait ~5s, then curl http://localhost:<fwd>/json
