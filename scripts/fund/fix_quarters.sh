#!/usr/bin/env bash
# รีเฟรชข้อมูลการเงิน (ไตรมาส) ของหุ้นไทยเป็นชุด ๆ ตามรายชื่อใน scripts/_fixlist.txt
set -u
cd "C:/Users/Tar/OneDrive/เดสก์ท็อป/THUSHOUSE" || exit 1
LIST="scripts/_fixlist.txt"
[ -f "$LIST" ] || { echo "ไม่พบ $LIST"; exit 1; }

i=0
CHUNK=50
while : ; do
  BATCH=$(python - "$LIST" "$i" "$CHUNK" <<'PY'
import sys
p, start, n = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
items = [x.strip() for x in open(p, encoding='utf-8').read().split(',') if x.strip()]
part = items[start:start + n]
print(','.join(part))
PY
)
  [ -z "$BATCH" ] && break
  echo "[chunk] $i: $(echo "$BATCH" | tr ',' '\n' | wc -l) ตัว"
  node scripts/fund/precompute_fund.mjs --mk th --only "$BATCH" --conc 10 </dev/null 2>&1 | tail -2
  i=$((i + CHUNK))
done
echo "จบการรีเฟรช"
