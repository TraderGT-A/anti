#!/usr/bin/env bash
# SET earnings update — ดึงงบไทยล่าสุด + สรุป MD&A + แจ้งเตือนหุ้นที่มีงบใหม่
# ใช้โดย cron: ทุก 3 ชม. ช่วงตลาดเปิด + รอบสุดท้ายหลังปิด
set -u
ROOT="C:/Users/Tar/OneDrive/เดสก์ท็อป/THUSHOUSE"
cd "$ROOT" || exit 1

OUT_JSON="rsdash/set_earn.json"
BEFORE=""
if [ -f "$OUT_JSON" ]; then
  BEFORE=$(python -c "import json;d=json.load(open(r'$OUT_JSON',encoding='utf-8'));print(','.join(sorted(d.get('items',{}).keys())))" 2>/dev/null)
fi

echo "── SET earnings $(date '+%d/%m %H:%M') ──"
timeout 900 python scripts/news/set_fetch.py --days 5 --limit 30 2>&1 | grep -E "พบข่าวงบ|หุ้นที่มีงบใหม่|ข้าม|ผิดพลาด|NEW_TICKERS|เขียน" | tail -40

# สรุป MD&A เฉพาะที่ยังไม่มี
timeout 1500 python scripts/news/set_summarize.py --limit 10 2>&1 | grep -vE "^\s*$" | tail -15

NEW=$(python -c "
import json
d=json.load(open(r'$OUT_JSON',encoding='utf-8'))
print(','.join(d.get('new_tickers') or []))" 2>/dev/null)

if [ -z "$NEW" ]; then
  echo "ไม่มีหุ้นงบใหม่อัปเดตในรอบนี้"
  exit 0
fi

echo ""
echo "มีงบตลาดไทย Update: $NEW"
python - "$NEW" <<'PY'
import json, sys
new = [t for t in sys.argv[1].split(',') if t]
d = json.load(open('rsdash/set_earn.json', encoding='utf-8'))
items = d.get('items', {})
for tk in new:
    it = items.get(tk, {})
    s = it.get('sum') or {}
    q = it.get('quarter') or '—'
    head = f"- {tk} (ไตรมาส {q}): "
    body = s.get('yoy') or ''
    if s.get('qoq'):
        body += (' ' if body else '') + 'QoQ: ' + s['qoq']
    if not body:
        body = "ยังสรุปไม่ได้ (ดึง MD&A ไม่ครบ) — เปิดลิงก์ SET เพื่ออ่านฉบับเต็ม"
    print(head + body)
PY
