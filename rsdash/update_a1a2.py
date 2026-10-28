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


def get(u, t=90, tries=3):
    # ⚠️ DNS ของเราเคยล่มเป็นช่วง ๆ (router DNS ไม่ตอบ — ดู event DNS-Client 1014)
    #    เดิมยิงครั้งเดียวแล้วพังทันที → job แดงทั้งเส้นทั้งที่เน็ตแค่กระตุก → retry + backoff
    last = None
    for a in range(tries):
        try:
            return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t).read().decode("utf-8", "replace"))
        except Exception as e:
            last = e
            if a < tries - 1:
                time.sleep(2 + 3 * a)
    raise last if last is not None else RuntimeError("get failed")


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

    # ── sync ทั้งชุด deploy จาก rsdash/ ต้นฉบับล่าสุด → staging ก่อน deploy เสมอ ──
    # (29 ต.ค. 2569: เคยเจอ staging ค้างเวอร์ชันเก่า — deploy ไปเขียนทับ index.html ใหม่
    #  บนเว็บด้วยของเก่ากว่า 1 commit + เว็บหายทั้ง brand/ เพราะ Vercel แทนที่ทุกอย่าง ไม่ merge)
    import filecmp

    def _sync_dir(src_dir_name, exts=None):
        src_root = os.path.join(HERE, src_dir_name)
        dst_root = os.path.join(D, src_dir_name)
        if not os.path.isdir(src_root):
            return
        for root, dirs, files in os.walk(src_root):
            dirs[:] = [d for d in dirs if d != "__pycache__"]
            rel = os.path.relpath(root, src_root)
            tdir = dst_root if rel == "." else os.path.join(dst_root, rel)
            os.makedirs(tdir, exist_ok=True)
            for fn in files:
                if exts and not fn.lower().endswith(exts):
                    continue
                s, t = os.path.join(root, fn), os.path.join(tdir, fn)
                if not (os.path.exists(t) and filecmp.cmp(s, t, shallow=False)):
                    shutil.copy2(s, t)

    _sync_dir("brand")          # โลโก้ THUS — ขาดแล้วหน้าเว็บดูพัง
    _sync_dir("hist")           # กราฟย้อนหลางรายตัว
    _sync_dir("desc")           # คำอธิบายบริษัท
    _sync_dir("api", exts=(".js", ".json"))
    for f in ("index.html", "vercel.json", "package.json", "about.js", "notes.js",
              "leaders.js", "fundlog.js", "trendlib.js",
              "monthly_leaders_th.json", "monthly_leaders_us.json",
              "corr_us.json", "vol_us.json", "dr_us.json"):
        s, t = os.path.join(HERE, f), os.path.join(D, f)
        if os.path.exists(s) and not (os.path.exists(t) and filecmp.cmp(s, t, shallow=False)):
            shutil.copy2(s, t)

    # ประตูความครบถ้วน — Vercel แทนที่ทั้ง project ถ้า staging ไม่มี api/ เว็บจะ 404 ทั้งหมด
    for f in ("index.html", "vercel.json", "api/scan.js", "api/_lib/scan.js"):
        if not os.path.exists(os.path.join(D, f)):
            print("ERROR: staging ไม่ครบ (%s) — หยุด ห้าม deploy" % f, flush=True); sys.exit(1)

    # ⚠️ Windows: subprocess เรียก "vercel" เปล่า ๆ ไม่ได้ (vercel เป็น .cmd ไม่ใช่ .exe → WinError 2)
    #    ต้องหา vercel.cmd ผ่าน shutil.which
    vc = shutil.which("vercel.cmd") or shutil.which("vercel") or "vercel.cmd"

    # จำ deployment ก่อนหน้าไว้กู้คืน (ถ้า deploy ใหม่พัง)
    old_url = ""
    try:
        # ⚠️ vercel เขียนผล inspect ไป stderr (ไม่ใช่ stdout) → ต้องอ่านทั้งสองทาง
        _insp = subprocess.run([vc, "inspect", BASE], capture_output=True, text=True, timeout=180)
        insp = (_insp.stdout or "") + "\n" + (_insp.stderr or "")
        for line in insp.splitlines():
            if line.strip().startswith("url"):
                old_url = line.split()[-1]
    except Exception:
        pass
    print("deployment ก่อนหน้า: %s" % (old_url or "ไม่ทราบ"), flush=True)

    r = subprocess.run([vc, "--prod", "--yes", "--force"], cwd=D, capture_output=True, text=True, timeout=420)
    tail = r.stdout[-500:] + r.stderr[-500:]
    print("vercel rc=%d | %s" % (r.returncode, tail[-400:]), flush=True)
    # ⚠️ ตรวจผล deploy ให้ถูก: vercel เขียน "Ready"/"Aliased" ไป stderr (ไม่ใช่ stdout);
    #    เช็ค stdout+stderr รวม + ยอมรับ marker สำเร็จ ไม่งั้น deploy สำเร็จแต่ exit 1 เงียบๆ
    combined = (r.stdout + " " + r.stderr).lower()
    ok_mark = ("ready" in combined) or ("aliased" in combined) or ("success" in combined) or ("production url" in combined)
    if r.returncode != 0 or not ok_mark:
        print("ERROR: deploy ไม่สำเร็จ", flush=True); sys.exit(1)

    # ตรวจผลจริง — vercel อาจขึ้น "ready" แต่เว็บยัง 404 (ส่งไฟล์ไม่ครบ)
    def _code(u):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30) as r:
                return r.status
        except Exception:
            return 0

    time.sleep(10)
    # (29 ต.ค. 2569) เช็ค 5 URL ตามที่บอสสั่ง NET — ขาดข้อไหนไม่ผ่าน = deploy ไม่ครบ ต้องกู้คืน
    CHECK_URLS = (
        BASE + "/",
        BASE + "/api/scan?universe=leaders",
        BASE + "/monthly_leaders_th.json",
        BASE + "/monthly_leaders_us.json",
        BASE + "/brand/thus-logo-color.png",
    )
    codes = {u: _code(u) for u in CHECK_URLS}
    bad = {u: c for u, c in codes.items() if c != 200}
    print("ตรวจผล: " + " | ".join("%s=%s" % (u.replace(BASE, ""), c) for u, c in codes.items()), flush=True)
    if bad:
        print("ERROR: URL ไม่ผ่าน %s — กู้คืน %s" % (bad, old_url), flush=True)
        if old_url:
            subprocess.run([vc, "promote", old_url, "--yes"], capture_output=True, text=True, timeout=180)
            time.sleep(8)
            after = {u: _code(u) for u in CHECK_URLS}
            print("หลังกู้: " + " | ".join("%s=%s" % (u.replace(BASE, ""), c) for u, c in after.items()), flush=True)
        sys.exit(1)
    print("deploy สำเร็จ — 5 URL ตอบ 200 ครบ", flush=True)


if __name__ == "__main__":
    main()