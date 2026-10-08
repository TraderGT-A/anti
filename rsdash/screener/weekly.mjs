/**
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  RS SCREENER — Weekly Report Generator                                │
 * │  สร้าง Weekly Shortlist Report พร้อม comparison กับสัปดาห์ก่อน       │
 * │  Run: node weekly.mjs [--html] [--json]                              │
 * └──────────────────────────────────────────────────────────────────────┘
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = path.join(__dirname, 'data', 'history.json');
const REPORTS_DIR = path.join(__dirname, 'reports');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', brightGreen: '\x1b[92m', red: '\x1b[31m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', gray: '\x1b[90m', white: '\x1b[97m',
};

// ─── CONFIG ─────────────────────────────────────────────────────────
const CONFIG = {
  BASE_URL: 'https://rsdashclean.vercel.app',
  RS_MIN: 70,
  VAL_MIN_M: 30,
  MAX_STOCKS: 15,
  MAX_WEIGHT_PCT: 15,
  MIN_WEIGHT_PCT: 4,
  BREADTH_FULL: 50,
  BREADTH_HALF: 40,
  WEIGHTS: { rs: 40, p3m: 20, p1m: 15, rankRise: 15, rvol: 10 },
  STOP_LOSS_PCT: 7.5,
};

// ─── SHARED UTILS ────────────────────────────────────────────────────
function fPct(v, d = 2) {
  if (v == null || !isFinite(v)) return '-';
  return `${v > 0 ? '+' : ''}${v.toFixed(d)}%`;
}
function fM(v) {
  if (v == null) return '-';
  const m = v / 1e6;
  return m >= 1000 ? `${(m / 1000).toFixed(1)}B` : `${m.toFixed(0)}M`;
}
function percentileRank(arr, val) {
  if (!arr.length) return 50;
  const sorted = [...arr].sort((a, b) => a - b);
  return (sorted.filter(x => x < val).length / (sorted.length - 1)) * 100;
}
function computeScores(stocks) {
  const valid = stocks.filter(s => s.rs != null && s.val != null && s.val >= CONFIG.VAL_MIN_M * 1e6);
  const p3mArr = valid.map(s => s.p3m ?? 0);
  const p1mArr = valid.map(s => s.p1m ?? 0);
  const rdArr = valid.map(s => s.rD ?? 0);
  return valid.map(s => ({
    ...s,
    compositeScore: Math.round(((s.rs / 100) * CONFIG.WEIGHTS.rs +
      (percentileRank(p3mArr, s.p3m ?? 0) / 100) * CONFIG.WEIGHTS.p3m +
      (percentileRank(p1mArr, s.p1m ?? 0) / 100) * CONFIG.WEIGHTS.p1m +
      (percentileRank(rdArr, s.rD ?? 0) / 100) * CONFIG.WEIGHTS.rankRise +
      (Math.min(s.relVol ?? 0, 3) / 3) * CONFIG.WEIGHTS.rvol) * 10) / 10,
  }));
}
function computeWeights(shortlist) {
  const totalRS = shortlist.reduce((s, x) => s + x.rs, 0);
  if (!totalRS) return shortlist.map(s => ({ ...s, weight: 100 / shortlist.length }));
  const raw = shortlist.map(s => ({ ...s, weight: (s.rs / totalRS) * 100 }));
  const capped = raw.map(s => ({ ...s, weight: Math.max(CONFIG.MIN_WEIGHT_PCT, Math.min(CONFIG.MAX_WEIGHT_PCT, s.weight)) }));
  const total = capped.reduce((s, x) => s + x.weight, 0);
  return capped.map(s => ({ ...s, weight: Math.round((s.weight / total) * 1000) / 10 }));
}
function getRegime(bf) {
  const pct = bf?.pctAboveMA50;
  if (pct == null) return { label: 'UNKNOWN', emoji: '❓', multiplier: 1 };
  if (pct >= CONFIG.BREADTH_FULL) return { label: 'BULL', emoji: '🟢', multiplier: 1.0, pct };
  if (pct >= CONFIG.BREADTH_HALF) return { label: 'NEUTRAL', emoji: '🟡', multiplier: 0.5, pct };
  return { label: 'BEAR', emoji: '🔴', multiplier: 0.25, pct };
}

// ─── HISTORY ─────────────────────────────────────────────────────────
function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    }
  } catch (_) {}
  return [];
}

function saveHistory(history) {
  fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
}

// ─── COMPARISON ──────────────────────────────────────────────────────
function compareWithLast(current, previous) {
  if (!previous) return { new: current.map(s => s.ticker), dropped: [], held: [] };
  const prevTickers = new Set(previous.shortlist.map(s => s.ticker));
  const currTickers = new Set(current.map(s => s.ticker));
  return {
    new: [...currTickers].filter(t => !prevTickers.has(t)),
    dropped: [...prevTickers].filter(t => !currTickers.has(t)),
    held: [...currTickers].filter(t => prevTickers.has(t)),
  };
}

// ─── REPORT ──────────────────────────────────────────────────────────
function generateMarkdownReport(shortlist, regime, scanData, comparison, weekLabel) {
  const ms = scanData.marketSummary;
  const bf = ms?.breadth_full;
  const money = ms?.money1d;

  const lines = [
    `# 📊 RS Screener Weekly Report — ${weekLabel}`,
    `> Generated: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
    `> Source: [rsdashclean.vercel.app](https://rsdashclean.vercel.app)`,
    '',
    `## 🌍 Market Regime`,
    '',
    `| Indicator | Value | Status |`,
    `|---|---|---|`,
    `| **Regime** | ${regime.emoji} **${regime.label}** | Breadth SMA50 = ${regime.pct ?? '?'}% |`,
    `| SMA50 Breadth | ${bf?.pctAboveMA50 ?? '?'}% | ${bf?.aboveMA50 ?? '-'} / ${bf?.total ?? '-'} หุ้น |`,
    `| SMA200 Breadth | ${bf?.pctAboveMA200 ?? '?'}% | ${bf?.aboveMA200 ?? '-'} / ${bf?.total ?? '-'} หุ้น |`,
    `| Money Flow | ${ms?.moneyDir ?? '?'} | สุทธิ ${fM(money?.net)} (ขึ้น ${fM(money?.in)} / ลง ${fM(money?.out)}) |`,
    `| **Portfolio Size** | **${(regime.multiplier * 100).toFixed(0)}%** | ${regime.label === 'BULL' ? 'Full size' : regime.label === 'NEUTRAL' ? 'Half size' : 'Minimal/Cash'} |`,
    '',
    `## 🏆 Shortlist — ${shortlist.length} ตัว`,
    '',
    `| # | Ticker | RS | Score | 3M% | 1M% | RVOL | ΔRank | Value | Weight | Signal |`,
    `|---|---|---|---|---|---|---|---|---|---|---|`,
  ];

  shortlist.forEach((s, i) => {
    const e = (() => {
      const sigs = [];
      if (s.rs >= 90) sigs.push('RS≥90');
      if (s.rD > 0) sigs.push(`↑+${s.rD}`);
      if ((s.relVol ?? 0) >= 1.5) sigs.push(`RVOL${s.relVol.toFixed(1)}x`);
      if ((s.p1m ?? 0) > 0) sigs.push('1M+');
      return sigs.length >= 3 ? '🔥STRONG' : sigs.length >= 2 ? '⚡MOD' : '~weak';
    })();
    const isNew = comparison.new.includes(s.ticker) ? ' 🆕' : '';
    const ew = (s.weight * regime.multiplier).toFixed(1);
    lines.push(`| ${i + 1} | **${s.ticker}**${isNew} | **${s.rs}** | ${s.compositeScore.toFixed(1)} | ${fPct(s.p3m, 1)} | ${fPct(s.p1m, 1)} | ${(s.relVol ?? 0).toFixed(1)}x | ${s.rD > 0 ? '+' : ''}${s.rD ?? 0} | ${fM(s.val)} | **${ew}%** | ${e} |`);
  });

  lines.push('', '### Portfolio Changes', '');
  if (comparison.new.length) {
    lines.push(`- 🆕 **เข้าใหม่**: ${comparison.new.join(', ')}`);
  }
  if (comparison.dropped.length) {
    lines.push(`- ❌ **ออก**: ${comparison.dropped.join(', ')}`);
  }
  if (comparison.held.length) {
    lines.push(`- ✅ **ถือต่อ**: ${comparison.held.join(', ')}`);
  }

  lines.push(
    '',
    '## ⚠️ Risk Rules',
    '',
    `- 🛑 **Stop Loss**: -${CONFIG.STOP_LOSS_PCT}% จากต้นทุน → ออกทันที`,
    `- 📉 **RS Exit**: RS < ${CONFIG.RS_EXIT ?? 60} → ออก`,
    `- 🔄 **Trailing Stop**: กำไร >25% → trail -10% จาก high`,
    `- ⚡ **Market Exit**: Breadth <${CONFIG.BREADTH_HALF}% → ลด position 50%`,
    '',
    '---',
    '*ไม่ใช่คำแนะนำลงทุน — ใช้ประกอบการตัดสินใจเท่านั้น*',
  );

  return lines.join('\n');
}

// ─── MAIN ─────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const doHTML = args.includes('--html');
  const doJSON = args.includes('--json');

  console.log(C.cyan + '\n  ⏳ RS Weekly Screener กำลังดึงข้อมูล...\n' + C.reset);

  const res = await fetch(`${CONFIG.BASE_URL}/api/scan?market=thailand`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error('API error: ' + res.status);
  const scanData = await res.json();

  const stocks = scanData.data || [];
  const ms = scanData.marketSummary;
  const bf = ms?.breadth_full;
  const regime = getRegime(bf);
  const scored = computeScores(stocks);
  const filtered = scored.filter(s => s.rs >= CONFIG.RS_MIN).sort((a, b) => b.compositeScore - a.compositeScore).slice(0, CONFIG.MAX_STOCKS);
  const shortlist = computeWeights(filtered);

  // History
  const history = loadHistory();
  const previous = history.length ? history[history.length - 1] : null;
  const comparison = compareWithLast(shortlist, previous);

  const weekLabel = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  const dateStr = new Date().toISOString().slice(0, 10);

  // Save to history
  const record = {
    date: dateStr,
    regime: { label: regime.label, pct: regime.pct, multiplier: regime.multiplier },
    shortlist: shortlist.map(s => ({ ticker: s.ticker, rs: s.rs, weight: s.weight, compositeScore: s.compositeScore })),
    changes: comparison,
  };
  history.push(record);
  // Keep last 52 weeks
  if (history.length > 52) history.splice(0, history.length - 52);
  saveHistory(history);

  // Generate reports
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const md = generateMarkdownReport(shortlist, regime, scanData, comparison, weekLabel);
  const mdPath = path.join(REPORTS_DIR, `report_${dateStr}.md`);
  fs.writeFileSync(mdPath, md, 'utf8');

  // JSON export
  if (doJSON || true) {
    const jsonPayload = {
      generated_at: new Date().toISOString(),
      week: dateStr,
      regime,
      shortlist: shortlist.map(s => ({
        ticker: s.ticker,
        name: s.name,
        rs: s.rs,
        compositeScore: s.compositeScore,
        weight: s.weight,
        effectiveWeight: +(s.weight * regime.multiplier).toFixed(1),
        price: s.price,
        change: s.change,
        p1m: s.p1m,
        p3m: s.p3m,
        p1y: s.p1y,
        rvol: s.relVol,
        rankDelta: s.rD,
        val_m: s.val ? +(s.val / 1e6).toFixed(1) : null,
        group: s.group,
        industry: s.industry,
        stop_loss_price: s.price ? +(s.price * (1 - CONFIG.STOP_LOSS_PCT / 100)).toFixed(3) : null,
      })),
      changes: comparison,
    };
    const jsonPath = path.join(REPORTS_DIR, `report_${dateStr}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(jsonPayload, null, 2), 'utf8');
    console.log(`  💾 JSON: ${jsonPath}`);
  }

  console.log(`  📄 MD:   ${mdPath}`);

  // Console summary
  console.log('\n' + C.bold + C.cyan + '═'.repeat(70) + C.reset);
  console.log(C.bold + `  📊 Weekly Report — ${weekLabel}` + C.reset);
  console.log(C.cyan + '═'.repeat(70) + C.reset);
  console.log(`\n  Regime: ${regime.emoji} ${C.bold}${regime.label}${C.reset}  Breadth=${regime.pct}%  Size=${(regime.multiplier * 100).toFixed(0)}%`);
  console.log(`\n  ${C.bold}Shortlist (${shortlist.length} ตัว):${C.reset}`);

  shortlist.forEach((s, i) => {
    const ew = (s.weight * regime.multiplier).toFixed(1);
    const newTag = comparison.new.includes(s.ticker) ? C.brightGreen + ' [NEW]' + C.reset : '';
    const rsColor = s.rs >= 90 ? C.brightGreen : s.rs >= 80 ? C.green : C.yellow;
    console.log(`  ${String(i + 1).padStart(2)}. ${rsColor}${s.ticker.padEnd(8)}${C.reset} RS=${C.bold}${s.rs}${C.reset}  Score=${s.compositeScore.toFixed(1)}  Weight=${C.bold}${ew}%${C.reset}${newTag}`);
  });

  if (comparison.new.length) console.log(`\n  🆕 ${C.brightGreen}เข้าใหม่:${C.reset} ${comparison.new.join(', ')}`);
  if (comparison.dropped.length) console.log(`  ❌ ${C.red}ออก:${C.reset} ${comparison.dropped.join(', ')}`);

  console.log('\n' + C.cyan + '═'.repeat(70) + C.reset + '\n');
}

main().catch(e => { console.error(C.red + '❌ ' + e.message + C.reset); process.exit(1); });
