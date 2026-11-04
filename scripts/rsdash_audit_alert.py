#!/usr/bin/env python3
"""ตัวช่วย cron: รัน rsdash_audit_v2.py แล้ว "ส่งข้อความเฉพาะเมื่อไม่ผ่าน"
- ผ่านทั้งหมด → ไม่พิมพ์อะไร (cron แบบ no_agent จะไม่ส่งข้อความ)
- ไม่ผ่าน → พิมพ์สรุปให้ส่งเข้า Discord
"""
import subprocess
import sys
import os

HERE = os.path.dirname(os.path.abspath(__file__))
r = subprocess.run([sys.executable, os.path.join(HERE, "rsdash_audit_v2.py")], capture_output=True, text=True, encoding="utf-8", errors="replace")
out = (r.stdout or "") + (r.stderr or "")
if r.returncode != 0:
    print("ตรวจเว็บ RS Dashboard ไม่ผ่าน:\n" + out.strip()[:1800])
