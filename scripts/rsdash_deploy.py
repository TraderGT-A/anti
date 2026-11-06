#!/usr/bin/env python3
"""Deploy rsdash → Vercel แบบซิงก์ครบทุกไฟล์ (กันโลโก้/แบรนด์หล่นหาย)
ใช้: python scripts/rsdash_deploy.py [--no-verify]

ขั้นตอน: ซิงก์ rsdash/ (ยกเว้น node_modules/.git/.vercel) → staging → vercel --prod → ตรวจ index/brand/api
"""
import os, shutil, subprocess, sys, time, urllib.request, json

SRC = r"C:/Users/Tar/OneDrive/เดสก์ท็อป/THUSHOUSE/rsdash"
ST = r"C:/Users/Tar/AppData/Local/hermes/cache/scratch/rsdash_clean"
SITE = "https://rsdashclean.vercel.app"
SKIP = {"node_modules", ".git", ".vercel"}


def sync():
    os.makedirs(ST, exist_ok=True)
    for name in os.listdir(SRC):
        if name in SKIP:
            continue
        s, d = os.path.join(SRC, name), os.path.join(ST, name)
        if os.path.isdir(s):
            shutil.copytree(s, d, dirs_exist_ok=True)
        else:
            shutil.copy2(s, d)
    n = sum(len(f) for _, _, f in os.walk(ST))
    print(f"ซิงก์แล้ว: {n} ไฟล์ → {ST}")


def deploy():
    vc = shutil.which("vercel.cmd") or shutil.which("vercel")
    r = subprocess.run([vc, "--prod", "--yes", "--force"], cwd=ST, capture_output=True, text=True, timeout=1200, stdin=subprocess.DEVNULL)
    if r.returncode != 0:
        print((r.stderr or r.stdout)[-1200:])
        raise SystemExit(f"deploy ล้มเหลว rc={r.returncode}")
    print("deploy สำเร็จ")


def verify():
    time.sleep(8)
    local = open(os.path.join(SRC, "index.html"), "rb").read()
    live = urllib.request.urlopen(SITE + "/index.html", timeout=120).read()
    print("index.html:", "ตรงเครื่อง" if live == local else f"ไม่ตรง (live {len(live)} / local {len(local)})")
    for u in ("/brand/thus-logo-white.png", "/brand/thus-logo-color.png", "/brand/thus-symbol-white.png"):
        try:
            code = urllib.request.urlopen(SITE + u, timeout=30).status
        except Exception as e:
            code = f"ERR {e}"
        print(u, code)
    for q in ("market=thailand", "market=america&universe=all"):
        try:
            j = json.loads(urllib.request.urlopen(f"{SITE}/api/scan?{q}", timeout=300).read())
            print(f"/api/scan?{q}: {len(j.get('data', []))} แถว")
        except Exception as e:
            print(f"/api/scan?{q}: ERR {e}")


if __name__ == "__main__":
    sync()
    deploy()
    if "--no-verify" not in sys.argv:
        verify()
