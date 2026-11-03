// /api/th?mk=us|th&tk=AAPL — แปลคำอธิบายบริษัท (desc/<mk>/<shard>.json จาก Yahoo, อังกฤษ) เป็นไทย
// ไม่ใช้ LLM: ใช้ตัวแปลฟรีของ Google (translate.googleapis.com, ช่องทางไม่เป็นทางการ) · แปลเมื่อมีคนเปิดหุ้นนั้นแล้ว cache ที่ CDN 30 วัน
// ถ้าแปลไม่ได้ → 502 (หน้าเว็บจะแสดงภาษาอังกฤษเดิม)
const chunks = (t, max = 1800) => {
  const out = []; let cur = "";
  for (const s of t.split(/(?<=[.!?])\s+/)) {
    if (cur && (cur + " " + s).length > max) { out.push(cur); cur = s; } else cur = cur ? cur + " " + s : s;
  }
  if (cur) out.push(cur);
  return out;
};

async function gt(q) {
  const r = await fetch("https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=th&dt=t", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0" },
    body: "q=" + encodeURIComponent(q),
    signal: AbortSignal.timeout(7000),
  });
  if (!r.ok) throw new Error("gt " + r.status);
  const j = await r.json();
  return (j[0] || []).map((x) => x[0] || "").join("");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const mk = req.query.mk === "us" ? "us" : "th";
  const tk = String(req.query.tk || "").toUpperCase();
  if (!/^[A-Z0-9.\-&]{1,12}$/.test(tk)) return res.status(400).json({ error: "bad ticker" });
  const shard = /^[A-Z]/.test(tk) ? tk[0] : "0";
  try {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const src = await fetch(`https://${host}/desc/${mk}/${shard}.json`, { signal: AbortSignal.timeout(5000) });
    if (!src.ok) throw new Error("desc " + src.status);
    const en = (await src.json())[tk];
    if (!en) { res.setHeader("Cache-Control", "public, s-maxage=3600"); return res.status(404).json({ error: "no text" }); }
    const parts = await Promise.all(chunks(String(en)).map(gt));
    const th = parts.join(" ").trim();
    if (!th) throw new Error("empty");
    res.setHeader("Cache-Control", "public, s-maxage=2592000, stale-while-revalidate=86400");
    return res.status(200).json({ tk, th });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: String((e && e.message) || e).slice(0, 100) });
  }
}
