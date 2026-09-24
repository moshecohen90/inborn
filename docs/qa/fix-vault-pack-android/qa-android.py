#!/usr/bin/env python3
"""Drive com.inbornapp.mobile.qa through the in-app QA bridge (files/qa/{in,out,ack}) over adb run-as.
usage: qa-android.py <script.json> <shot-prefix> [timeout_s]"""
import json, subprocess, sys, time, os
S = os.path.dirname(os.path.abspath(__file__))
PKG = "com.inbornapp.mobile.qa"
ADB = ["adb", "-s", os.environ["INBORN_6T_SERIAL"]]
script_path, prefix = sys.argv[1], sys.argv[2]
timeout = float(sys.argv[3]) if len(sys.argv) > 3 else 600
script = json.load(open(script_path))
run = script["runId"]

def sh(cmd, inp=None):
    return subprocess.run(ADB + ["shell", cmd] if inp is None else ADB + ["exec-in", cmd], input=inp, capture_output=True, timeout=60).stdout

def cat(rel):
    out = sh(f"run-as {PKG} cat files/{rel} 2>/dev/null")
    return out.decode() if out else ""

sh(f"run-as {PKG} sh -c 'mkdir -p files/qa/in files/qa/ack/{run}'")
subprocess.run(ADB + ["exec-in", f"run-as {PKG} sh -c 'cat > files/qa/in/{run}.json'"], input=json.dumps(script).encode(), check=True)
print("pushed", run, flush=True)
taken = set()
end = time.time() + timeout
while time.time() < end:
    res = cat(f"qa/out/{run}/result.json")
    if res.strip():
        open(f"{S}/{prefix}-result.json", "w").write(res)
        sh(f"run-as {PKG} sh -c 'mkdir -p files/qa/ack/{run} && touch files/qa/ack/{run}/result.ok'")
        r = json.loads(res)
        print("RESULT ok=", r.get("ok"), flush=True)
        for st in r.get("steps", []):
            if not st.get("ok", True) or st.get("value") is not None or st.get("error"):
                print(json.dumps(st)[:400])
        sys.exit(0 if r.get("ok") else 1)
    prog = cat(f"qa/out/{run}/progress.json")
    try:
        p = json.loads(prog) if prog.strip() else {}
    except Exception:
        p = {}
    name = p.get("awaiting")
    if name and name not in taken:
        os.makedirs(f"{S}/shots", exist_ok=True); os.makedirs(f"{S}/ev", exist_ok=True)
        png = subprocess.run(ADB + ["exec-out", "screencap", "-p"], capture_output=True).stdout
        full = f"{S}/shots/{prefix}-{name}.png"
        open(full, "wb").write(png)
        subprocess.run(["sips", "--resampleHeight", "500", full, "--out", f"{S}/ev/{prefix}-{name}.png"], capture_output=True)
        sh(f"run-as {PKG} sh -c 'touch files/qa/ack/{run}/{name}.ok'")
        taken.add(name)
        print("shot", name, flush=True)
    time.sleep(0.4)
print("TIMEOUT"); sys.exit(2)
