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
    const th = THEMES.dark;
    const W = 1080, H = 1350;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    const rows = (opts.rows || []).slice(0, opts.max || 12);
    const logo = await loadImg("/brand/thus-symbol-white.png");
    const thumbs = await Promise.all(rows.map((r) => stockLogo(r.ticker || r.tk, opts.mk)));

    const grd = x.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, th.bg); grd.addColorStop(1, th.bg2);
    x.fillStyle = grd; x.fillRect(0, 0, W, H);

    if (logo) { try { x.drawImage(logo, 70, 60, 44, 44); } catch (e) {} }
    x.fillStyle = th.text; x.font = font(800, 30); x.fillText("THUS", 126, 94);
    x.fillStyle = th.muted; x.font = font(500, 19); x.textAlign = "right";
    x.fillText(new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" }), W - 70, 92);
    x.textAlign = "left";

    // หัวเรื่อง
    x.fillStyle = th.text; x.font = font(800, 46); x.fillText(String(opts.title || "").slice(0, 26), 70, 186);
    if (opts.sub) {
      x.fillStyle = th.muted; x.font = font(500, 20);
      try { x.letterSpacing = "0.4px"; } catch (e) {}
      x.fillText(String(opts.sub).slice(0, 64).toUpperCase(), 70, 218);
      try { x.letterSpacing = "0px"; } catch (e) {}
    }

    const y0 = 250, bottom = 1258;
    const rowH = Math.min(150, Math.floor((bottom - y0) / Math.max(rows.length, 1)));
    const boxH = rowH - 10;
    const blockH = rowH * rows.length;
    const startY = y0 + Math.max(0, (bottom - y0 - blockH) / 2);   // จัดกลุ่มแถวให้อยู่กลาง ไม่ลอยขึ้นบน

    rows.forEach((r, i) => {
      const y = startY + i * rowH;
      glassPanel(x, th, 70, y, W - 140, boxH, 14);

      // ลำดับ
      x.fillStyle = th.muted; x.font = font(600, 15); x.textAlign = "center";
      x.fillText(String(i + 1), 100, y + boxH / 2 + 5);
      x.textAlign = "left";

      // โลโก้
      const t = thumbs[i], lgS = 44, lgX = 118, lgY = y + (boxH - lgS) / 2;
      if (t) {
        x.save(); x.beginPath(); x.arc(lgX + lgS / 2, lgY + lgS / 2, lgS / 2, 0, Math.PI * 2); x.clip();
        x.drawImage(t, lgX, lgY, lgS, lgS); x.restore();
        x.strokeStyle = th.lineHi || th.line; x.lineWidth = 1; x.beginPath();
        x.arc(lgX + lgS / 2, lgY + lgS / 2, lgS / 2, 0, Math.PI * 2); x.stroke();
      }

      // ชื่อย่อ + ชื่อบริษัท
      const tx = lgX + lgS + 16;
      x.fillStyle = th.text; x.font = font(700, 28); x.fillText(String(r.ticker || r.tk || ""), tx, y + boxH / 2 - 2);
      let nm = String(r.name || r.industry || r.sector || "");
      const nmMax = (W - 250) - tx - 24;
      x.fillStyle = th.muted; x.font = font(500, 15);
      if (x.measureText(nm).width > nmMax) {
        while (nm.length > 4 && x.measureText(nm + "…").width > nmMax) nm = nm.slice(0, -1);
        nm += "…";
      }
      x.fillText(nm, tx, y + boxH / 2 + 18);
      let ind = String(r.industry || r.sector || r.group || "");
      if (ind) {
        x.fillStyle = th.muted; x.font = font(500, 13);
        const indMax = (W - 250) - tx - 24;
        if (x.measureText(ind).width > indMax) {
          while (ind.length > 4 && x.measureText(ind + "…").width > indMax) ind = ind.slice(0, -1);
          ind += "…";
        }
        x.fillText(ind, tx, y + boxH / 2 + 38);
      }

      // ราคา + เปลี่ยน
      const px = r.price != null ? Number(r.price).toFixed(2) : "—";
      const ch = r.change != null ? Number(r.change) : null;
      x.textAlign = "right";
      x.fillStyle = th.text; fitSize(x, px, 180, 36, 18, 700); x.fillText(px, W - 250, y + boxH / 2 - 2);
      if (ch != null) {
        x.fillStyle = ch >= 0 ? th.up : th.down; x.font = font(600, 18);
        x.fillText((ch >= 0 ? "+" : "") + ch.toFixed(2) + "%", W - 250, y + boxH / 2 + 20);
      }

      // RS วงกลมเล็ก
      const rs = r.rs != null ? Number(r.rs) : (r.rs3 != null ? Number(r.rs3) : null);
      if (rs != null) {
        const cxr = W - 150, cyr = y + boxH / 2, rad = 22;
        x.lineWidth = 4; x.lineCap = "round";
        x.strokeStyle = th.line; x.beginPath(); x.arc(cxr, cyr, rad, 0, Math.PI * 2); x.stroke();
        x.strokeStyle = th.gold; x.beginPath();
        x.arc(cxr, cyr, rad, -Math.PI / 2, -Math.PI / 2 + (Math.max(0, Math.min(99, rs)) / 99) * Math.PI * 2); x.stroke();
        x.fillStyle = th.text; x.font = font(700, 18); x.textAlign = "center";
        x.fillText(String(Math.round(rs)), cxr, cyr + 6);
        x.fillStyle = th.muted; x.font = font(600, 11);
        try { x.letterSpacing = "1px"; } catch (e) {}
        x.fillText("RS", cxr, cyr + rad + 16);
        try { x.letterSpacing = "0px"; } catch (e) {}
      }
      x.textAlign = "left";
    });

    if (!rows.length) { x.fillStyle = th.muted; x.font = font(600, 26); x.fillText("ยังไม่มีรายการ", 90, 400); }

    x.fillStyle = th.muted; x.font = font(500, 17); x.textAlign = "right";
    x.fillText(opts.note || "ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน", W - 70, H - 44);
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
  const HEAT_MID = [22, 18, 28];
  function heatColor(v, th) {
    if (!v || Math.abs(v) < 0.05) return `rgb(${HEAT_MID.join(",")})`;   // 0% = กลางจืด ไม่ติดเขียว/แดง
    const t = Math.max(-1, Math.min(1, v / 3));
    const mid = th === THEMES.dark ? HEAT_MID : [232, 229, 220];
    const up = [79, 209, 181], dn = [240, 138, 126];
    const end = t > 0 ? up : dn, k = Math.abs(t);
    const c = mid.map((m, i) => Math.round(m + (end[i] - m) * (0.16 + 0.84 * k)));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  async function drawHeat(opts) {
    const th = THEMES.dark;
    const W = 1080, H = 1350;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    const g2 = x.createLinearGradient(0, 0, W, H);
    g2.addColorStop(0, th.bg); g2.addColorStop(1, th.bg2);
    x.fillStyle = g2; x.fillRect(0, 0, W, H);

    const logo = await loadImg("/brand/thus-symbol-white.png");
    if (logo) { try { x.drawImage(logo, 70, 66, 54, 54); } catch (e) {} }
    x.fillStyle = th.text; x.font = font(900, 34); x.fillText("THUS", 140, 108);
    x.fillStyle = th.muted; x.font = font(500, 22); x.textAlign = "right";
    x.fillText(new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" }), W - 70, 100);
    x.textAlign = "left";

    const byChg = opts.sizeBy === "chg";
    x.fillStyle = th.text; x.font = font(900, 52); x.fillText((opts.title || "Heatmap").slice(0, 26), 70, 200);
    const subTxt2 = (opts.sub || "") + (byChg ? " · ขนาดบล็อก = % เปลี่ยนแปลง" : " · ขนาดบล็อก = มูลค่าตลาด");
    x.fillStyle = th.muted; x.font = font(500, 22); x.fillText(subTxt2.slice(0, 70), 70, 238);

    // พื้นที่ treemap
    const X0 = 70, Y0 = 274, XW = W - 140, XH = 940;
    const tItems = (opts.items || [])
      .filter((it) => (byChg ? Math.abs(Number(it.chg) || 0) > 0.01 : (it.mcap || 0) > 0))
      .map((it) => Object.assign({}, it, { v: byChg ? Math.max(0.05, Math.abs(Number(it.chg) || 0)) : it.mcap }))
      .sort((a, b) => b.v - a.v)
      .slice(0, byChg ? 60 : 100000);   // โหมด %เปลี่ยน: เอา 60 ตัวที่ขยับแรงสุด (อ่านง่าย + ไม่หนัก)
    const rects = squarify(tItems, X0, Y0, XW, XH);
    // โลโก้บริษัทในบล็อกที่ใหญ่พอ (เสิร์ฟผ่านโดเมนเรา → ไม่ทำให้ canvas เสีย)
    const big = rects.filter((r) => (r.w - 2) > 110 && (r.h - 2) > 92).slice(0, 30);
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
        const lg = (rw > 120 && rh > 96) ? logos[src.ticker] : null;
        const hasLg = !!lg;
        const lgS = hasLg ? Math.max(22, Math.min(38, Math.min(rw, rh) * 0.26)) : 0;
        const fs = Math.max(13, Math.min(30, Math.floor(Math.min(rw / 3.9, rh / 2.7))));
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
        let lbl = String(src.ticker || "");
        while (lbl.length > 2 && x.measureText(lbl).width > rw - 16) lbl = lbl.slice(0, -1);
        const ty = ry + rh / 2 + fs * 0.12 + (hasLg ? lgS * 0.45 : 0);
        x.fillText(lbl, rx + rw / 2, ty);
        if (rh > 58) {
          x.font = font(700, Math.max(11, fs * 0.6));
          x.globalAlpha = 0.92;
          x.fillText((chg >= 0 ? "+" : "") + chg.toFixed(2) + "%", rx + rw / 2, ty + fs * 0.92);
          x.globalAlpha = 1;
        }
        x.textAlign = "left";
      }
    });

    // legend
    const ly = Y0 + XH + 34;
    x.fillStyle = th.muted; x.font = font(600, 22);
    x.fillText(byChg ? "สี = % เปลี่ยนวันนี้ · ขนาด = ขนาดการเปลี่ยน (%)" : "สี = % เปลี่ยนวันนี้ · ขนาด = มูลค่าตลาด", 70, ly);
    ["-3%", "0", "+3%"].forEach((t, i) => {
      const bx = W - 70 - 240 + i * 80;
      x.fillStyle = i === 0 ? heatColor(-3, th) : (i === 1 ? heatColor(0, th) : heatColor(3, th));
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
  // เลย์เอาต์การ์ดกลุ่มตามจำนวนหุ้น (แถว × คอลัมน์)
  // ตัวเลขในสเปก = คอลัมน์ × แถว (5 = ตัวแรกเต็มแถว + 2×2, 7 = ตัวแรกเต็มแถว + 2×3)
  const GRID_LAYOUT = { 1: [1], 2: [1, 1], 3: [1, 1, 1], 4: [2, 2], 5: [1, 2, 2], 6: [2, 2, 2], 7: [1, 2, 2, 2], 8: [2, 2, 2, 2], 9: [3, 3, 3] };

  async function drawGrid(opts) {
    const th = THEMES.dark;                       // การ์ดใช้พื้นดำ #0D0A11 เสมอ
    const W = 1080, H = 1350;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    const g2 = x.createLinearGradient(0, 0, W, H);
    g2.addColorStop(0, th.bg); g2.addColorStop(1, th.bg2);
    x.fillStyle = g2; x.fillRect(0, 0, W, H);

    const logo = await loadImg("/brand/thus-symbol-white.png");
    if (logo) { try { x.drawImage(logo, 70, 62, 44, 44); } catch (e) {} }
    x.fillStyle = th.text; x.font = font(700, 30); x.fillText("THUS", 126, 96);
    x.fillStyle = th.muted; x.font = font(400, 19); x.textAlign = "right";
    x.fillText(new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" }), W - 70, 92);
    x.textAlign = "left";

    x.fillStyle = th.text; x.font = font(700, 44); x.fillText(String(opts.title || "").slice(0, 26), 70, 190);
    const subTxt = String(opts.sub || "").toUpperCase();
    if (subTxt) {
      x.fillStyle = th.gold; x.font = labelFont(600, 15);
      try { x.letterSpacing = "1.4px"; } catch (e) {}
      x.fillText(subTxt.slice(0, 60), 70, 222);
      try { x.letterSpacing = "0px"; } catch (e) {}
    }
    if (opts.pageTotal > 1) {
      x.fillStyle = th.muted; x.font = labelFont(600, 15); x.textAlign = "right";
      x.fillText("หน้า " + (opts.page || 1) + "/" + opts.pageTotal, W - 70, 222);
      x.textAlign = "left";
    }

    const items = (opts.items || []).slice(0, 9);
    const plan = GRID_LAYOUT[items.length] || [3, 3, 3];
    const maxCols = Math.max.apply(null, plan);
    const X0 = 60, GW = W - 120, YTOP = 262, YBOT = 1236;
    const gap = 14;
    const rh = (YBOT - YTOP) / plan.length;

    let idx = 0;
    for (let r = 0; r < plan.length; r++) {
      const nRow = plan[r];
      const cwid = GW / nRow;                    // แถวที่มีcolน้อยกว่า = การ์ดกว้างขึ้น
      for (let ci = 0; ci < nRow && idx < items.length; ci++, idx++) {
        const it = items[idx];
        const cx = X0 + ci * cwid + gap / 2;
        const cy = YTOP + r * rh + gap / 2;
        const cw2 = cwid - gap, ch2 = rh - gap;
        glassPanel(x, th, cx, cy, cw2, ch2, 20);
        const sc = Math.max(0.85, Math.min(1.55, Math.min(cw2 / 316, ch2 / 318)));

        // โลโก้ + ชื่อย่อ + ราคา
        let tx = cx + 18 * sc;
        const logoS = 34 * sc;
        try {
          const lg = await stockLogo(it.ticker, opts.mk || "thailand");
          x.save(); x.beginPath(); x.arc(cx + 18 * sc + logoS / 2, cy + 20 * sc + logoS / 2, logoS / 2 + 2, 0, Math.PI * 2);
          x.fillStyle = "rgba(255,255,255,0.07)"; x.fill(); x.restore();
          if (lg && lg.naturalWidth > 0) {
            x.save(); x.beginPath(); x.arc(cx + 18 * sc + logoS / 2, cy + 20 * sc + logoS / 2, logoS / 2, 0, Math.PI * 2); x.clip();
            x.drawImage(lg, cx + 18 * sc, cy + 20 * sc, logoS, logoS); x.restore();
            x.strokeStyle = "rgba(255,255,255,0.13)"; x.lineWidth = 1;
            x.beginPath(); x.arc(cx + 18 * sc + logoS / 2, cy + 20 * sc + logoS / 2, logoS / 2 + 1, 0, Math.PI * 2); x.stroke();
            tx = cx + 18 * sc + logoS + 12 * sc;
          }
        } catch (e) {}
        x.fillStyle = th.text; x.font = font(700, 23 * sc);
        x.fillText(String(it.ticker || "").slice(0, 10), tx, cy + 34 * sc);

        const chg = Number(it.change);
        x.fillStyle = th.body;
        const priceTxt = it.price != null ? Number(it.price).toFixed(2) : "—";
        fitSize(x, priceTxt, cw2 * 0.46, Math.round(27 * sc), 14, 700);
        const pSize = x.font;
        x.fillText(priceTxt, tx, cy + 60 * sc);
        const pw0 = x.measureText(priceTxt).width;
        if (Number.isFinite(chg)) {
          x.fillStyle = chg >= 0 ? th.up : th.down; x.font = font(600, 16 * sc);
          x.fillText((chg >= 0 ? "+" : "") + chg.toFixed(1) + "%", tx + pw0 + 10 * sc, cy + 60 * sc);
        }

        // วงแหวน RS (ทอง) มุมขวาบน
        if (it.rs != null) {
          const rs = Math.max(0, Math.min(99, Number(it.rs)));
          const rad = 21 * sc, cxr = cx + cw2 - 18 * sc - rad, cyr = cy + 20 * sc + rad;
          x.lineWidth = 4 * sc; x.lineCap = "round";
          x.strokeStyle = "rgba(255,255,255,0.10)";
          x.beginPath(); x.arc(cxr, cyr, rad, 0, Math.PI * 2); x.stroke();
          x.strokeStyle = th.gold;
          x.beginPath(); x.arc(cxr, cyr, rad, -Math.PI / 2, -Math.PI / 2 + (rs / 99) * Math.PI * 2); x.stroke();
          x.fillStyle = th.text; fitSize(x, String(Math.round(rs)), rad * 1.5, Math.round(20 * sc), 12, 700); x.textAlign = "center";
          x.fillText(String(Math.round(rs)), cxr, cyr + 7 * sc);
          x.textAlign = "left";
        }

        // กราฟแท่งเทียน + MA20 ทอง / MA50 ม่วง
        const bars = it.bars || [];
        const px = cx + 12 * sc, py = cy + 78 * sc;
        const pw = cw2 - 26 * sc, ph = ch2 - 92 * sc;
        if (bars.length > 10 && ph > 20) {
          const n0 = Math.min(bars.length, 150), off = bars.length - n0;
          let lo = Infinity, hi2 = -Infinity;
          for (let k = off; k < bars.length; k++) {
            const b = bars[k];
            const l = b.low != null ? b.low : b.l, hh = b.high != null ? b.high : b.h;
            if (l < lo) lo = l; if (hh > hi2) hi2 = hh;
          }
          const Y = (v) => py + ph - ((v - lo) / (hi2 - lo || 1)) * ph;
          const cw3 = pw / n0;
          x.save(); x.beginPath(); x.rect(px, py, pw, ph); x.clip();
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
          [[20, th.ma20], [50, th.ma50]].forEach(function (pair) {
            const n = pair[0], col = pair[1];
            x.strokeStyle = col; x.lineWidth = 1.7; x.beginPath();
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
    }

    // คำอธิบายเส้น (ครั้งเดียวท้ายการ์ด) + คำเตือน
    x.save();
    x.font = labelFont(600, 15);
    let lx = 70;
    [[th.ma20, "MA20"], [th.ma50, "MA50"]].forEach(function (p2) {
      x.strokeStyle = p2[0]; x.lineWidth = 3; x.beginPath(); x.moveTo(lx, H - 66); x.lineTo(lx + 26, H - 66); x.stroke();
      x.fillStyle = th.body; x.fillText(p2[1], lx + 34, H - 61);
      lx += 34 + x.measureText(p2[1]).width + 26;
    });
    x.fillStyle = th.body; x.font = font(400, 17); x.textAlign = "right";
    x.fillText("ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน", W - 70, H - 60);
    x.textAlign = "left";
    x.restore();
    return c;
  }

  /* ---------- การ์ดแชร์ ---------- */
  const THEMES = {
    dark: { bg: "#0D0A11", bg2: "#120E18", panel: "#120E18", hi: "#1B1624", line: "#241E30", lineHi: "#332B42", text: "#F3EFF8", body: "#B8B1C2", muted: "#8F879A", gold: "#E2BE6E", gold2: "#F0D79B", up: "#4FD1B5", down: "#F08A7E", ma20: "#E2BE6E", ma50: "#9B7BE0" },
    light: { bg: "#EFEEE9", bg2: "#FAF9F6", panel: "#FAF9F6", hi: "#FFFFFF", line: "#D3CBBE", lineHi: "#B9AE9C", text: "#1F1A24", body: "#3B3342", muted: "#5E5468", gold: "#7A5C24", up: "#0B6E70", down: "#A63B27" },
  };
  const FONT = '600 %spx Prompt, Inter, "Noto Sans Thai", "Leelawadee UI", sans-serif';
  const font = (w, s) => FONT.replace("600", w).replace("%s", s);
  const LABELFONT = '600 %spx Montserrat, Prompt, sans-serif';
  const labelFont = (w, s) => LABELFONT.replace("600", w).replace("%s", s);



  // กล่องสไตล์กระจกนูน (glassmorphism): ไล่แสงบน-ล่าง + ขอบไฮไลต์ + เงาใน


  // RS สำรอง: ถ้าหน้าปัจจุบันยังไม่โหลดข้อมูลสแกน ให้อ่านจาก rshist lite
  const RS_CACHE = {};
  async function rsFallback(tk, mk) {
    const k = mk === "america" ? "us" : "th";
    try {
      if (!RS_CACHE[k]) {
        const r = await fetch("/rshist_" + k + "_lite.json", { cache: "force-cache" });
        const j = await r.json();
        const map = {};
        const rsMap = j.rs || {};
        Object.keys(rsMap).forEach(function (t) {
          const arr = rsMap[t];
          if (Array.isArray(arr) && arr.length) map[t] = arr[arr.length - 1];
          else if (typeof arr === "number") map[t] = arr;
        });
        RS_CACHE[k] = map;
      }
      return RS_CACHE[k][tk];
    } catch (e) { return undefined; }
  }

  const pctS = (v) => (v == null || isNaN(v)) ? "—" : (v >= 0 ? "+" : "") + Number(v).toFixed(1) + "%";
  const closeOf = (b) => (b == null ? null : (b.close != null ? b.close : b.c));

  // สถิติสำหรับดัชนี (ไม่มีพื้นฐานแบบบริษัท)
  function indexStats(bars) {
    const out = { chips: [] };
    if (!bars || bars.length < 20) return out;
    const last = bars[bars.length - 1], prev = bars[bars.length - 2];
    const c0 = closeOf(last);
    const w = bars.slice(-252);
    const hi = Math.max.apply(null, w.map((b) => (b.high != null ? b.high : b.h)));
    const lo = Math.min.apply(null, w.map((b) => (b.low != null ? b.low : b.l)));
    const i63 = Math.max(0, bars.length - 64);
    const y1 = (c0 / closeOf(bars[0]) - 1) * 100;
    const m3 = (c0 / closeOf(bars[i63]) - 1) * 100;
    const day = prev ? (c0 / closeOf(prev) - 1) * 100 : null;
    // YTD: แท่งแรกของปีปัจจุบัน
    const y = String(last.time || "").slice(0, 4);
    const firstY = bars.find((b) => String(b.time || "").slice(0, 4) === y);
    const ytd = firstY ? (c0 / closeOf(firstY) - 1) * 100 : null;
    // ผันผวน 60 วัน (annualized)
    const rets = [];
    for (let i = Math.max(1, bars.length - 60); i < bars.length; i++) {
      const a = closeOf(bars[i - 1]), b2 = closeOf(bars[i]);
      if (a && b2) rets.push(b2 / a - 1);
    }
    const mean = rets.reduce((t, v) => t + v, 0) / (rets.length || 1);
    const sd = Math.sqrt(rets.reduce((t, v) => t + (v - mean) * (v - mean), 0) / (rets.length || 1));
    const vol = sd * Math.sqrt(252) * 100;
    // Drawdown 1 ปี
    let peak = -Infinity, mdd = 0;
    w.forEach((b) => { const c = closeOf(b); if (c > peak) peak = c; if (peak > 0) mdd = Math.min(mdd, (c / peak - 1) * 100); });

    out.head = [["วันนี้", pctS(day)], ["จาก 52W สูง", pctS((c0 / hi - 1) * 100)], ["3 เดือน", pctS(m3)], ["1 ปี", pctS(y1)]];
    out.chips = [["YTD", pctS(ytd)], ["52W สูง", Number(hi).toFixed(2)], ["52W ต่ำ", Number(lo).toFixed(2)],
                 ["ผันผวน 60 วัน", vol ? vol.toFixed(1) + "%" : "—"], ["Drawdown 1 ปี", pctS(mdd)], ["แท่ง", String(bars.length)]];
    return out;
  }

  // เลือกขนาดฟอนต์ใหญ่สุดที่ยังพอดีความกว้าง (ตัวเลขอ่านชัดขึ้น)
  function fitSize(x, txt, maxW, start, min, weight, fam) {
    let sz = start;
    while (sz > min) {
      x.font = (fam === "label" ? labelFont(weight, sz) : font(weight, sz));
      if (x.measureText(txt).width <= maxW) break;
      sz -= 1;
    }
    x.font = (fam === "label" ? labelFont(weight, sz) : font(weight, sz));
    return sz;
  }
  const GLASS = { a: 0.028, b: 0.009, hi: 0.07, sh: 0.42 };
  function glassPanel(x, th, bx, by, bw, bh, r) {
    const rr2 = r || 20;
    x.save();
    const g = x.createLinearGradient(bx, by, bx, by + bh);
    g.addColorStop(0, "rgba(255,255,255," + GLASS.a + ")");
    g.addColorStop(1, "rgba(255,255,255," + GLASS.b + ")");
    x.save();
    x.shadowColor = "rgba(0,0,0," + GLASS.sh + ")"; x.shadowBlur = 18; x.shadowOffsetY = 6;
    x.fillStyle = g; rr(x, bx, by, bw, bh, rr2); x.fill();
    x.restore();
    // ขอบบนสว่างบาง ๆ (ให้ความรู้สึกนูนขึ้น)
    x.beginPath();
    x.moveTo(bx + rr2 * 1.1, by + 1);
    x.lineTo(bx + bw - rr2 * 1.1, by + 1);
    x.strokeStyle = "rgba(255,255,255," + GLASS.hi + ")";
    x.lineWidth = 1; x.stroke();
    x.restore();
  }

  // โหลดฟอนต์เว็บให้พร้อมก่อนวาดลง canvas (ไม่งั้นได้ฟอนต์ระบบแทน)
  async function ensureFonts() {
    try {
      if (!document.fonts) return;
      await Promise.all([
        document.fonts.load('400 20px Prompt'),
        document.fonts.load('500 20px Prompt'),
        document.fonts.load('600 20px Prompt'),
        document.fonts.load('700 20px Prompt'),
        document.fonts.load('500 20px Montserrat'),
        document.fonts.load('600 20px Montserrat'),
        document.fonts.load('700 20px Montserrat'),
        document.fonts.load('400 20px Inter'),
        document.fonts.load('600 20px Inter'),
        document.fonts.load('700 20px Inter'),
        document.fonts.load('800 20px Inter'),
        document.fonts.load('700 20px "IBM Plex Sans Thai"'),
        document.fonts.load('600 20px "IBM Plex Sans Thai"'),
      ]);
      await document.fonts.ready;
    } catch (e) {}
  }

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

  async function barsOf(tk, mk, rng) {
    const isIdx = String(tk).charAt(0) === "^";
    // ดัชนีไทย Yahoo คืนแท่งเดียว → ใช้ TradingView ผ่าน /api/idxchart
    const url = (isIdx && mk === "thailand")
      ? `/api/idxchart?symbol=${encodeURIComponent(tk)}&interval=1d&range=${rng || "3y"}`
      : `/api/chart?market=${mk}&symbol=${encodeURIComponent(tk)}&interval=1d&range=${rng || "1y"}`;
    try {
      const r = await fetch(url);
      const j = await r.json();
      let out = (j && j.data) || [];
      if (out.length < 5 && isIdx) {
        const r2 = await fetch(`/api/idxchart?symbol=${encodeURIComponent(tk)}&interval=1d&range=3y`);
        const j2 = await r2.json();
        out = (j2 && j2.data) || out;
      }
      return out;
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

  // ป้ายไตรมาสจากวันที่ เช่น 2026-09-30 → Q3/69
  function qLabel(dstr) {
    const m = String(dstr || "").match(/^(\d{4})-(\d{2})/);
    if (!m) return "";
    const y = m[1], mo = +m[2];
    const q = Math.ceil(mo / 3);
    return "Q" + q + "/" + String(+y % 100 === 0 ? 100 : (+y + 543) % 100).padStart(2, "0");
  }

  // วาดแท่งเทียน + MA20/50 ในกรอบที่กำหนด (ใช้ทั้งการ์ด 4:5 และการ์ดกว้าง)
  function drawChartBlock(x, th, bars, box, opt) {
    const padL = box.pl ?? 96, padR = box.pr ?? 130, padT = box.pt ?? 34, padB = box.pb ?? 56;
    const px = box.x + padL, py = box.y + padT, pw = box.w - padL - padR, ph = box.h - padT - padB;
    const barsS = (Array.isArray(bars) && bars.length > (opt?.n || 130)) ? bars.slice(-(opt?.n || 130)) : (bars || []);
    if (barsS.length < 5) return { lo: null, hi: null };
    let lo = Infinity, up2 = -Infinity;
    barsS.forEach((b) => { const l = b.l ?? b.low, h = b.h ?? b.high; if (l != null && l < lo) lo = l; if (h != null && h > up2) up2 = h; });
    const Y = (v) => py + ph - ((v - lo) / (up2 - lo || 1)) * ph;
    const n0 = barsS.length, cw0 = pw / n0;
    const MA20C = "#E2BE6E", MA50C = "#9B7BE0";
    x.save(); x.beginPath(); x.rect(px - 2, py - 6, pw + 4, ph + 12); x.clip();
    barsS.forEach((b, i) => {
      const o = b.o ?? b.open, hh = b.h ?? b.high, ll = b.l ?? b.low, cl = b.c ?? b.close;
      if (o == null || cl == null) return;
      const cx = px + i * cw0 + cw0 / 2;
      const col = cl >= o ? th.up : th.down;
      x.strokeStyle = col; x.fillStyle = col;
      x.lineWidth = Math.max(1.3, cw0 * 0.12);
      x.beginPath(); x.moveTo(cx, Y(hh)); x.lineTo(cx, Y(ll)); x.stroke();
      const bodyTop = Math.min(Y(o), Y(cl)), bodyH = Math.max(1.6, Math.abs(Y(o) - Y(cl)));
      x.fillRect(cx - Math.max(1.5, cw0 * 0.32), bodyTop, Math.max(2.2, cw0 * 0.64), bodyH);
    });
    [[20, MA20C], [50, MA50C]].forEach(function (pair) {
      const n = pair[0], col = pair[1];
      x.strokeStyle = col; x.lineWidth = 2.6; x.beginPath();
      let started = false;
      for (let i = 0; i < n0; i++) {
        const v = smaAt(barsS, i, n);
        if (v == null) continue;
        const bx = px + i * cw0 + cw0 / 2;
        if (!started) { x.moveTo(bx, Y(v)); started = true; } else x.lineTo(bx, Y(v));
      }
      if (started) x.stroke();
    });
    x.restore();
    // ป้ายค่า 52 สัปดาห์ + ชื่อเส้น
    x.textAlign = "right";
    x.font = font(700, 18);
    x.fillStyle = MA50C; x.fillText("MA50", box.x + box.w - 26, box.y + 26);
    const w50 = x.measureText("MA50").width;
    x.fillStyle = MA20C; x.fillText("MA20", box.x + box.w - 26 - w50 - 10, box.y + 26);
    x.textAlign = "left";
    return { lo, hi: up2 };
  }

  // กราฟเส้นแนวโน้มรายได้ / กำไรสุทธิ รายไตรมาส
  function drawTrendBlock(x, th, q, box) {
    const pts = (q || []).filter((z) => z && z.d && (z.rev != null || z.ni != null));
    if (pts.length < 2) return;
    const padL = 18, padR = 18, padT = 46, padB = 42;
    const px = box.x + padL, py = box.y + padT, pw = box.w - padL - padR, ph = box.h - padT - padB;
    const revs = pts.map((z) => Number(z.rev) || 0), nis = pts.map((z) => Number(z.ni) || 0);
    const mxRev = Math.max(...revs.map(Math.abs), 1), mxNi = Math.max(...nis.map(Math.abs), 1);
    const base = py + ph * 0.88;                       // เส้นฐาน (ศูนย์)
    const slot = pw / pts.length;

    const fmtS = (v) => {
      const av = Math.abs(v), sg = v < 0 ? "-" : "";
      if (av >= 1e12) return sg + (av / 1e12).toFixed(2) + "T";
      if (av >= 1e9) return sg + (av / 1e9).toFixed(2) + "B";
      if (av >= 1e7) return sg + (av / 1e6).toFixed(0) + "M";
      if (av >= 1e4) return sg + (av / 1e3).toFixed(0) + "K";
      return sg + Math.round(av);
    };
    const hOf = (v, mx, hMax) => Math.max(1.5, (Math.abs(v) / mx) * hMax);
    const hMax = ph * 0.58;        // รายได้
    const hMaxNi = ph * 0.24;      // กำไร (สเกลของตัวเอง ให้เห็นความเปลี่ยนแปลงและไม่ทับป้ายรายได้)

    // แท่งรายได้ (ทอง) + กำไร (เขียวน้ำทะเล) ต่อไตรมาส
    const tops = { rev: [], ni: [] };
    pts.forEach((z, i) => {
      const cx = px + slot * (i + 0.5);
      const bw = Math.min(34, slot * 0.30), bgap = Math.max(3, slot * 0.06);
      const rv = Number(z.rev) || 0, ni = Number(z.ni) || 0;
      const rH = hOf(rv, mxRev, hMax), nH = hOf(ni, mxNi, hMaxNi);

      x.fillStyle = "#E2BE6E";
      if (rv >= 0) { rr(x, cx - bw - bgap / 2, base - rH, bw, rH, 4); x.fill(); tops.rev.push([cx - bw / 2 - bgap / 4, base - rH]); }
      else { rr(x, cx - bw - bgap / 2, base, bw, rH, 4); x.fill(); tops.rev.push([cx - bw / 2 - bgap / 4, base + rH]); }

      x.fillStyle = th.up;
      if (ni >= 0) { rr(x, cx + bgap / 2, base - nH, bw, nH, 4); x.fill(); tops.ni.push([cx + bw / 2 + bgap / 4, base - nH]); }
      else { rr(x, cx + bgap / 2, base, bw, nH, 4); x.fill(); tops.ni.push([cx + bw / 2 + bgap / 4, base + nH]); }

      // ตัวเลขบนหัวแท่ง (เฉพาะเมื่อที่มีที่พอ)
      x.font = font(700, 11); x.textAlign = "center";
      if (slot > 62) {
        if (rH > 14) { x.fillStyle = "#E2BE6E"; x.fillText(fmtS(rv), cx - bw / 2 - bgap / 4, (rv >= 0 ? base - rH - 7 : base + rH + 13)); }
        if (nH > 26) { x.fillStyle = th.up; x.fillText(fmtS(ni), cx + bw / 2 + bgap / 4, (ni >= 0 ? base - nH - 7 : base + nH + 13)); }
      }
      x.textAlign = "left";
    });

    // เส้นแนวโน้มลากจากหัวแท่ง
    const poly = (arr, col, dash) => {
      if (arr.length < 2) return;
      x.strokeStyle = col; x.lineWidth = 2.4; x.setLineDash(dash || []);
      x.beginPath(); arr.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke();
      x.setLineDash([]);
      arr.forEach((p) => { x.beginPath(); x.arc(p[0], p[1], 3.4, 0, Math.PI * 2); x.fillStyle = col; x.fill(); });
    };
    poly(tops.rev, "#F0D79B");
    poly(tops.ni, th.up, [4, 4]);

    // เส้นฐาน + ป้ายไตรมาส
    x.strokeStyle = "rgba(255,255,255,0.10)"; x.lineWidth = 1;
    x.beginPath(); x.moveTo(px, base); x.lineTo(px + pw, base); x.stroke();
    x.font = font(600, 13); x.fillStyle = th.muted; x.textAlign = "center";
    pts.forEach((z, i) => x.fillText(qLabel(z.d), px + slot * (i + 0.5), box.y + box.h - 10));
    x.textAlign = "left";

    // คำอธิบายสี
    x.font = labelFont(600, 12);
    let lx = px;
    [[("#E2BE6E"), "รายได้"], [(th.up), "กำไร"]].forEach((p2, k) => {
      x.fillStyle = p2[0]; rr(x, lx, box.y + 10, 9, 9, 2); x.fill();
      x.fillStyle = th.muted; x.fillText(p2[1], lx + 14, box.y + 18);
      lx += 14 + x.measureText(p2[1]).width + 16;
    });
  }

  async function loadCardData(tk, mk, withLogo) {
    const [f, bars, logo, tlogo] = await Promise.all([
      loadFund(tk, mk), barsOf(tk, mk), loadImg("/brand/thus-symbol-white.png"),
      (withLogo === false ? loadImg(avatarData(tk)) : stockLogo(tk, mk)),
    ]);
    let row = {};
    try {
      const rows = (typeof stockData !== "undefined" && stockData) ? stockData : [];
      row = rows.find((z) => z.ticker === tk) || {};
    } catch (e) {}
    return { f, bars, logo, tlogo, row };
  }

  async function draw(tk, nm, mk, withLogo) {
    const th = THEMES.dark;
    const W = 1080, H = 1350;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    const { f, bars, logo, tlogo, row } = await loadCardData(tk, mk, withLogo);

    const grd = x.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, th.bg); grd.addColorStop(1, th.bg2);
    x.fillStyle = grd; x.fillRect(0, 0, W, H);

    // หัวเว็บ
    if (logo) { try { x.drawImage(logo, 70, 62, 48, 48); } catch (e) {} }
    x.fillStyle = th.text; x.font = font(900, 32); x.fillText("THUS", 132, 100);
    x.fillStyle = th.muted; x.font = font(500, 21); x.textAlign = "right";
    x.fillText(new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" }), W - 70, 96);
    x.textAlign = "left";

    // ── แถวชื่อหุ้น + ราคา (ราคาอยู่ข้างชื่อ ใช้พื้นที่ว่างให้คุ้ม) ──
    let nameX = 70;
    if (tlogo) {
      x.save(); rr(x, 70, 150, 88, 88, 44); x.clip(); x.drawImage(tlogo, 70, 150, 88, 88); x.restore();
      nameX = 178;
    }
    x.fillStyle = th.text; x.font = font(800, 52);
    x.fillText(tk, nameX, 208);
    const tw = x.measureText(tk).width;
    x.fillStyle = th.muted; x.font = font(700, 19);
    x.fillText(mk === "america" ? "US" : "TH", nameX + tw + 14, 186);
    x.fillStyle = th.body; x.font = font(500, 25);
    x.fillText((nm || "").slice(0, 34), nameX, 258);
    let tx = nameX;
    const grp = (row.industry || row.sector || "").slice(0, 26);
    if (grp) { x.fillStyle = th.muted; x.font = font(600, 20); x.fillText(grp, tx, 292); tx += x.measureText(grp).width + 14; }
    if (String(row.lead || "").toLowerCase() === "leading") { x.fillStyle = th.gold; x.font = font(800, 20); x.fillText("★ นำตลาด", tx, 292); }

    const lastBar = bars.length ? bars[bars.length - 1] : null;
    const px = row.price != null ? row.price : (lastBar ? (lastBar.c ?? lastBar.close) : null);
    const prevBar = bars.length > 1 ? bars[bars.length - 2] : null;
    const chg = row.change != null ? row.change : (px != null && prevBar ? ((px / (prevBar.c ?? prevBar.close) - 1) * 100) : null);
    x.textAlign = "right";
    x.fillStyle = th.text; x.font = font(700, 48);
    x.fillText(px != null ? Number(px).toFixed(2) : "—", W - 70, 206);
    if (chg != null) {
      x.fillStyle = chg >= 0 ? th.up : th.down; x.font = font(700, 28);
      x.fillText((chg >= 0 ? "▲ +" : "▼ ") + Number(chg).toFixed(2) + "%", W - 70, 250);
    }
    x.textAlign = "left";

    // ── ชิปสถิติ 4 ช่อง ──
    let rs = row.rs != null ? row.rs : (row.rs3 != null ? row.rs3 : (row.rs6 ?? row.rs1 ?? null));
    if (rs == null || Number(rs) === 0) { const rf = await rsFallback(tk, mk); if (rf != null) rs = rf; }
    if (rs == null) rs = "—";
    const hi = f && f.hi ? f.hi : null;
    const toHi = (hi && px) ? ((px / hi - 1) * 100) : null;
    let p3 = row.p3m;
    if (p3 == null && bars && bars.length > 64) {
      const c0 = bars[bars.length - 1], c1 = bars[bars.length - 64];
      const v0 = c0.c != null ? c0.c : c0.close, v1 = c1.c != null ? c1.c : c1.close;
      if (v0 && v1) p3 = (v0 / v1 - 1) * 100;
    }
    const isIndex = String(tk).charAt(0) === "^";
    const ix = isIndex ? indexStats(bars) : null;
    const stats = isIndex ? (ix.head || []) : [
      ["RS", String(rs ?? "—")],
      ["จาก 52W สูง", toHi == null ? "—" : toHi.toFixed(1) + "%"],
      ["3 เดือน", p3 != null ? (p3 >= 0 ? "+" : "") + Number(p3).toFixed(1) + "%" : "—"],
      ["Mcap", f && f.mcap ? fmtCap(f.mcap) : (row.mcap ? fmtCap(row.mcap) : "—")],
    ];
    const bw = (W - 140 - 3 * 14) / 4;
    stats.forEach((sv, i) => {
      const bx = 70 + i * (bw + 14), by = 320, bh = 92;
      const cx = bx + bw / 2;
      glassPanel(x, th, bx, by, bw, bh, 14);
      if (i === 0 && String(sv[0]) === "RS") {
        // RS = วงแหวนกลางกล่อง
        const rr0 = 34, cyc = by + bh / 2 - 2;
        const val = Math.max(0, Math.min(99, Number(sv[1]) || 0));
        x.lineWidth = 5; x.lineCap = "round";
        x.strokeStyle = th.line; x.beginPath(); x.arc(cx, cyc, rr0, 0, Math.PI * 2); x.stroke();
        x.strokeStyle = th.gold; x.beginPath();
        x.arc(cx, cyc, rr0, -Math.PI / 2, -Math.PI / 2 + (val / 99) * Math.PI * 2); x.stroke();
        x.fillStyle = th.text; fitSize(x, String(Math.round(val)), rr0 * 1.45, 32, 18, 700); x.textAlign = "center";
        x.fillText(String(Math.round(val)), cx, cyc + 10);
        x.fillStyle = th.muted; x.font = font(600, 11);
        try { x.letterSpacing = "1px"; } catch (e) {}
        x.fillText("RS", cx, by + bh - 8);
        try { x.letterSpacing = "0px"; } catch (e) {}
        x.textAlign = "left";
        return;
      }
      x.textAlign = "center";
      x.fillStyle = th.body; x.font = font(600, 14);
      try { x.letterSpacing = "0.7px"; } catch (e) {}
      x.fillText(String(sv[0]).toUpperCase(), cx, by + 30);
      try { x.letterSpacing = "0px"; } catch (e) {}
      x.fillStyle = th.text; fitSize(x, String(sv[1]), bw - 16, 34, 20, 700);
      x.fillText(sv[1], cx, by + 66);
      x.textAlign = "left";
    });

    // ── กราฟราคา (ใหญ่ขึ้น + เผื่อที่ด้านขวาให้กราฟวิ่งต่อ) ──
    const box = { x: 70, y: 426, w: W - 140, h: 560 };
    glassPanel(x, th, box.x, box.y, box.w, box.h, 18);
    const rng = drawChartBlock(x, th, bars, box, { n: 150 });
    if (rng.lo == null) { x.fillStyle = th.muted; x.font = font(600, 26); x.fillText("ไม่มีข้อมูลกราฟ", box.x + 30, box.y + box.h / 2); }
    else if (hi) { x.fillStyle = th.muted; x.font = font(600, 19); x.fillText("52W " + Number(hi).toFixed(2), box.x + 24, box.y + 26); }

    // ── พื้นฐาน (บอกช่วงเวลา TTM / ไตรมาส) ──
    const qs = (f && f.q) ? f.q.filter((z) => z && z.d) : [];
    const lastQ = qs.length ? qLabel(qs[qs.length - 1].d) : "";
    x.fillStyle = th.muted; x.font = font(600, 16);
    try { x.letterSpacing = "0.8px"; } catch (e) {}
    x.fillText((isIndex ? "สถิติดัชนี" : ("พื้นฐาน" + (lastQ ? " · ล่าสุด " + lastQ : ""))).toUpperCase(), 70, 1008);
    try { x.letterSpacing = "0px"; } catch (e) {}
    const rawChips = f ? fundChips(f) : [];
    const chips = isIndex ? (ix.chips || []) : rawChips
      .filter((kv) => !/mcap|มูลค่าตลาด/i.test(String(kv[0])))
      .map((kv) => {
        const lb = String(kv[0]);
        const isTTM = /P\/E|P\/S|P\/B|ปันผล/i.test(lb);
        return [lb + (isTTM ? " · TTM" : (lastQ ? " · " + lastQ : "")), kv[1]];
      })
      .slice(0, 6);

    const halfGap = 14;
    const colW = (W - 140 - halfGap) / 2;
    const leftX = 70, rightX = 70 + colW + halfGap;
    const chipsH = 70, chipsGap = 12;
    chips.forEach((kv, i) => {
      const fullW = (W - 140 - 2 * 12) / 3;
      const cx = isIndex ? (70 + (i % 3) * (fullW + 12)) : (leftX + (i % 2) * (colW / 2 + 4));
      const cy = 1028 + Math.floor(i / (isIndex ? 3 : 2)) * (chipsH + chipsGap);
      const cw3 = isIndex ? fullW : (colW / 2 - 8);
      glassPanel(x, th, cx, cy, cw3, chipsH, 10);

      x.textAlign = "center";
      x.fillStyle = th.body; x.font = font(600, 13);
      try { x.letterSpacing = "0.3px"; } catch (e) {}
      let lb = String(kv[0]).toUpperCase();
      while (x.measureText(lb).width > cw3 - 20 && lb.length > 4) lb = lb.slice(0, -1);
      x.fillText(lb, cx + cw3 / 2, cy + 25);
      try { x.letterSpacing = "0px"; } catch (e) {}
      x.fillStyle = th.text;
      fitSize(x, String(kv[1]), cw3 - 16, 33, 20, 700);
      x.fillText(kv[1], cx + cw3 / 2, cy + 55);
      x.textAlign = "left";
    });

    // ── แนวโน้มรายได้/กำไร (ครึ่งขวา สูงขึ้น) ──
    if (qs.length >= 2) {
      const tb = { x: rightX, y: 1028, w: colW, h: 3 * chipsH + 2 * chipsGap };
      glassPanel(x, th, tb.x, tb.y, tb.w, tb.h, 14);

      let note = "";
      if (qs.length >= 2) {
        const a = qs[qs.length - 1], b = qs[qs.length - 2];
        if (a.rev && b.rev) {
          const qoq = (a.rev / b.rev - 1) * 100;
          note = "QoQ " + (qoq >= 0 ? "+" : "") + qoq.toFixed(1) + "%";
        }
      }
      if (qs.length >= 5) {
        const a = qs[qs.length - 1], y0 = qs[qs.length - 5];
        if (a.rev && y0.rev) {
          const yoy = (a.rev / y0.rev - 1) * 100;
          note += (note ? " · " : "") + "YoY " + (yoy >= 0 ? "+" : "") + yoy.toFixed(1) + "%";
        }
      }
      x.fillStyle = th.muted; x.font = font(600, 12);
      try { x.letterSpacing = "0.5px"; } catch (e) {}
      x.fillText("แนวโน้มงบ", tb.x + 14, tb.y + 19);
      try { x.letterSpacing = "0px"; } catch (e) {}
      if (note) { x.textAlign = "right"; x.fillStyle = th.gold; x.font = font(600, 12); x.fillText(note, tb.x + tb.w - 14, tb.y + 20); x.textAlign = "left"; }
      drawTrendBlock(x, th, qs.slice(-5), { x: tb.x, y: tb.y + 34, w: tb.w, h: tb.h - 40 });
    }

    x.fillStyle = th.muted; x.font = font(500, 17); x.textAlign = "right";
    x.fillText("ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน", W - 70, H - 40);
    x.textAlign = "left";
    return c;
  }

  // ── การ์ดสัดส่วน Facebook (1200×630) ──
  async function drawWide(tk, nm, mk, withLogo) {
    const th = THEMES.dark;
    const W = 1200, H = 630;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    const { f, bars, logo, tlogo, row } = await loadCardData(tk, mk, withLogo);

    const grd = x.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, th.bg); grd.addColorStop(1, th.bg2);
    x.fillStyle = grd; x.fillRect(0, 0, W, H);

    if (logo) { try { x.drawImage(logo, 52, 44, 40, 40); } catch (e) {} }
    x.fillStyle = th.text; x.font = font(900, 26); x.fillText("THUS", 102, 76);
    x.fillStyle = th.muted; x.font = font(500, 18); x.textAlign = "right";
    x.fillText(new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" }), W - 52, 72);
    x.textAlign = "left";

    let nameX = 52;
    if (tlogo) { x.save(); rr(x, 52, 104, 66, 66, 33); x.clip(); x.drawImage(tlogo, 52, 104, 66, 66); x.restore(); nameX = 132; }
    x.fillStyle = th.text; x.font = font(900, 58); x.fillText(tk, nameX, 160);
    const tkW0 = x.measureText(tk).width;                 // วัดด้วยฟอนต์ชื่อย่อก่อนเปลี่ยนฟอนต์
    x.fillStyle = th.body; x.font = font(500, 21);
    x.fillText((nm || "").slice(0, 30), nameX, 192);
    if (row.industry || row.sector) { x.fillStyle = th.muted; x.font = font(600, 17); x.fillText(String(row.industry || row.sector).slice(0, 26), nameX, 218); }

    const lastBar = bars.length ? bars[bars.length - 1] : null;
    const px = row.price != null ? row.price : (lastBar ? (lastBar.c ?? lastBar.close) : null);
    const prevBar = bars.length > 1 ? bars[bars.length - 2] : null;
    const chg = row.change != null ? row.change : (px != null && prevBar ? ((px / (prevBar.c ?? prevBar.close) - 1) * 100) : null);
    // ราคา + % วางต่อจากชื่อย่อ (ใช้พื้นที่ว่างด้านขวา)
    let pxX = nameX + tkW0 + 26;
    x.fillStyle = th.text; x.font = font(900, 46);
    const priceTxt2 = px != null ? Number(px).toFixed(2) : "—";
    x.fillText(priceTxt2, pxX, 158);
    if (chg != null) {
      pxX += x.measureText(priceTxt2).width + 14;
      x.fillStyle = chg >= 0 ? th.up : th.down; x.font = font(800, 24);
      x.fillText((chg >= 0 ? "▲ +" : "▼ ") + Number(chg).toFixed(2) + "%", pxX, 156);
    }

    let rs = row.rs != null ? row.rs : (row.rs3 ?? row.rs6 ?? null);
    if (rs == null || Number(rs) === 0) { const rf = await rsFallback(tk, mk); if (rf != null) rs = rf; }
    if (rs == null) rs = "—";
    const hi = f && f.hi ? f.hi : null;
    const toHi = (hi && px) ? ((px / hi - 1) * 100) : null;
    let p3w = row.p3m;
    if (p3w == null && bars && bars.length > 64) {
      const c0 = bars[bars.length - 1], c1 = bars[bars.length - 64];
      const v0 = c0.c != null ? c0.c : c0.close, v1 = c1.c != null ? c1.c : c1.close;
      if (v0 && v1) p3w = (v0 / v1 - 1) * 100;
    }
    const st = [["RS", String(rs ?? "—")], ["จาก 52W สูง", toHi == null ? "—" : toHi.toFixed(1) + "%"],
                ["3 เดือน", p3w != null ? (p3w >= 0 ? "+" : "") + Number(p3w).toFixed(1) + "%" : "—"],
                ["Mcap", f && f.mcap ? fmtCap(f.mcap) : "—"]];
    st.forEach((sv, i) => {
      const bx = 52 + (i % 2) * 236, by = 268 + Math.floor(i / 2) * 76;
      glassPanel(x, th, bx, by, 220, 62, 14);
      x.textAlign = "center";
      x.fillStyle = th.muted; x.font = labelFont(600, 13);
      let lbW = sv[0];
      while (x.measureText(lbW).width > 190 && lbW.length > 4) lbW = lbW.slice(0, -1);
      x.fillText(lbW, bx + 110, by + 23);
      const neg = /^-/.test(String(sv[1]));
      x.fillStyle = i === 1 || i === 2 ? (neg ? th.down : th.up) : th.text;
      fitSize(x, String(sv[1]), 200, 34, 22, 700);
      x.fillText(sv[1], bx + 110, by + 52);
      x.textAlign = "left";
    });

    const chips = f ? fundChips(f).filter((kv) => !/mcap|มูลค่าตลาด/i.test(String(kv[0]))).slice(0, 4) : [];
    const vW = 456 / Math.max(chips.length, 1);          // ให้ขอบขวาชนกับกล่องสถิติพอดี
    chips.forEach((kv, i) => {
      const bx = 52 + vW * i + vW / 2, by = 448;
      x.textAlign = "center";
      x.fillStyle = th.muted; x.font = labelFont(500, 12);
      x.fillText(String(kv[0]).slice(0, 12), bx, by);
      x.fillStyle = th.text;
      fitSize(x, String(kv[1]).slice(0, 8), vW - 6, 30, 16, 700);
      x.fillText(String(kv[1]).slice(0, 8), bx, by + 29);
      x.textAlign = "left";
    });

    const box = { x: 520, y: 100, w: W - 570, h: H - 190 };
    x.fillStyle = th.panel; rr(x, box.x, box.y, box.w, box.h, 22); x.fill();
    x.strokeStyle = th.line; x.lineWidth = 2; x.stroke();
    drawChartBlock(x, th, bars, { ...box, pl: 40, pr: 90, pt: 44, pb: 40 }, { n: 120 });

    x.fillStyle = th.muted; x.font = font(500, 16); x.textAlign = "right";
    x.fillText("ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน", W - 52, H - 46);
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
    setGlass(o) { Object.assign(GLASS, o || {}); return GLASS; },
    getGlass() { return Object.assign({}, GLASS); },
    async openGrid(opts) {
      await ensureFonts();
      const oldFmt = document.getElementById("shFmt"); if (oldFmt) oldFmt.remove();
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
      await ensureFonts();
      const oldFmt2 = document.getElementById("shFmt"); if (oldFmt2) oldFmt2.remove();
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
    async open(tk, nm, mk, fmt) {
      await ensureFonts();
      const box = ensureShareBox();
      box.classList.add("on");
      const img = document.getElementById("shImg");
      img.src = "";
      const render = async (m) => {
        try {
          return (await (m === "wide" ? drawWide(tk, nm, mk, true) : draw(tk, nm, mk, true))).toDataURL("image/png");
        } catch (e) {
          try { return (await (m === "wide" ? drawWide(tk, nm, mk, false) : draw(tk, nm, mk, false))).toDataURL("image/png"); }
          catch (e2) { try { globalThis.__cardErr = String(e) + " || " + String(e2); } catch (_) {} return ""; }
        }
      };
      const cur = { mode: (fmt === "wide") ? "wide" : "card", url: "" };
      cur.url = await render(cur.mode);
      if (!cur.url) { box.classList.remove("on"); alert("สร้างการ์ดไม่สำเร็จ ลองใหม่อีกครั้ง"); return; }
      img.src = cur.url;
      const fname = (m) => `rsdash_${tk}_${m === "wide" ? "fb" : "card"}_${new Date().toISOString().slice(0, 10)}.png`;

      let fb = document.getElementById("shFmt");
      if (!fb) {
        fb = document.createElement("button");
        fb.id = "shFmt"; fb.className = "sh-btn";
        const row = document.querySelector(".sh-box .sh-row");
        if (row) row.insertBefore(fb, row.firstChild);
      }
      const paintFmt = () => { fb.textContent = cur.mode === "wide" ? "สัดส่วน 4:5" : "สัดส่วน Facebook"; };
      paintFmt();
      // เตรียมทั้งสองสัดส่วนไว้ล่วงหน้า → กดสลับแล้วขึ้นทันที ไม่ค้าง
      const cache = {};
      cache[cur.mode] = cur.url;
      let wideP = null;
      fb.onclick = async () => {
        const next = cur.mode === "wide" ? "card" : "wide";
        let u2 = cache[next];
        if (!u2) {
          fb.disabled = true;
          try { u2 = await render(next); } catch (e) { u2 = ""; }
          if (u2) cache[next] = u2;
          fb.disabled = false;
        }
        if (u2) { cur.url = u2; cur.mode = next; img.src = u2; paintFmt(); bind(); }
        else { alert("สร้างสัดส่วน " + (next === "wide" ? "Facebook" : "4:5") + " ไม่สำเร็จ ลองอีกครั้ง"); }
      };

      function bind() {
        document.getElementById("shDl").onclick = () => {
          const a = document.createElement("a"); a.href = cur.url; a.download = fname(cur.mode); a.click();
        };
        document.getElementById("shShare").onclick = async () => {
          try {
            const blob = await (await fetch(cur.url)).blob();
            const file = new File([blob], fname(cur.mode), { type: "image/png" });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({ files: [file], title: tk + " · RS Dashboard" });
            } else {
              const a = document.createElement("a"); a.href = cur.url; a.download = fname(cur.mode); a.click();
            }
          } catch (e) {
            const a = document.createElement("a"); a.href = cur.url; a.download = fname(cur.mode); a.click();
          }
        };
      }
      bind();
    },
  };

  g.FundRender = FundRender;
  g.ShareCard = ShareCard;
})(globalThis);
