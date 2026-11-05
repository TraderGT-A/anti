/* share.js — พื้นฐานบริษัทในป็อปอัป + ปุ่มแชร์การ์ดหุ้นเป็นรูปภาพ (1080×1350)
   ใช้: FundRender(tk, mk, elId) · ShareCard.open(tk, nm, mk) */
(function (g) {
  "use strict";
  const F = {};
  const shardOf = (tk) => { const c = String(tk || "").charAt(0).toUpperCase(); return c >= "A" && c <= "Z" ? c : "0"; };
  const mk2 = (mk) => (mk === "america" ? "us" : "th");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const fmtN = (v, d = 1) => (v == null || isNaN(v) ? "—" : Number(v).toFixed(d));
  const fmtPct = (v) => (v == null || isNaN(v) ? "—" : (v >= 0 ? "+" : "") + (Number(v) * 100).toFixed(1) + "%");
  const fmtCap = (v) => {
    if (v == null || !isFinite(v)) return "—";
    if (v >= 1e12) return (v / 1e12).toFixed(2) + "T";
    if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(0) + "M";
    return String(Math.round(v));
  };
  const fmtBig = (v) => {
    if (v == null || !isFinite(v)) return "—";
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return (v / 1e6).toFixed(0) + "M";
    if (a >= 1e3) return (v / 1e3).toFixed(0) + "K";
    return String(Math.round(v));
  };

  async function loadFund(tk, mk) {
    const key = mk2(mk) + "/" + shardOf(tk);
    if (!F[key]) F[key] = fetch("/fund/" + key + ".json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    const m = await F[key];
    return (m && m[tk]) || null;
  }

  /* ---------- พื้นฐานใต้คำอธิบายบริษัท ---------- */
  function fundChips(f) {
    const it = [];
    if (f.pe != null) it.push(["P/E", fmtN(f.pe)]);
    if (f.ps != null) it.push(["P/S", fmtN(f.ps, 2)]);
    if (f.pb != null) it.push(["P/B", fmtN(f.pb, 2)]);
    if (f.gm != null) it.push(["กำไรขั้นต้น", fmtPct(f.gm)]);
    if (f.nm != null) it.push(["กำไรสุทธิ", fmtPct(f.nm)]);
    if (f.dy != null) it.push(["ปันผล", (Number(f.dy) * 100).toFixed(2) + "%"]);
    if (f.mcap != null) it.push(["Mcap", fmtCap(f.mcap)]);
    if (f.revG != null) it.push(["รายได้ YoY", fmtPct(f.revG)]);
    if (f.epsG != null) it.push(["กำไร YoY", fmtPct(f.epsG)]);
    return it;
  }

  function quarterBars(f) {
    const q = (f && f.q) || [];
    if (!q.length) return "";
    const mx = Math.max(...q.map((x) => Math.abs(x.ni || 0)), 1);
    const rows = q.map((x) => {
      const h = Math.max(3, Math.round((Math.abs(x.ni || 0) / mx) * 46));
      const up = (x.ni || 0) >= 0;
      return `<div class="fb-q"><div class="fb-b" style="height:${h}px;background:${up ? "var(--up)" : "var(--down)"}" title="${esc(x.d)} · กำไร ${fmtBig(x.ni)}"></div><span>${esc((x.d || "").slice(2, 7))}</span></div>`;
    }).join("");
    return `<div class="fb-chart"><div class="fb-lbl">กำไรสุทธิรายไตรมาส (${q.length} ไตรมาสล่าสุด)</div><div class="fb-bars">${rows}</div><div class="fb-rev">รายได้ล่าสุด ${fmtBig(q[q.length - 1].rev)}</div></div>`;
  }

  async function FundRender(tk, mk, elId) {
    const el = document.getElementById(elId || "modalFund");
    if (!el) return;
    el.innerHTML = "";
    const f = await loadFund(tk, mk);
    if (!f || !Object.keys(f).length) return;
    if (activeTicker !== tk) return;
    const chips = fundChips(f);
    el.innerHTML =
      `<div class="fb-wrap"><div class="fb-hd">📊 พื้นฐาน <span class="fb-src">Yahoo Finance · ${esc(f.t || "")}</span></div>` +
      `<div class="fb-chips">${chips.map(([k, v]) => `<span class="fb-chip"><i>${esc(k)}</i><b>${esc(v)}</b></span>`).join("")}</div>` +
      quarterBars(f) + `</div>`;
  }


  /* ---------- โลโก้หุ้น (TradingView S3 รองรับ CORS · ไม่มี = วงกลมตัวอักษรย่อ) ---------- */
  const LOGO_CACHE = {};
  function avatarData(tk) {
    try { if (g.avatarUrl) return g.avatarUrl(tk); } catch (e) {}
    const s = String(tk || "?").replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#3a3044"/><text x="16" y="21" font-size="13" font-weight="700" text-anchor="middle" fill="#fff" font-family="Arial">${s}</text></svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  async function stockLogo(tk, mk) {
    const key = (mk === "america" ? "us" : "th") + ":" + tk;
    if (LOGO_CACHE[key]) return LOGO_CACHE[key];
    let url = "";
    try { url = (g.tvLogoUrl ? g.tvLogoUrl(tk, mk) : "") || ""; } catch (e) {}
    const img = await loadImg(url || avatarData(tk));
    const ok = img && img.naturalWidth > 0 ? img : await loadImg(avatarData(tk));
    LOGO_CACHE[key] = ok;
    return ok;
  }

  /* ---------- การ์ดแชร์แบบรายการ (Buy วันนี้ / งบวันนี้ / Pivot ฯลฯ) ---------- */
  async function drawList(opts) {
    const th = (document.documentElement.getAttribute("data-theme") === "light") ? THEMES.light : THEMES.dark;
    const W = 1080, H = 1350;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d");
    const rows = (opts.rows || []).slice(0, opts.max || 11);
    const logo = await loadImg("/brand/thus-symbol-white.png");
    const thumbs = await Promise.all(rows.map((r) => stockLogo(r.ticker || r.tk, opts.mk)));

    const grd = x.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, th.bg); grd.addColorStop(1, th.bg2);
    x.fillStyle = grd; x.fillRect(0, 0, W, H);
    x.strokeStyle = th.line; x.lineWidth = 3; rr(x, 28, 28, W - 56, H - 56, 36); x.stroke();

    if (logo) { try { x.drawImage(logo, 70, 66, 54, 54); } catch (e) {} }
    x.fillStyle = th.text; x.font = font(900, 34); x.fillText("THUS", 140, 108);
    x.fillStyle = th.muted; x.font = font(500, 22); x.textAlign = "right";
    x.fillText(new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" }), W - 70, 100);
    x.textAlign = "left";

    x.fillStyle = th.text; x.font = font(900, 60); x.fillText((opts.title || "").slice(0, 30), 70, 232);
    if (opts.sub) { x.fillStyle = th.muted; x.font = font(500, 24); x.fillText(String(opts.sub).slice(0, 70), 70, 274); }

    let y = 322;
    const rowH = Math.min(88, Math.floor((1090 - y) / Math.max(rows.length, 1)));
    rows.forEach((r, i) => {
      const tk = r.ticker || r.tk || "";
      x.fillStyle = th.panel; rr(x, 70, y, W - 140, rowH - 10, 16); x.fill();
      x.strokeStyle = th.line; x.lineWidth = 1.5; x.stroke();
      const t = thumbs[i];
      if (t) { x.save(); rr(x, 86, y + (rowH - 10) / 2 - 24, 48, 48, 24); x.clip(); x.drawImage(t, 86, y + (rowH - 10) / 2 - 24, 48, 48); x.restore(); }
      x.fillStyle = th.text; x.font = font(800, 30); x.fillText(tk, 150, y + rowH / 2 + 8);
      const sub = [String(r.industry || r.sector || r.group || "").slice(0, 22), String(r.lead || "").toLowerCase() === "leading" ? "★ นำตลาด" : ""].filter(Boolean).join(" · ");
      if (sub) { x.fillStyle = th.muted; x.font = font(500, 19); x.fillText(sub, 150, y + rowH / 2 + 30); }
      // ขวา: ราคา + %เปลี่ยน + RS
      const px = r.price != null ? Number(r.price).toFixed(2) : "—";
      x.textAlign = "right";
      x.fillStyle = th.text; x.font = font(800, 30); x.fillText(px, W - 190, y + rowH / 2 + 4);
      const ch = r.change != null ? Number(r.change) : null;
      if (ch != null) { x.fillStyle = ch >= 0 ? th.up : th.down; x.font = font(700, 22); x.fillText((ch >= 0 ? "+" : "") + ch.toFixed(2) + "%", W - 190, y + rowH / 2 + 30); }
      const rs = r.rs != null ? r.rs : (r.rs3 != null ? r.rs3 : null);
      x.fillStyle = th.gold; x.font = font(800, 26); x.fillText(rs != null ? "RS " + rs : "", W - 88, y + rowH / 2 + 10);
      x.textAlign = "left";
      y += rowH;
    });
    if (!rows.length) { x.fillStyle = th.muted; x.font = font(600, 30); x.fillText("ยังไม่มีรายการ", 90, 420); }

    x.fillStyle = th.muted; x.font = font(500, 24);
    x.textAlign = "right";
    x.fillText(opts.note || "ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน", W - 70, H - 82);
    x.textAlign = "left";
    return c;
  }

  /* ---------- การ์ดแชร์ ---------- */
  const THEMES = {
    dark: { bg: "#0B0910", bg2: "#15101B", panel: "#15101B", line: "#2A2233", text: "#F1EDF5", body: "#D9D2E0", muted: "#A597AD", gold: "#D4B67A", up: "#5CC6C8", down: "#F59A8C" },
    light: { bg: "#EFEEE9", bg2: "#FAF9F6", panel: "#FAF9F6", line: "#DED9D0", text: "#1F1A24", body: "#3B3342", muted: "#5E5468", gold: "#7A5C24", up: "#0B6E70", down: "#A63B27" },
  };
  const FONT = '600 %spx Inter, "IBM Plex Sans Thai", "Leelawadee UI", "Noto Sans Thai", sans-serif';
  const font = (w, s) => FONT.replace("600", w).replace("%s", s);

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function loadImg(src) {
    return new Promise((res) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  }

  async function barsOf(tk, mk) {
    try {
      const r = await fetch(`/api/chart?market=${mk}&symbol=${encodeURIComponent(tk)}&interval=1d&range=1y`);
      const j = await r.json();
      return (j && j.data) || [];
    } catch (e) { return []; }
  }

  const SCAN = {};
  async function rowOf(tk, mk) {
    const arr = (g.stockDB && (mk === "america" ? g.stockDB.america : g.stockDB.thailand)) || [];
    const hit = arr.find((x) => x.ticker === tk);
    if (hit && hit.price != null) return hit;
    // ไม่มีในหน่วยความจำ (เช่น เพิ่งเปิดหน้า/ตลาดอื่น) → ดึงจาก /api/scan
    const key = mk;
    if (!SCAN[key]) SCAN[key] = fetch("/api/scan?market=" + mk + (mk === "america" ? "&universe=all" : "")).then((r) => r.json()).then((j) => (j && j.data) || []).catch(() => []);
    const rows = await SCAN[key];
    return rows.find((x) => x.ticker === tk) || hit || null;
  }

  async function draw(tk, nm, mk) {
    const th = (document.documentElement.getAttribute("data-theme") === "light") ? THEMES.light : THEMES.dark;
    const W = 1080, H = 1350;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d");
    const row = (await rowOf(tk, mk)) || {};
    const [f, bars, logo, tlogo] = await Promise.all([loadFund(tk, mk), barsOf(tk, mk), loadImg("/brand/thus-symbol-white.png"), stockLogo(tk, mk)]);

    // พื้นหลัง
    const grd = x.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, th.bg); grd.addColorStop(1, th.bg2);
    x.fillStyle = grd; x.fillRect(0, 0, W, H);
    x.strokeStyle = th.line; x.lineWidth = 3; rr(x, 28, 28, W - 56, H - 56, 36); x.stroke();

    // หัวเว็บ
    if (logo) { try { x.drawImage(logo, 70, 66, 54, 54); } catch (e) {} }
    x.fillStyle = th.text; x.font = font(900, 34); x.textBaseline = "alphabetic";
    x.fillText("THUS", 140, 108);
    x.fillStyle = th.muted; x.font = font(500, 22); x.textAlign = "right";
    x.fillText(new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" }), W - 70, 100);
    x.textAlign = "left";

    // โลโก้หุ้น + ชื่อย่อ
    let nameX = 70;
    if (tlogo) {
      x.save();
      rr(x, 70, 168, 96, 96, 48); x.clip(); x.drawImage(tlogo, 70, 168, 96, 96); x.restore();
      nameX = 190;
    }
    x.fillStyle = th.text; x.font = font(900, 84);
    x.fillText(tk, nameX, 250);
    const tw = x.measureText(tk).width;
    x.fillStyle = th.muted; x.font = font(700, 24);
    x.fillText(mk === "america" ? "US" : "TH", nameX + tw + 20, 214);
    x.fillStyle = th.body; x.font = font(500, 28);
    x.fillText((nm || "").slice(0, 40), nameX, 296);
    // กลุ่มหุ้น + สถานะนำตลาด
    let tx = nameX;
    const grp = (row.industry || row.sector || row.group || "").slice(0, 26);
    if (grp) { x.fillStyle = th.muted; x.font = font(600, 22); x.fillText(grp, tx, 336); tx += x.measureText(grp).width + 16; }
    const isLead = String(row.lead || "").toLowerCase() === "leading";
    if (isLead) { x.fillStyle = th.gold; x.font = font(800, 22); x.fillText("★ นำตลาด", tx, 336); }

    // ราคา
    const lastBar = bars.length ? bars[bars.length - 1] : null;
    const px = row.price != null ? row.price : (lastBar ? (lastBar.c ?? lastBar.close) : null);
    const prevBar = bars.length > 1 ? bars[bars.length - 2] : null;
    const chg = row.change != null ? row.change : (px != null && prevBar ? ((px / (prevBar.c ?? prevBar.close) - 1) * 100) : null);
    x.fillStyle = th.text; x.font = font(800, 84);
    x.fillText(px != null ? Number(px).toFixed(2) : "—", 70, 430);
    if (chg != null) {
      x.fillStyle = chg >= 0 ? th.up : th.down; x.font = font(800, 40);
      x.fillText((chg >= 0 ? "▲ +" : "▼ ") + Number(chg).toFixed(2) + "%", 84, 486);
    }

    // แถวสถิติ
    const rs = row.rs != null ? row.rs : (row.rs3 != null ? row.rs3 : (row.rs6 != null ? row.rs6 : (row.rs1 != null ? row.rs1 : "—")));
    const hi = f && f.hi ? f.hi : null;
    const toHi = (hi && px) ? ((px / hi - 1) * 100) : null;
    const stats = [["RS", String(rs)], ["จาก 52W สูง", toHi == null ? "—" : toHi.toFixed(1) + "%"], ["3 เดือน", row.p3m != null ? (row.p3m >= 0 ? "+" : "") + Number(row.p3m).toFixed(1) + "%" : "—"], ["Mcap", f && f.mcap ? fmtCap(f.mcap) : (row.mcap ? fmtCap(row.mcap) : "—")]];
    const bw = (W - 140 - 3 * 18) / 4;
    stats.forEach((s, i) => {
      const bx = 70 + i * (bw + 18);
      x.fillStyle = th.panel; rr(x, bx, 530, bw, 108, 20); x.fill();
      x.strokeStyle = th.line; x.lineWidth = 2; x.stroke();
      x.fillStyle = th.muted; x.font = font(600, 22); x.fillText(s[0], bx + 22, 572);
      x.fillStyle = th.text; x.font = font(800, 40); x.fillText(s[1], bx + 22, 618);
    });

    // กราฟ 1 ปี
    x.fillStyle = th.panel; rr(x, 70, 668, W - 140, 300, 24); x.fill();
    x.strokeStyle = th.line; x.lineWidth = 2; x.stroke();
    if (bars.length > 5) {
      const xs = bars.map((b) => b.t || b.time || b.date);
      let lo = Infinity, up2 = -Infinity;
      bars.forEach((b) => { const l = b.l ?? b.low, h = b.h ?? b.high; if (l != null && l < lo) lo = l; if (h != null && h > up2) up2 = h; });
      const padL = 100, padR = 100, py0 = 700, py1 = 930;
      const X = (i) => padL + (i / (bars.length - 1)) * (W - padL - padR);
      const Y = (v) => py1 - ((v - lo) / (up2 - lo || 1)) * (py1 - py0);
      x.beginPath();
      bars.forEach((b, i) => { const cl = b.c ?? b.close; const yy = Y(cl); if (i === 0) x.moveTo(X(i), yy); else x.lineTo(X(i), yy); });
      x.strokeStyle = th.gold; x.lineWidth = 4; x.lineJoin = "round"; x.stroke();
      x.lineTo(X(bars.length - 1), py1); x.lineTo(X(0), py1); x.closePath();
      x.globalAlpha = 0.12; x.fillStyle = th.gold; x.fill(); x.globalAlpha = 1;
      const lastc = bars[bars.length - 1].c ?? bars[bars.length - 1].close;
      x.beginPath(); x.arc(X(bars.length - 1), Y(lastc), 8, 0, Math.PI * 2); x.fillStyle = th.gold; x.fill();
      if (lo < Infinity) {
        x.fillStyle = th.muted; x.font = font(600, 22);
        x.fillText(hi ? "52W " + Number(hi).toFixed(2) : "", 84, 690);
      }
    } else {
      x.fillStyle = th.muted; x.font = font(600, 26); x.fillText("ไม่มีข้อมูลกราฟ", 96, 828);
    }

    // พื้นฐาน
    const chips = f ? fundChips(f).slice(0, 6) : [];
    x.fillStyle = th.muted; x.font = font(700, 24); x.fillText("พื้นฐาน", 70, 1024);
    chips.forEach((kv, i) => {
      const cx = 70 + (i % 3) * ((W - 140) / 3), cy = 1046 + Math.floor(i / 3) * 92;
      x.fillStyle = th.panel; rr(x, cx, cy, (W - 140) / 3 - 14, 78, 18); x.fill();
      x.strokeStyle = th.line; x.lineWidth = 2; x.stroke();
      x.fillStyle = th.muted; x.font = font(600, 21); x.fillText(kv[0], cx + 20, cy + 30);
      x.fillStyle = th.text; x.font = font(800, 32); x.fillText(kv[1], cx + 20, cy + 64);
    });

    // ท้าย
    x.fillStyle = th.muted; x.font = font(500, 24);
    x.textAlign = "right";
    x.fillText("ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน", W - 70, H - 82);
    x.textAlign = "left";
    return c;
  }

  const css = () => `
  .fb-wrap{margin-top:8px;border:1px solid var(--line);background:var(--panel2);border-radius:10px;padding:8px 10px}
  .fb-hd{font-size:11px;font-weight:600;color:var(--muted);margin-bottom:6px}
  .fb-src{font-weight:400;color:var(--faint)}
  .fb-chips{display:flex;flex-wrap:wrap;gap:6px}
  .fb-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:3px 8px;font-size:11px}
  .fb-chip i{font-style:normal;color:var(--muted)}
  .fb-chip b{color:var(--text);font-variant-numeric:tabular-nums}
  .fb-chart{margin-top:8px;border-top:1px solid var(--line);padding-top:7px}
  .fb-lbl{font-size:10.5px;color:var(--muted);margin-bottom:5px}
  .fb-bars{display:flex;align-items:flex-end;gap:10px;height:56px}
  .fb-q{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;min-width:34px}
  .fb-b{width:22px;border-radius:4px 4px 0 0}
  .fb-q span{font-size:9.5px;color:var(--faint);white-space:nowrap}
  .fb-rev{font-size:10px;color:var(--faint);margin-top:4px}
  .sh-modal{position:fixed;inset:0;z-index:80;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.72);padding:14px}
  .sh-modal.on{display:flex}
  .sh-box{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:10px;max-width:min(92vw,520px);max-height:92vh;overflow:auto}
  .sh-img{width:100%;height:auto;border-radius:10px;display:block}
  .sh-row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
  .sh-btn{flex:1;min-width:120px;height:38px;border-radius:9px;border:1px solid var(--line2);background:var(--panel2);color:var(--text);font-size:13px;font-weight:600;cursor:pointer}
  .sh-btn.primary{background:var(--accent);color:var(--onaccent);border-color:var(--accent)}
  .sh-note{font-size:11px;color:var(--muted);margin-top:8px;text-align:center}
  #modalShare{position:absolute;top:10px;right:52px;display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 10px;border-radius:999px;border:1px solid var(--line2);background:var(--panel2);color:var(--text);font-size:12px;font-weight:600;cursor:pointer}
  #modalShare:hover{border-color:var(--goldline)}
  `;

  function ensureCss() {
    if (document.getElementById("shareCss")) return;
    const s = document.createElement("style");
    s.id = "shareCss"; s.textContent = css();
    document.head.appendChild(s);
  }

  const ShareCard = {
    async openList(opts) {
      ensureCss();
      let box = document.getElementById("shModal");
      if (!box) return;
      box.classList.add("on");
      const img = document.getElementById("shImg");
      const c = await drawList(opts);
      const url = c.toDataURL("image/png");
      img.src = url;
      const fname = `rsdash_${(opts.title || "list").replace(/[^\w\u0E00-\u0E7F]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.png`;
      document.getElementById("shDl").onclick = () => { const a = document.createElement("a"); a.href = url; a.download = fname; a.click(); };
      document.getElementById("shShare").onclick = async () => {
        try {
          const blob = await (await fetch(url)).blob();
          const file = new File([blob], fname, { type: "image/png" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: opts.title || "RS Dashboard" });
          else { const a = document.createElement("a"); a.href = url; a.download = fname; a.click(); }
        } catch (e) { const a = document.createElement("a"); a.href = url; a.download = fname; a.click(); }
      };
    },
    async open(tk, nm, mk) {
      ensureCss();
      let box = document.getElementById("shModal");
      if (!box) {
        box = document.createElement("div");
        box.id = "shModal"; box.className = "sh-modal";
        box.innerHTML = `<div class="sh-box"><img id="shImg" class="sh-img" alt="share card" /><div class="sh-row"><button class="sh-btn primary" id="shDl">ดาวน์โหลด PNG</button><button class="sh-btn" id="shShare">แชร์</button><button class="sh-btn" id="shClose">ปิด</button></div><div class="sh-note">1080 × 1350 px · พร้อมลงโซเชียล</div></div>`;
        document.body.appendChild(box);
        box.addEventListener("click", (e) => { if (e.target === box) box.classList.remove("on"); });
        document.getElementById("shClose").onclick = () => box.classList.remove("on");
      }
      box.classList.add("on");
      const img = document.getElementById("shImg");
      img.src = "";
      const c = await draw(tk, nm, mk);
      const url = c.toDataURL("image/png");
      img.src = url;
      const fname = `rsdash_${tk}_${new Date().toISOString().slice(0, 10)}.png`;
      document.getElementById("shDl").onclick = () => {
        const a = document.createElement("a"); a.href = url; a.download = fname; a.click();
      };
      document.getElementById("shShare").onclick = async () => {
        try {
          const blob = await (await fetch(url)).blob();
          const file = new File([blob], fname, { type: "image/png" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: tk + " · RS Dashboard" });
          } else {
            const a = document.createElement("a"); a.href = url; a.download = fname; a.click();
          }
        } catch (e) {
          const a = document.createElement("a"); a.href = url; a.download = fname; a.click();
        }
      };
    },
  };

  g.FundRender = FundRender;
  g.ShareCard = ShareCard;
})(globalThis);
