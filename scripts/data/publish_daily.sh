#!/usr/bin/env bash
# เผยแพร่ "ข้อมูลรายวัน" ขึ้น GitHub raw โดยไม่ต้องดีพลอย Vercel
# หน้าเว็บอ่านจาก https://raw.githubusercontent.com/TraderGT-A/anti/main/rsdash/<file>
# ใช้: publish_daily.sh   (เงียบถ้าไม่มีอะไรเปลี่ยน)
set -uo pipefail
ROOT="C:/Users/Tar/OneDrive/เดสก์ท็อป/THUSHOUSE"
cd "$ROOT" || exit 1

FILES=(
  rsdash/rshist_th_lite.json rsdash/rshist_us_lite.json
  rsdash/rshist_th.json rsdash/rshist_us.json
  rsdash/pivot_th.json rsdash/pivot_us.json rsdash/pivot_data.js
  rsdash/signals_th.json rsdash/signals_us.json
  rsdash/set_earn.json rsdash/set_filed_th.json
  rsdash/fund_nav.json rsdash/index_proxy.json
  rsdash/dr_us.json rsdash/vol_th.json rsdash/corr_th.json
  rsdash/monthly_leaders_th.json rsdash/monthly_leaders_us.json
)
ADD=()
for f in "${FILES[@]}"; do [ -f "$f" ] && ADD+=("$f"); done

git add -- "${ADD[@]}" 2>/dev/null
if git diff --cached --quiet 2>/dev/null; then
  echo "ข้อมูลไม่เปลี่ยน — ไม่ต้อง push"
  exit 0
fi
git commit -q -m "data: อัปเดตข้อมูลรายวัน $(date '+%Y-%m-%d %H:%M')" || { echo "commit ไม่สำเร็จ"; exit 1; }
if timeout 180 git push origin main >/dev/null 2>&1; then
  echo "push ข้อมูลขึ้น GitHub แล้ว"
else
  echo "WARN: push ไม่สำเร็จ"
  exit 1
fi
