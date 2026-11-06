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
  function fundGroups(f) {
    const val = [], gro = [];
    if (f.pe != null) val.push(["P/E", fmtN(f.pe), null]);
    if (f.ps != null) val.push(["P/S", fmtN(f.ps, 2), null]);
    if (f.pb != null) val.push(["P/B", fmtN(f.pb, 2), null]);
    if (f.dy != null) val.push(["ปันผล", (Number(f.dy) * 100).toFixed(2) + "%", null]);
    if (f.mcap != null) val.push(["Mcap", fmtCap(f.mcap), null]);
    if (f.gm != null) gro.push(["กำไรขั้นต้น", fmtPct(f.gm), f.gm >= 0 ? "up" : "dn"]);
    if (f.nm != null) gro.push(["กำไรสุทธิ", fmtPct(f.nm), f.nm >= 0 ? "up" : "dn"]);
    if (f.revG != null) gro.push(["รายได้ YoY", fmtPct(f.revG), f.revG >= 0 ? "up" : "dn"]);
    if (f.epsG != null) gro.push(["กำไร YoY", fmtPct(f.epsG), f.epsG >= 0 ? "up" : "dn"]);
    return { val, gro };
  }

  function fundChips(f) {
    return fundGroups(f).val.concat(fundGroups(f).gro).map((x) => [x[0], x[1]]);
  }

  function quarterBars(f, cur) {
    const q = (f && f.q) || [];
    if (!q.length) return "";
    const mxN = Math.max(...q.map((x) => Math.abs(x.ni || 0)), 1);
    const mxR = Math.max(...q.map((x) => Math.abs(x.rev || 0)), 1);
    const bars = q.map((x) => {
      const hN = Math.max(3, Math.round((Math.abs(x.ni || 0) / mxN) * 52));
      const hR = Math.max(3, Math.round((Math.abs(x.rev || 0) / mxR) * 52));
      const up = (x.ni || 0) >= 0;
      const dt = String(x.d || "");
      const yy = Number(dt.slice(2, 4)), mm = Number(dt.slice(5, 7));
      const ql = mm ? ("Q" + Math.ceil(mm / 3) + "/" + (yy + 43)) : dt.slice(2, 7);
      const tip = `${dt} · รายได้ ${cur}${fmtBig(x.rev)} · กำไร ${cur}${fmtBig(x.ni)}`;
      return `<div class="fb-q" title="${esc(tip)}">
        <span class="fb-qv">${esc(cur + fmtBig(x.ni))}</span>
        <div class="fb-pair">
          <div class="fb-b rv" style="height:${hR}px"></div>
          <div class="fb-b ni" style="height:${hN}px;background:${up ? "var(--up)" : "var(--down)"}"></div>
        </div>
        <span class="fb-qd">${esc(ql)}</span></div>`;
    }).join("");
    return `<div class="fb-qbox">
      <div class="fb-qlbl">รายได้และกำไรสุทธิรายไตรมาส <i>(${q.length} ไตรมาสล่าสุด · ${cur === "$" ? "USD" : "ล้านบาท"})</i>
        <span class="fb-lg"><i class="rv"></i>รายได้</span><span class="fb-lg"><i class="ni"></i>กำไรสุทธิ</span></div>
      <div class="fb-bars">${bars}</div>
      <div class="fb-note">แท่งรายได้และกำไรใช้สเกลของตัวเอง · ตัวเลขบนหัวแท่งคือกำไรสุทธิ</div>
    </div>`;
  }

  async function FundRender(tk, mk, elId) {
    ensureCss();
    const el = document.getElementById(elId || "modalFund");
    if (!el) return;
    el.innerHTML = "";
    const f = await loadFund(tk, mk);
    if (!f || !Object.keys(f).length) return;
    if (activeTicker !== tk) return;
    const g = fundGroups(f);
    const cur = mk === "america" ? "$" : "฿";
    const cell = (x) => `<div class="fb-cell"><span>${esc(x[0])}</span><b class="${x[2] ? "fb-" + x[2] : ""}">${esc(x[0] === "Mcap" ? cur + x[1] : x[1])}</b></div>`;
    const block = (title, arr) => (arr.length ? `<div class="fb-grp"><div class="fb-gt">${esc(title)}</div><div class="fb-grid">${arr.map(cell).join("")}</div></div>` : "");
    el.innerHTML =
      `<div class="fb-wrap"><div class="fb-hd"><span>📊 พื้นฐาน</span><i>Yahoo Finance · ${esc(f.t || "")}</i></div>` +
      `<div class="fb-body">${block("มูลค่า", g.val)}${block("คุณภาพ / เติบโต", g.gro)}${quarterBars(f, cur)}</div></div>`;
  }


  /* ---------- โลโก้หุ้น (เสิร์ฟผ่านโดเมนเราเอง → canvas บันทึกรูปได้) ---------- */
  const LOGO_CACHE = {};
  function avatarData(tk) {
    try { if (g.avatarUrl) return g.avatarUrl(tk); } catch (e) {}
    const s2 = String(tk || "?").replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#3a3044"/><text x="16" y="21" font-size="13" font-weight="700" text-anchor="middle" fill="#fff" font-family="Arial">${s2}</text></svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  const ALLROWS = {};
  function allRowsOf(mk) {
    if (!ALLROWS[mk]) {
      ALLROWS[mk] = fetch("/api/scan?market=" + mk + "&universe=all")
        .then((r) => r.json()).then((j) => (j && j.data) || []).catch(() => []);
    }
    return ALLROWS[mk];
  }
  function logoIdOf(tk, mk) {
    try { if (typeof LOGO_ID !== "undefined") { const id = LOGO_ID[mk + ":" + tk]; if (id) return id; } } catch (e) {}
    try {
      const arr = (typeof stockDB !== "undefined" && stockDB[mk]) ? stockDB[mk] : [];
      const r = arr.find((x) => x.ticker === tk);
      if (r && r.logoId) return r.logoId;
    } catch (e) {}
    return "";
  }
  async function logoIdAsync(tk, mk) {
    const id = logoIdOf(tk, mk);
    if (id) return id;
    try {
      const rows = await allRowsOf(mk);
      const r = rows.find((x) => x.ticker === tk);
      return (r && r.logoId) || "";
    } catch (e) { return ""; }
  }
  async function stockLogo(tk, mk) {
    const key = (mk === "america" ? "us" : "th") + ":" + tk;
    if (LOGO_CACHE[key]) return LOGO_CACHE[key];
    const id = await logoIdAsync(tk, mk);
    const url = id ? ("/api/flow?kind=logo&id=" + encodeURIComponent(id)) : "";
    const img = await loadImg(url || avatarData(tk));
    const ok = img && img.naturalWidth > 0 ? img : await loadImg(avatarData(tk));
    LOGO_CACHE[key] = ok;
    return ok;
  }

  /* ---------- การ์ดแชร์แบบรายการ (Buy วันนี้ / Pivot / Pivot group) ---------- */
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

    x.fillStyle = th.text; x.font = font(900, 58); x.fillText((opts.title || "").slice(0, 28), 70, 232);
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


  /* ---------- Heatmap card: วาด treemap ลง canvas ---------- */
  function squarify(items, x, y, w, h) {
    const out = [];
    const total = items.reduce((a, b) => a + b.v, 0) || 1;
    let rest = items.slice(), rx = x, ry = y, rw = w, rh = h, rem = total;
    let guard = 0;
    while (rest.length) {
      if (++guard > 500) break;                       // กันวนไม่จบ
      const vsum = rest.reduce((a, b) => a + b.v, 0);
      if (!(vsum > 0)) { rest = []; break; }          // ไม่มีขนาด = จบ
      const horiz = rw >= rh;
      const side = horiz ? rh : rw;
      // ไล่หยิบจน aspect แย่ลง
      let row = [], best = Infinity;
      for (let i = 0; i < rest.length; i++) {
        const cand = row.concat([rest[i]]);
        const sum = cand.reduce((a, b) => a + b.v, 0);
        const thick = (sum / rem) * (horiz ? rw : rh);
        const worst = cand.reduce((m, it) => {
          const len = ((it.v / sum) * side) || 1;
          return Math.max(m, Math.max(thick / len, len / thick));
        }, 0);
        if (worst > best && row.length) break;
        best = worst; row = cand;
      }
      const sum = row.reduce((a, b) => a + b.v, 0) || 1;
      const thick = (sum / rem) * (horiz ? rw : rh);
      let off = 0;
      row.forEach((it) => {
        const len = ((it.v / sum) * side);
        if (horiz) out.push({ it, x: rx, y: ry + off, w: thick, h: len });
        else out.push({ it, x: rx + off, y: ry, w: len, h: thick });
        off += len;
      });
      if (horiz) { rx += thick; rw -= thick; } else { ry += thick; rh -= thick; }
      rem -= sum; rest = rest.slice(row.length);
    }
    return out;
  }
  function heatColor(v, th) {
    const t = Math.max(-1, Math.min(1, v / 3));
    const mid = th === THEMES.dark ? [26, 22, 32] : [232, 229, 220];
    const up = [24, 158, 106], dn = [192, 57, 43];
    const end = t >= 0 ? up : dn, k = Math.abs(t);
    const c = mid.map((m, i) => Math.round(m + (end[i] - m) * (0.18 + 0.82 * k)));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  async function drawHeat(opts) {
    const th = (document.documentElement.getAttribute("data-theme") === "light") ? THEMES.light : THEMES.dark;
    const W = 1080, H = 1350;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    const g2 = x.createLinearGradient(0, 0, W, H);
    g2.addColorStop(0, th.bg); g2.addColorStop(1, th.bg2);
    x.fillStyle = g2; x.fillRect(0, 0, W, H);
    x.strokeStyle = th.line; x.lineWidth = 3; rr(x, 28, 28, W - 56, H - 56, 36); x.stroke();

    const logo = await loadImg("/brand/thus-symbol-white.png");
    if (logo) { try { x.drawImage(logo, 70, 66, 54, 54); } catch (e) {} }
    x.fillStyle = th.text; x.font = font(900, 34); x.fillText("THUS", 140, 108);
    x.fillStyle = th.muted; x.font = font(500, 22); x.textAlign = "right";
    x.fillText(new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" }), W - 70, 100);
    x.textAlign = "left";

    x.fillStyle = th.text; x.font = font(900, 52); x.fillText((opts.title || "Heatmap").slice(0, 26), 70, 200);
    if (opts.sub) { x.fillStyle = th.muted; x.font = font(500, 22); x.fillText(String(opts.sub).slice(0, 62), 70, 238); }

    // พื้นที่ treemap
    const X0 = 70, Y0 = 274, XW = W - 140, XH = 940;
    const tItems = (opts.items || [])
      .filter((it) => (it.mcap || 0) > 0)
      .map((it) => Object.assign({}, it, { v: it.mcap }))
      .sort((a, b) => b.v - a.v);
    const rects = squarify(tItems, X0, Y0, XW, XH);
    // โลโก้บริษัทในบล็อกที่ใหญ่พอ (เสิร์ฟผ่านโดเมนเรา → ไม่ทำให้ canvas เสีย)
    const big = rects.filter((r) => (r.w - 2) > 96 && (r.h - 2) > 78).slice(0, 34);
    const logos = {};
    await Promise.all(big.map(async (r) => {
      const tk = (r.it && r.it.ticker) || "";
      if (!tk) return;
      try { logos[tk] = await stockLogo(tk, opts.mk || "thailand"); } catch (e) {}
    }));
    rects.forEach((r) => {
      const src = r.it || {};
      const chg = Number(src.chg || 0);
      const rx = r.x + 1, ry = r.y + 1, rw = Math.max(0, r.w - 2), rh = Math.max(0, r.h - 2);
      if (rw < 3 || rh < 3) return;
      x.fillStyle = heatColor(chg, th === THEMES.light ? THEMES.light : THEMES.dark);
      x.fillRect(rx, ry, rw, rh);
      if (rw > 52 && rh > 34) {
        const lg = logos[src.ticker];
        const hasLg = !!lg;
        const lgS = hasLg ? Math.max(20, Math.min(40, Math.min(rw, rh) * 0.34)) : 0;
        const fs = Math.max(13, Math.min(30, Math.floor(Math.min(rw / 3.4, rh / 2.6))));
        x.textAlign = "center";
        if (hasLg) {
          // โลโก้วงกลมมุมซ้ายบน
          try {
            x.save();
            x.beginPath(); x.arc(rx + 8 + lgS / 2, ry + 8 + lgS / 2, lgS / 2, 0, Math.PI * 2); x.clip();
            x.drawImage(lg, rx + 8, ry + 8, lgS, lgS); x.restore();
            x.beginPath(); x.arc(rx + 8 + lgS / 2, ry + 8 + lgS / 2, lgS / 2, 0, Math.PI * 2);
            x.strokeStyle = "rgba(255,255,255,.35)"; x.lineWidth = 1.5; x.stroke();
          } catch (e) {}
        }
        x.fillStyle = "#fff";
        x.font = font(800, fs);
        x.fillText(String(src.ticker || "").slice(0, 8), rx + rw / 2, ry + rh / 2 + fs * 0.12);
        if (rh > 58) {
          x.font = font(700, Math.max(11, fs * 0.62));
          x.globalAlpha = 0.92;
          x.fillText((chg >= 0 ? "+" : "") + chg.toFixed(2) + "%", rx + rw / 2, ry + rh / 2 + fs * 0.95);
          x.globalAlpha = 1;
        }
        x.textAlign = "left";
      }
    });

    // legend
    const ly = Y0 + XH + 34;
    x.fillStyle = th.muted; x.font = font(600, 22);
    x.fillText("สี = % เปลี่ยนวันนี้ · ขนาด = มูลค่าตลาด", 70, ly);
    ["-3%", "0", "+3%"].forEach((t, i) => {
      const bx = W - 70 - 240 + i * 80;
      x.fillStyle = i === 0 ? "rgb(192,57,43)" : (i === 1 ? (th === THEMES.dark ? "rgb(26,22,32)" : "rgb(232,229,220)") : "rgb(24,158,106)");
      x.fillRect(bx, ly - 16, 26, 16);
      x.fillStyle = th.muted; x.font = font(500, 18); x.fillText(t, bx + 32, ly);
    });

    x.fillStyle = th.muted; x.font = font(500, 22); x.textAlign = "right";
    x.fillText("ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน", W - 70, H - 78);
    x.textAlign = "left";
    return c;
  }


  /* ---------- การ์ดกราฟรวม: ตารางมินิชาร์ต (โลโก้ + MA20/50 + แบ่งหน้า) ---------- */
  function smaAt(bars, i, n) {
    if (i < n - 1) return null;
    let sum = 0;
    for (let k = i - n + 1; k <= i; k++) sum += (bars[k].close != null ? bars[k].close : bars[k].c);
    return sum / n;
  }
  async function fetchBars(tk, mk, rng) {
    try {
      const r = await fetch('/api/chart?market=' + mk + '&symbol=' + encodeURIComponent(tk) + '&interval=1d&range=' + (rng || '1y'));
      const j = await r.json();
      return (j && j.data) || [];
    } catch (e) { return []; }
  }
  async function warmBars(items, mk) {
    const need = items.filter((it) => !it.bars || !it.bars.length);
    let idx = 0;
    async function worker() {
      while (idx < need.length) {
        const it = need[idx++];
        it.bars = await fetchBars(it.ticker, mk, '1y');
      }
    }
    await Promise.all(Array.from({ length: Math.min(5, need.length) }, worker));
  }
  async function drawGrid(opts) {
    const th = (document.documentElement.getAttribute("data-theme") === "light") ? THEMES.light : THEMES.dark;
    const W = 1080, H = 1350;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    const g2 = x.createLinearGradient(0, 0, W, H);
    g2.addColorStop(0, th.bg); g2.addColorStop(1, th.bg2);
    x.fillStyle = g2; x.fillRect(0, 0, W, H);
    x.strokeStyle = th.line; x.lineWidth = 3; rr(x, 28, 28, W - 56, H - 56, 36); x.stroke();

    const logo = await loadImg("/brand/thus-symbol-white.png");
    if (logo) { try { x.drawImage(logo, 70, 66, 54, 54); } catch (e) {} }
    x.fillStyle = th.text; x.font = font(900, 34); x.fillText("THUS", 140, 108);
    x.fillStyle = th.muted; x.font = font(500, 22); x.textAlign = "right";
    x.fillText(new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" }), W - 70, 100);
    x.textAlign = "left";

    x.fillStyle = th.text; x.font = font(900, 46); x.fillText(String(opts.title || "").slice(0, 26), 70, 196);
    const subTxt = (opts.sub || "") + (opts.pageTotal > 1 ? " · หน้า " + opts.page + "/" + opts.pageTotal : "");
    if (subTxt) { x.fillStyle = th.muted; x.font = font(500, 21); x.fillText(subTxt.slice(0, 74), 70, 230); }

    const items = (opts.items || []).slice(0, 9);
    const cols = 3, rows = Math.ceil(items.length / cols) || 1;
    const X0 = 60, GW = W - 120, GH = 1000;
    const gap = 14, cwid = GW / cols;
    const chei = rows === 1 ? 830 : (rows === 2 ? 470 : 318);
    const Y0 = 262;

    const MA20 = "#e8b04b", MA50 = "#5b9df9";

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const cx = X0 + (i % cols) * cwid + gap / 2;
      const cy = Y0 + Math.floor(i / cols) * chei + gap / 2;
      const cw2 = cwid - gap, ch2 = chei - gap;
      x.fillStyle = th.panel; rr(x, cx, cy, cw2, ch2, 16); x.fill();
      x.strokeStyle = th.line; x.lineWidth = 1.5; x.stroke();

      // โลโก้บริษัท + ชื่อย่อ + RS
      let tx = cx + 14;
      try {
        const lg = await stockLogo(it.ticker, opts.mk || "thailand");
        if (lg && lg.naturalWidth > 0) {
          x.save(); x.beginPath(); x.arc(cx + 14 + 16, cy + 30, 16, 0, Math.PI * 2); x.clip();
          x.drawImage(lg, cx + 14, cy + 14, 32, 32); x.restore();
          x.strokeStyle = th.line; x.lineWidth = 1; x.beginPath(); x.arc(cx + 14 + 16, cy + 30, 16, 0, Math.PI * 2); x.stroke();
          tx = cx + 58;
        }
      } catch (e) {}
      x.fillStyle = th.text; x.font = font(800, 24); x.fillText(String(it.ticker).slice(0, 10), tx, cy + 38);
      if (it.rs != null) { x.fillStyle = th.gold; x.font = font(800, 18); x.textAlign = "right"; x.fillText("RS " + it.rs, cx + cw2 - 14, cy + 36); x.textAlign = "left"; }
      const chg = Number(it.change);
      x.fillStyle = th.body; x.font = font(700, 19);
      x.fillText(it.price != null ? Number(it.price).toFixed(2) : "—", tx, cy + 64);
      if (Number.isFinite(chg)) {
        x.fillStyle = chg >= 0 ? th.up : th.down; x.font = font(700, 16);
        x.fillText((chg >= 0 ? "+" : "") + chg.toFixed(2) + "%", tx + 62, cy + 64);
      }
      x.font = font(600, 12); x.textAlign = "right";
      x.fillStyle = "#e8b04b";
      x.fillText("MA20", cx + cw2 - 14 - 40, cy + 64);
      x.fillStyle = "#5b9df9"; x.fillText("MA50", cx + cw2 - 14, cy + 64);
      x.textAlign = "left";

      // กราฟ: แท่งเทียน + MA20/MA50
      const bars = it.bars || [];
      const px = cx + 10, py = cy + 76, pw = cw2 - 20, ph = ch2 - 100;
      if (bars.length > 10) {
        const n0 = Math.min(bars.length, 60), off = bars.length - n0;
        let lo = Infinity, hi2 = -Infinity;
        for (let k = off; k < bars.length; k++) {
          const b = bars[k];
          const l = b.low != null ? b.low : b.l, hh = b.high != null ? b.high : b.h;
          if (l < lo) lo = l; if (hh > hi2) hi2 = hh;
        }
        const Y = (v) => py + ph - ((v - lo) / (hi2 - lo || 1)) * ph;
        const cw3 = pw / n0;
        x.save(); x.beginPath(); x.rect(px, py, pw, ph); x.clip();   // กันแท่ง/เส้นล้นขอบการ์ด
        for (let j = 0; j < n0; j++) {
          const b = bars[off + j];
          const o = b.open != null ? b.open : b.o, cl = b.close != null ? b.close : b.c;
          const hh = b.high != null ? b.high : b.h, l = b.low != null ? b.low : b.l;
          if (o == null || cl == null) continue;
          const bx = px + j * cw3 + cw3 / 2;
          const col = cl >= o ? th.up : th.down;
          x.strokeStyle = col; x.fillStyle = col; x.lineWidth = Math.max(1, cw3 * 0.12);
          x.beginPath(); x.moveTo(bx, Y(hh)); x.lineTo(bx, Y(l)); x.stroke();
          const bt = Math.min(Y(o), Y(cl)), bh = Math.max(1.2, Math.abs(Y(o) - Y(cl)));
          x.fillRect(bx - Math.max(1, cw3 * 0.3), bt, Math.max(1.4, cw3 * 0.6), bh);
        }
        [[20, MA20], [50, MA50]].forEach(function (pair) {
          const n = pair[0], col = pair[1];
          x.strokeStyle = col; x.lineWidth = 1.6; x.beginPath();
          let started = false;
          for (let j = 0; j < n0; j++) {
            const v = smaAt(bars, off + j, n);
            if (v == null) continue;
            const bx = px + j * cw3 + cw3 / 2;
            if (!started) { x.moveTo(bx, Y(v)); started = true; } else x.lineTo(bx, Y(v));
          }
          if (started) x.stroke();
        });
        x.restore();
      }
    }

    x.fillStyle = th.muted; x.font = font(500, 22); x.textAlign = "right";
    x.fillText("ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน", W - 70, H - 78);
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
    let arr = [];
    try { if (typeof stockDB !== "undefined") arr = (mk === "america" ? stockDB.america : stockDB.thailand) || []; } catch (e) {}
    const hit = arr.find((x) => x.ticker === tk);
    if (hit && hit.price != null) return hit;
    // ไม่มีในหน่วยความจำ (เช่น เพิ่งเปิดหน้า/ตลาดอื่น) → ดึงจาก /api/scan
    const key = mk;
    if (!SCAN[key]) SCAN[key] = fetch("/api/scan?market=" + mk + (mk === "america" ? "&universe=all" : "")).then((r) => r.json()).then((j) => (j && j.data) || []).catch(() => []);
    const rows = await SCAN[key];
    return rows.find((x) => x.ticker === tk) || hit || null;
  }

  async function draw(tk, nm, mk, withLogo) {
    const th = (document.documentElement.getAttribute("data-theme") === "light") ? THEMES.light : THEMES.dark;
    const W = 1080, H = 1350;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d");
    const row = (await rowOf(tk, mk)) || {};
    const [f, bars, logo, tlogo] = await Promise.all([loadFund(tk, mk), barsOf(tk, mk), loadImg("/brand/thus-symbol-white.png"), (withLogo === false ? loadImg(avatarData(tk)) : stockLogo(tk, mk))]);

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

    // กราฟ 1 ปี (แสดง 130 แท่งล่าสุดให้แท่งอ่านง่าย) — bars เป็น const ห้ามเขียนทับ
    const barsS = (Array.isArray(bars) && bars.length > 130) ? bars.slice(-130) : (bars || []);
    x.fillStyle = th.panel; rr(x, 70, 668, W - 140, 300, 24); x.fill();
    x.strokeStyle = th.line; x.lineWidth = 2; x.stroke();
    if (barsS.length > 5) {
      const xs = barsS.map((b) => b.t || b.time || b.date);
      let lo = Infinity, up2 = -Infinity;
      barsS.forEach((b) => { const l = b.l ?? b.low, h = b.h ?? b.high; if (l != null && l < lo) lo = l; if (h != null && h > up2) up2 = h; });
      const padL = 100, padR = 100, py0 = 700, py1 = 930;
      const X = (i) => padL + (i / (barsS.length - 1)) * (W - padL - padR);
      const Y = (v) => py1 - ((v - lo) / (up2 - lo || 1)) * (py1 - py0);
      // แท่งเทียนจริง (ไม่ใช่เส้น) — บอสสั่งให้การ์ดรายตัวเป็นกราฟสวย ๆ
      const n0 = barsS.length, cw0 = (W - padL - padR) / n0;
      barsS.forEach((b, i) => {
        const o = b.o ?? b.open, hh = b.h ?? b.high, ll = b.l ?? b.low, cl = b.c ?? b.close;
        if (o == null || cl == null) return;
        const cx = padL + i * cw0 + cw0 / 2;
        const col = cl >= o ? th.up : th.down;
        x.strokeStyle = col; x.fillStyle = col;
        x.lineWidth = Math.max(1.4, cw0 * 0.12);
        x.beginPath(); x.moveTo(cx, Y(hh)); x.lineTo(cx, Y(ll)); x.stroke();
        const bodyTop = Math.min(Y(o), Y(cl)), bodyH = Math.max(1.6, Math.abs(Y(o) - Y(cl)));
        x.fillRect(cx - Math.max(1.6, cw0 * 0.32), bodyTop, Math.max(2.4, cw0 * 0.64), bodyH);
      });
      // เส้น MA20 (ทอง) และ MA50 (ฟ้า) บนกราฟการ์ดรายตัว
      const MA20C = "#e8b04b", MA50C = "#5b9df9";
      [[20, MA20C], [50, MA50C]].forEach(function (pair) {
        const n = pair[0], col = pair[1];
        x.strokeStyle = col; x.lineWidth = 3; x.beginPath();
        let started = false;
        for (let i = 0; i < n0; i++) {
          const v = smaAt(barsS, i, n);
          if (v == null) continue;
          const bx = padL + i * cw0 + cw0 / 2;
          if (!started) { x.moveTo(bx, Y(v)); started = true; } else x.lineTo(bx, Y(v));
        }
        if (started) x.stroke();
      });
      // คำอธิบายเส้น
      x.font = font(700, 20); x.textAlign = "right";
      x.fillStyle = MA50C; x.fillText("MA50", W - 96, 706);
      x.fillStyle = MA20C; x.fillText("MA20", W - 176, 706);
      x.textAlign = "left";
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
  .fb-wrap{margin-top:8px;border:1px solid var(--line);background:var(--panel2);border-radius:12px;overflow:hidden}
  .fb-hd{display:flex;align-items:center;gap:6px;padding:8px 11px;border-bottom:1px solid var(--line);font-size:11.5px;font-weight:600;color:var(--text)}
  .fb-hd i{font-style:normal;font-weight:400;color:var(--faint);margin-left:auto;font-size:10.5px}
  .fb-body{padding:9px 11px 10px;display:grid;gap:9px}
  .fb-grp{display:grid;gap:5px}
  .fb-gt{font-size:11px;color:var(--body);letter-spacing:.2px}
  .fb-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(84px,1fr));gap:6px}
  .fb-cell{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:6px 8px;display:flex;flex-direction:column;gap:2px;min-width:0}
  .fb-cell span{font-size:10.5px;color:var(--body);opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .fb-cell b{font-size:14px;font-weight:700;color:var(--text);font-variant-numeric:tabular-nums;letter-spacing:-.2px}
  .fb-cell b.fb-up{color:var(--up)}.fb-cell b.fb-dn{color:var(--down)}
  .fb-qbox{border-top:1px solid var(--line);padding-top:8px}
  .fb-qlbl{font-size:10.5px;color:var(--muted);margin-bottom:6px}
  .fb-qlbl i{font-style:normal;color:var(--faint)}
  .fb-bars{display:flex;align-items:flex-end;justify-content:space-around;gap:6px;height:96px}
  .fb-q{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;flex:1;min-width:0}
  .fb-qv{font-size:10.5px;color:var(--body);font-variant-numeric:tabular-nums}
  .fb-pair{display:flex;align-items:flex-end;gap:3px;height:56px}
  .fb-b{width:12px;border-radius:3px 3px 0 0;flex:none}
  .fb-b.rv{background:var(--mk);opacity:.55}
  .fb-lg{display:inline-flex;align-items:center;gap:4px;margin-left:8px;color:var(--muted)}
  .fb-lg i{width:8px;height:8px;border-radius:2px;display:inline-block}
  .fb-lg i.rv{background:var(--mk);opacity:.55}.fb-lg i.ni{background:var(--up)}
  .fb-note{font-size:9.5px;color:var(--faint);margin-top:5px}
  .fb-qd{font-size:10.5px;color:var(--muted);white-space:nowrap}
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


  function ensureShareBox() {
    ensureCss();
    let box = document.getElementById("shModal");
    if (box) return box;
    box = document.createElement("div");
    box.id = "shModal"; box.className = "sh-modal";
    box.innerHTML = `<div class="sh-box"><img id="shImg" class="sh-img" alt="share card" /><div class="sh-row"><button class="sh-btn primary" id="shDl">ดาวน์โหลด PNG</button><button class="sh-btn" id="shShare">แชร์</button><button class="sh-btn" id="shClose">ปิด</button></div><div class="sh-note">1080 × 1350 px · พร้อมลงโซเชียล</div></div>`;
    document.body.appendChild(box);
    box.addEventListener("click", (e) => { if (e.target === box) box.classList.remove("on"); });
    document.getElementById("shClose").onclick = () => box.classList.remove("on");
    return box;
  }

  const ShareCard = {
    async openGrid(opts) {
      const box = ensureShareBox();
      box.classList.add("on");
      const img = document.getElementById("shImg");
      const items = (opts.items || []).slice();
      const mk = opts.mk || "thailand";
      if (!items.length) { alert("ไม่มีหุ้นในรายการ"); return; }
      let pager = document.getElementById("shPager");
      if (!pager) {
        pager = document.createElement("div");
        pager.id = "shPager"; pager.className = "sh-row";
        const row = box.querySelector(".sh-row");
        row.parentNode.insertBefore(pager, row);
      }
      const per = 9, total = Math.max(1, Math.ceil(items.length / per));
      let page = 1, urls = {};
      const name = (p) => `rsdash_cards_${new Date().toISOString().slice(0, 10)}_p${p}.png`;

      async function render(p) {
        page = p;
        img.style.opacity = ".35";
        if (!urls[p]) {
          await warmBars(items.slice((p - 1) * per, p * per), mk);
          const cv = await drawGrid({
            title: opts.title, sub: opts.sub, mk: mk,
            items: items.slice((p - 1) * per, p * per), page: p, pageTotal: total,
          });
          urls[p] = cv.toDataURL("image/png");
        }
        img.src = urls[p]; img.style.opacity = "1";
        pager.innerHTML =
          (total > 1 ? '<button class="sh-btn" id="shPrev"' + (p === 1 ? ' disabled' : '') + '>◀</button>'
            + '<span class="sh-pg">หน้า ' + p + ' / ' + total + '</span>'
            + '<button class="sh-btn" id="shNext"' + (p === total ? ' disabled' : '') + '>▶</button>' : '')
          + (total > 1 ? '<button class="sh-btn" id="shAll">ดาวน์โหลดทั้งหมด</button>' : '');
        const pv = document.getElementById("shPrev"), nx = document.getElementById("shNext"), al = document.getElementById("shAll");
        if (pv) pv.onclick = (e) => { e.preventDefault(); if (page > 1) render(page - 1); };
        if (nx) nx.onclick = (e) => { e.preventDefault(); if (page < total) render(page + 1); };
        if (al) al.onclick = async (e) => {
          e.preventDefault();
          for (let q = 1; q <= total; q++) {
            if (!urls[q]) {
              await warmBars(items.slice((q - 1) * per, q * per), mk);
              const cv = await drawGrid({ title: opts.title, sub: opts.sub, mk: mk, items: items.slice((q - 1) * per, q * per), page: q, pageTotal: total });
              urls[q] = cv.toDataURL("image/png");
            }
            const a = document.createElement("a"); a.href = urls[q]; a.download = name(q); a.click();
            await new Promise((r) => setTimeout(r, 350));
          }
        };
        document.getElementById("shDl").onclick = () => { const a = document.createElement("a"); a.href = urls[page]; a.download = name(page); a.click(); };
        document.getElementById("shShare").onclick = async () => {
          try {
            const blob = await (await fetch(urls[page])).blob();
            const file = new File([blob], name(page), { type: "image/png" });
            if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: opts.title || "RS Dashboard" });
            else { const a = document.createElement("a"); a.href = urls[page]; a.download = name(page); a.click(); }
          } catch (e) { const a = document.createElement("a"); a.href = urls[page]; a.download = name(page); a.click(); }
        };
      }
      await render(1);
    },
    async openHeat(opts) {
      const box = ensureShareBox();
      box.classList.add("on");
      const img = document.getElementById("shImg");
      let url = "";
      try { url = (await drawHeat(opts)).toDataURL("image/png"); } catch (e) { url = ""; }
      if (!url) { box.classList.remove("on"); alert("สร้างการ์ดไม่สำเร็จ ลองใหม่อีกครั้ง"); return; }
      img.src = url;
      const fname = `rsdash_heat_${new Date().toISOString().slice(0, 10)}.png`;
      document.getElementById("shDl").onclick = () => { const a = document.createElement("a"); a.href = url; a.download = fname; a.click(); };
      document.getElementById("shShare").onclick = async () => {
        try {
          const blob = await (await fetch(url)).blob();
          const file = new File([blob], fname, { type: "image/png" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: opts.title || "Heatmap" });
          else { const a = document.createElement("a"); a.href = url; a.download = fname; a.click(); }
        } catch (e) { const a = document.createElement("a"); a.href = url; a.download = fname; a.click(); }
      };
    },
    async openList(opts) {
      const box = ensureShareBox();
      box.classList.add("on");
      const img = document.getElementById("shImg");
      let url = "";
      try { url = (await drawList(opts)).toDataURL("image/png"); }
      catch (e) { url = ""; }
      if (!url) { box.classList.remove("on"); alert("สร้างการ์ดไม่สำเร็จ ลองใหม่อีกครั้ง"); return; }
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
      const box = ensureShareBox();
      box.classList.add("on");
      const img = document.getElementById("shImg");
      img.src = "";
      let url = "";
      try {
        url = (await draw(tk, nm, mk, true)).toDataURL("image/png");
      } catch (e) {
        // โลโก้หุ้นบางตัวไม่มี CORS → canvas tainted: วาดใหม่โดยใช้ตัวอักษรย่อแทน
        try { url = (await draw(tk, nm, mk, false)).toDataURL("image/png"); } catch (e2) { url = ""; }
      }
      if (!url) { box.classList.remove("on"); alert("สร้างการ์ดไม่สำเร็จ ลองใหม่อีกครั้ง"); return; }
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
