#!/usr/bin/env python
"""สรุป MD&A งบไทย (จาก SET) เป็นภาษาไทยสั้น ๆ ด้วย agy

อ่าน rsdash/set_earn.json → เฉพาะหุ้นที่ยังไม่มีคีย์ "sum" → เรียก agy สรุป
แล้วเขียนกลับ: sum = { yoy, qoq, note, nums }

Usage:
  python scripts/news/set_summarize.py            # สรุปเฉพาะที่ยังไม่มี
  python scripts/news/set_summarize.py --force    # สรุปใหม่ทั้งหมด
  python scripts/news/set_summarize.py --only KCE,PTT
"""
import argparse, json, os, re, subprocess, sys, tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "rsdash", "set_earn.json")

PROMPT = """คุณเป็นนักวิเคราะห์หลักทรัพย์ไทย อ่านคำอธิบายและวิเคราะห์ของฝ่ายจัดการ (MD&A) ต่อไปนี้
แล้วสรุปเป็นภาษาไทยล้วน ๆ (ไม่ต้องมีอักษรอังกฤษ ยกเว้นชื่อบริษัท/โครงการ/ตัวเลข)

ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่นนอก JSON รูปแบบ:
{"yoy":"สาเหตุที่กำไรโตหรือลดเมื่อเทียบปีก่อน กระชับ 1-2 ประโยค","qoq":"สาเหตุที่เปลี่ยนเมื่อเทียบไตรมาสก่อน 1-2 ประโยค (ถ้าไม่มีข้อมูลให้ใส่ \\"\\")","note":"ประเด็นสำคัญอื่น เช่น รายการพิเศษ ขาดทุนด้อยค่า ขาดทุนอัตราแลกเปลี่ยน 1 ประโยค","nums":{"rev":"รายได้ไตรมาสนี้ (ล้านบาท)","profit":"กำไรสุทธิไตรมาสนี้ (ล้านบาท)","yoy":"% เปลี่ยนแปลงกำไรเทียบปีก่อน","qoq":"% เปลี่ยนแปลงกำไรเทียบไตรมาสก่อน"}}

กติกา: ใช้เฉพาะข้อมูลในเอกสาร ห้ามแต่งเติมตัวเลข ถ้าข้อมูลใดไม่มีให้ใส่ "" หรือ null

=== MD&A ===
<<TEXT>>
"""


def call_agy(text, model_timeout=240):
    fd, path = tempfile.mkstemp(suffix=".txt")
    os.close(fd)
    with open(path, "w", encoding="utf-8") as f:
        f.write(PROMPT.replace("<<TEXT>>", text))
    try:
        r = subprocess.run(["agy", "-p", "@" + path, "--output-format", "text", "--dangerously-skip-permissions"],
                           capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=model_timeout, stdin=subprocess.DEVNULL)
        out = (r.stdout or "").strip()
        if not out and r.stderr:
            print("   agy stderr:", r.stderr[:200])
        return out
    except subprocess.TimeoutExpired:
        print("   agy timeout — ข้ามตัวนี้", flush=True)
        return ""
    except Exception as e:
        print("   agy error:", e, flush=True)
        return ""
    finally:
        try:
            os.unlink(path)
        except Exception:
            pass


def parse_json(s):
    if not s:
        return None
    i = s.find("{")
    j = s.rfind("}")
    if i < 0 or j <= i:
        return None
    try:
        return json.loads(s[i:j + 1])
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", default="")
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()

    data = json.load(open(SRC, encoding="utf-8"))
    items = data.get("items", {})
    only = {x.strip().upper() for x in a.only.split(",") if x.strip()}
    todo = []
    for tk, it in items.items():
        if only and tk.upper() not in only:
            continue
        if not a.force and it.get("sum"):
            continue
        if not it.get("mdna_full"):
            continue
        todo.append(tk)
    if a.limit:
        todo = todo[: a.limit]
    print(f"จะสรุป {len(todo)} ตัว: {', '.join(todo[:12])}{'…' if len(todo) > 12 else ''}", flush=True)

    for tk in todo:
        it = items[tk]
        txt = it.get("mdna_full", "")[:16000]
        out = call_agy(txt)
        js = parse_json(out)
        if not js:
            print(f"  {tk}: สรุปไม่ได้ (ตอบไม่เป็น JSON) {out[:80]!r}", flush=True)
            continue
        it["sum"] = js
        items[tk] = it
        data["items"] = items
        json.dump(data, open(SRC, "w", encoding="utf-8"), ensure_ascii=False)
        print(f"  {tk}: {str(js.get('yoy'))[:90]}", flush=True)

    data["items"] = items
    json.dump(data, open(SRC, "w", encoding="utf-8"), ensure_ascii=False)
    print("บันทึก", SRC)


if __name__ == "__main__":
    main()
