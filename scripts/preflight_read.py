#!/usr/bin/env python3
"""PRE-FLIGHT ก่อนแก้ RS Dashboard — รวบสิ่งที่ต้องอ่าน/ตรวจไว้ในคำสั่งเดียว
ใช้: python scripts/preflight_read.py            (อ่าน + ตรวจไฟล์เครื่อง vs เว็บ)
     python scripts/preflight_read.py --full     (อ่าน HANDOFF 60 บรรทัดแรกแทน 30)
"""
import hashlib
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request

GIT = shutil.which("git") or "git"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RS = os.path.join(ROOT, "rsdash")
SITE = "https://rsdashclean.vercel.app"
FULL = "--full" in sys.argv

def head(t):
    print("\n" + "=" * 72 + "\n" + t + "\n" + "=" * 72)

def show_rules():
    p = os.path.join(RS, "HANDOFF.md")
    if not os.path.exists(p):
        print("ไม่พบ HANDOFF.md"); return
    lines = open(p, encoding="utf-8").read().split("\n")
    head("1) HANDOFF — กฎ/ข้อห้าม และงานล่าสุด")
    for l in lines[: (60 if FULL else 45)]:
        print(l)
    print("\n--- รายการล่าสุด 3 รายการ ---")
    idx = [i for i, l in enumerate(lines) if l.startswith("### ")]
    for i in idx[:3]:
        print(lines[i])

def show_lessons():
    p = os.path.join(RS, "LESSONS.md")
    head("2) LESSONS — บทเรียน/ข้อปรับปรุง")
    if not os.path.exists(p):
        print("ไม่พบ LESSONS.md"); return
    txt = open(p, encoding="utf-8").read()
    m = re.search(r"## 3\)(.*?)(?=\n## |\Z)", txt, re.S)
    print((m.group(0) if m else txt)[:2200])

def git_state():
    head("3) สถานะไฟล์ (git) + ไฟล์ที่แก้ค้าง")
    r0 = subprocess.run([GIT, "status", "--short", "--", "rsdash", "scripts"], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
    out0 = (r0.stdout or "").strip()
    print("ไฟล์ค้างใน rsdash/ + scripts/:\n" + ("\n".join(out0.split("\n")[:20]) if out0 else "(ว่าง — สะอาด)"))
    for args in (["log", "--oneline", "-3"],):
        r = subprocess.run([GIT] + args, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
        out = (r.stdout or "").strip()
        print(("\n".join(out.split("\n")[:25]) if out else "(ว่าง)"))

def compare_live():
    head("4) ไฟล์ในเครื่อง vs ไฟล์บนเว็บ (index.html)")
    local = os.path.join(RS, "index.html")
    if not os.path.exists(local):
        print("ไม่พบ index.html"); return
    lb = open(local, "rb").read()
    try:
        url = f"{SITE}/index.html?nc={int(time.time())}"
        live = urllib.request.urlopen(url, timeout=90).read()
    except Exception as e:
        print("ดึงไฟล์บนเว็บไม่ได้:", str(e)[:120]); return
    h1 = hashlib.md5(lb).hexdigest()[:12]
    h2 = hashlib.md5(live).hexdigest()[:12]
    print(f"local {len(lb)/1024:.0f}KB md5={h1}\nlive  {len(live)/1024:.0f}KB md5={h2}")
    print("→ " + ("ตรงกัน (ยังไม่มีของใหม่รอ deploy)" if h1 == h2 else "ต่างกัน — มีของในเครื่องที่ยังไม่ deploy หรือเว็บเป็นเวอร์ชันใหม่กว่า"))
    for k in ("pvSetScope", "SURP", "pvApplyMarks"):
        print(f"   {k}: local={k in lb.decode('utf-8','replace')} live={k in live.decode('utf-8','replace')}")

def checklist():
    head("5) เช็กลิสต์ก่อนลงมือ (ห้ามข้าม)")
    for i, s in enumerate([
        "อ่านกฎใน HANDOFF แล้วรู้ว่าอะไรห้ามแตะ (ของ Claude: index.html ดีไซน์, api/heatmap.js, หน้า How to เดิม)",
        "ระบุช่วงโค้ดที่จะแก้ และยืนยันว่าไม่ทับฟังก์ชันข้างเคียง (ห้ามลบด้วย regex หลายจุด)",
        "commit baseline ก่อนแก้ เพื่อย้อนได้ในคำสั่งเดียว",
        "แก้ทีละจุด → node --check ทุก <script> / .js ที่แตะ",
        "deploy ด้วย scripts/rsdash_deploy.py เท่านั้น (ไม่ใช้โฟลเดอร์ที่ไม่มี api/)",
        "ตรวจเว็บจริง: เปิดหน้า, กดใช้งานเส้นทางที่แก้, ดู console error, และเช็คตัวเลขกับ API",
        "เขียน HANDOFF + commit (push เมื่อบอสสั่ง)",
    ], 1):
        print(f"  {i}. {s}")

if __name__ == "__main__":
    print("PRE-FLIGHT — อ่านก่อนแก้ทุกครั้ง (RS Dashboard)")
    show_rules(); show_lessons(); git_state(); compare_live(); checklist()
