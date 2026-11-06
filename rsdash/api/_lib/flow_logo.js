/* flow_logo.js — proxy โลโก้หุ้น (TradingView S3) ให้เสิร์ฟจากโดเมนเราเอง
   เหตุผล: ดึงจาก s3-symbol-logo ตรง ๆ แล้ววาดลง canvas จะทำให้ canvas "tainted" → toDataURL ล้ม (การ์ดแชร์ไม่ขึ้น)
   ใช้: /api/flow?kind=logo&id=<logoid>  (หรือ tk=<ticker>&mk=th|us เมื่อไม่มี logoid → ตอบ 404 ให้เว็บถอยไปใช้ตัวอักษรย่อ)
*/
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const CACHE = (globalThis.__logoCache = globalThis.__logoCache || new Map());

export default async function handler(req, res) {
  const id = String(req.query.id || "").trim();
  if (!/^[a-z0-9._-]{1,80}$/i.test(id)) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(400).json({ error: "id ไม่ถูกต้อง" });
  }
  const hit = CACHE.get(id);
  if (hit && Date.now() - hit.t < 7 * 864e5) {
    res.setHeader("Content-Type", hit.ct);
    res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=2592000");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).send(hit.body);
  }
  try {
    const r = await fetch(`https://s3-symbol-logo.tradingview.com/${encodeURIComponent(id)}.svg`, {
      headers: { "User-Agent": UA, Accept: "image/svg+xml,image/*" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.status(404).json({ error: "logo not found" });
    }
    const ct = r.headers.get("content-type") || "image/svg+xml";
    const body = Buffer.from(await r.arrayBuffer());
    CACHE.set(id, { t: Date.now(), ct, body });
    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=2592000");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).send(body);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: String((e && e.message) || e).slice(0, 80) });
  }
}
