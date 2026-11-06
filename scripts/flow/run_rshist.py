#!/usr/bin/env python
"""รัน precompute_rshist.mjs ผ่าน Python (stdin=DEVNULL) — หลบปัญหา 'stdin is not a tty' บน Windows/cron

Usage: python scripts/flow/run_rshist.py [th|us|both]
"""
import os, subprocess, sys, json, shutil

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
mk = (sys.argv[1] if len(sys.argv) > 1 else "both").lower()
if mk not in ("th", "us", "both"):
    mk = "both"
targets = ["th", "us"] if mk == "both" else [mk]

# สำรองไฟล์เดิม (กันรอบใหม่ได้วันถอยหลัง)
for _t in targets:
    _p = os.path.join(ROOT, "rsdash", f"rshist_{_t}.json")
    if os.path.exists(_p):
        shutil.copy2(_p, _p + ".bak")


def _last(path):
    try:
        d = json.load(open(path, encoding="utf-8"))
        ds = d.get("dates") or []
        return ds[-1] if ds else ""
    except Exception:
        return ""

log = os.path.join(os.environ.get("TEMP", "."), "rshist_run.log")
with open(log, "wb") as f:
    r = subprocess.run(
        ["node", "scripts/flow/precompute_rshist.mjs", "--market", mk],
        cwd=ROOT, stdin=subprocess.DEVNULL, stdout=f, stderr=subprocess.STDOUT, timeout=3600,
    )
print("exit", r.returncode, "log", log)

for _t in targets:
    _p = os.path.join(ROOT, "rsdash", f"rshist_{_t}.json")
    _bak = _p + ".bak"
    _old = _last(_bak) if os.path.exists(_bak) else ""
    _new = _last(_p)
    if _old and _new and _new < _old:
        shutil.move(_bak, _p)
        print(f"WARN {_t}: รอบนี้ได้ {_new} เก่ากว่าเดิม {_old} → คืนไฟล์เดิม")
    elif os.path.exists(_bak):
        os.remove(_bak)

