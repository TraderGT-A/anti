#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
A6: อัปเดตข้อมูล vol/corr (A1/A2) ให้สดอัตโนมัติ + redeploy หลังปิดตลาด
1) refresh ราคารายวันของทั้ง universe ลง research/three-matrices/data/daily_th.json (โทรผ่าน /api/chart)
2) รัน gen_vol.py + gen_corr.py -> vol_th.json / corr_th.json
3) [--deploy] copy ไฟล์ deploy เข้า $TMPDIR/rsdash_clean_deploy แล้ว vercel --prod
ใช้เป็น cron วัน-ศ. หลังปิดตลาด (17:40) เพื่อให้ vol/corr ในเว็บไม่ล้า
"""
import json, os, shutil, subprocess, sys, time, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
RS = os.path.join(HERE, "..", "research", "three-matrices")
DAILY = os.path.join(RS, "data", "daily_th.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
BASE = "https://rsdashclean.vercel.app"


def get(u, t=90):
    return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t).read().decode("utf-8", "replace"))


def refresh():
    store = json.load(open(DAILY, encoding="utf-8")) if os.path.exists(DAILY) else {}
    scan = get(BASE + "/api/scan?market=thailand&force=1", 120)
    todo = [s["ticker"] for s in scan["data"]]
    got = 0
    for i, tk in enumerate(todo, 1):
        u = BASE + "/api/chart?market=thailand&symbol=" + urllib.parse.quote(tk) + "&interval=1d&range=2y"
        for a in range(3):
            try:
                d = get(u)
                bars = d.get("data") or []
                break
            except Exception:
                time.sleep(1 + a)
                bars = []
        if len(bars) >= 30:
            name = store.get(tk, {}).get("name", "")
            ind = store.get(tk, {}).get("industry", "Other")
            store[tk] = {"name": name, "industry": ind,
                         "dates": [b["time"] for b in bars], "close": [b["close"] for b in bars],
                         "volume": [b["volume"] for b in bars]}
            got += 1
        time.sleep(0.18)
        if i % 40 == 0:
            print("refreshed %d/%d" % (i, len(todo)), flush=True)
    json.dump(store, open(DAILY, "w", encoding="utf-8"), ensure_ascii=False)
    print("refresh done: symbols=%d" % len(store))
    return store


def main():
    do_deploy = "--deploy" in sys.argv
    print("== A6: refresh vol/corr ==", flush=True)
    refresh()
    for scr, out in (("gen_vol.py", "vol_th.json"), ("gen_corr.py", "corr_th.json")):
        r = subprocess.run([sys.executable, os.path.join(HERE, scr)], capture_output=True, text=True)
        print(r.stdout.strip().splitlines()[-1][:120], flush=True)
        if r.returncode:
            print("gen %s FAILED: %s" % (scr, r.stderr[:300])); sys.exit(1)
    if not do_deploy:
        print("(skip deploy — ใส่ --deploy เพื่อ deploy)")
        return
    # deploy เข้าโฟลเดอร์ deploy มาตรฐาน (ผูก project "rsdash_clean" = rsdashclean.vercel.app)
    # ⚠️ ห้าม copy .vercel จาก HERE (rsdash/.vercel ผูก project "rs-dashboard" = คนละเว็บ! เจอ 5 ต.ค. 23:36)
    D = r"C:/Users/Tar/AppData/Local/hermes/cache/scratch/rsdash_clean"
    if not os.path.exists(os.path.join(D, ".vercel", "project.json")):
        print("ERROR: ไม่พบโฟลเดอร์ deploy %s" % D)
        sys.exit(1)
    for f in ("vol_th.json", "corr_th.json"):
        shutil.copy2(os.path.join(HERE, f), os.path.join(D, f))
    # ⚠️ Windows: subprocess เรียก "vercel" เปล่า ๆ ไม่ได้ (vercel เป็น .cmd ไม่ใช่ .exe → WinError 2)
    #    ต้องหา vercel.cmd ผ่าน shutil.which
    vc = shutil.which("vercel.cmd") or shutil.which("vercel") or "vercel.cmd"
    r = subprocess.run([vc, "--prod", "--yes", "--force"], cwd=D, capture_output=True, text=True, timeout=420)
    tail = r.stdout[-500:] + r.stderr[-500:]
    print("vercel rc=%d | %s" % (r.returncode, tail[-400:]), flush=True)
    # ⚠️ ตรวจผล deploy ให้ถูก: vercel เขียน "Ready"/"Aliased" ไป stderr (ไม่ใช่ stdout);
    #    เช็ค stdout+stderr รวม + ยอมรับ marker สำเร็จ ไม่งั้น deploy สำเร็จแต่ exit 1 เงียบๆ
    combined = (r.stdout + " " + r.stderr).lower()
    ok_mark = ("ready" in combined) or ("aliased" in combined) or ("success" in combined) or ("production url" in combined)
    if r.returncode != 0 or not ok_mark:
        sys.exit(1)


if __name__ == "__main__":
    main()