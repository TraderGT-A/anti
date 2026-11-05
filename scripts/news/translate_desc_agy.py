#!/usr/bin/env python3
"""แปลคำอธิบายบริษัท (desc/<mk>/*.json) เป็นไทยล่วงหน้า แล้วเก็บเป็น desc_th/<mk>/*.json
ใช้ agy (Antigravity/Gemini) ทีละชุด — เลี่ยง Google Translate ที่บล็อก IP เซิร์ฟเวอร์/เครื่อง

ใช้: python scripts/news/translate_desc_agy.py --mk th [--limit 60] [--batch 15] [--delay 1]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DESC = os.path.join(ROOT, "rsdash", "desc")
OUT = os.path.join(ROOT, "rsdash", "desc_th")
AGY = os.path.join(os.environ.get("LOCALAPPDATA", ""), "hermes", "tools", "agy.cmd")
if not os.path.exists(AGY):
    AGY = "agy"

PROMPT = """แปลคำอธิบายบริษัทต่อไปนี้เป็นภาษาไทย สำหรับแสดงในแอปหุ้น
กติกา: แปลให้อ่านลื่นแบบไทยธุรกิจ ไม่ต้องทับศัพท์เกินจำเป็น คงชื่อบริษัท/ชื่อผลิตภัณฑ์/ตัวเลข/สกุลเงินไว้เหมือนเดิม
ตอบกลับเป็น JSON เท่านั้น รูปแบบ {{"TICKER":"คำแปลไทย"}} โดยคงคีย์ตามที่ให้มา ห้ามมีข้อความอื่นนอก JSON

{items}"""


def shards(mk: str):
    d = os.path.join(DESC, mk)
    return sorted(f for f in os.listdir(d) if f.endswith(".json")) if os.path.isdir(d) else []


def load(p):
    try:
        with open(p, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}


def call_agy(prompt: str, timeout: int = 180) -> str:
    r = subprocess.run(
        [AGY, "-p", prompt, "--output-format", "json", "--dangerously-skip-permissions"],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout,
    )
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout)[:200])
    try:
        return json.loads(r.stdout).get("response", "") or ""
    except Exception:
        return r.stdout or ""


def parse_json_block(txt: str) -> dict:
    i, j = txt.find("{"), txt.rfind("}")
    if i < 0 or j <= i:
        return {}
    raw = txt[i:j + 1]
    try:
        return json.loads(raw)
    except Exception:
        # ลองซ่อม backslash/quote ที่หลุดบ่อย
        try:
            return json.loads(raw.replace("\\'", "'"))
        except Exception:
            return {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mk", default="both")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--batch", type=int, default=15)
    ap.add_argument("--delay", type=float, default=1.0)
    a = ap.parse_args()
    markets = ["th", "us"] if a.mk == "both" else [a.mk]
    total_done = 0
    for mk in markets:
        outdir = os.path.join(OUT, mk)
        os.makedirs(outdir, exist_ok=True)
        for fn in shards(mk):
            src = load(os.path.join(DESC, mk, fn))
            outp = os.path.join(outdir, fn)
            dst = load(outp)
            todo = [t for t in src if t not in dst and str(src[t]).strip()]
            if not todo:
                continue
            print(f"[tr] {mk}/{fn}: ต้องแปล {len(todo)} ตัว", flush=True)
            for i in range(0, len(todo), a.batch):
                if a.limit and total_done >= a.limit:
                    print(f"[tr] ถึง limit {a.limit} แล้ว — หยุด", flush=True)
                    return
                chunk = todo[i:i + a.batch]
                items = "\n".join(f'{t}: """{str(src[t])[:1200]}"""' for t in chunk)
                try:
                    txt = call_agy(PROMPT.format(items=items))
                    got = parse_json_block(txt)
                except Exception as e:
                    print(f"[tr] agy ล้มเหลว: {str(e)[:120]}", flush=True)
                    got = {}
                added = 0
                for t in chunk:
                    v = got.get(t) or got.get(t.upper())
                    if isinstance(v, str) and v.strip():
                        dst[t] = v.strip()
                        added += 1
                total_done += added
                with open(outp, "w", encoding="utf-8") as fh:
                    json.dump(dst, fh, ensure_ascii=False)
                print(f"[tr] {mk}/{fn}: +{added}/{len(chunk)} (รวม {total_done})", flush=True)
                time.sleep(a.delay)
            if a.limit and total_done >= a.limit:
                print(f"[tr] ถึง limit {a.limit} แล้ว — หยุด", flush=True)
                return
    print(f"[tr] จบ — แปลใหม่รวม {total_done} ตัว", flush=True)


if __name__ == "__main__":
    sys.exit(main())
