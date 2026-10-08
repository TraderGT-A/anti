/**
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  RS SCREENER — Thai Stock Momentum Strategy                      │
 * │  Source: rsdashclean.vercel.app API                              │
 * │  Strategy: RS ≥ 70 + Composite Score + RS-Weighted Sizing        │
 * │  Run: node screener.mjs [--html] [--json] [--top N]              │
 * └─────────────────────────────────────────────────────────────────┘
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── CONFIG ─────────────────────────────────────────────────────────
const CONFIG = {
  BASE_URL: 'https://rsdashclean.vercel.app',
  MARKET: 'thailand',
  // Universe filter
  RS_MIN: 70,
  VAL_MIN_M: 30,          // มูลค่าซื้อขายขั้นต่ำ (ล้านบาท)
  // Portfolio
  MAX_STOCKS: 15,
  MIN_STOCKS: 10,
  MAX_WEIGHT_PCT: 15,     // น้ำหนักสูงสุดต่อตัว (%)
  MIN_WEIGHT_PCT: 4,      // น้ำหนักต่ำสุดต่อตัว (%)
  // Market Regime Breadth (% เหนือ SMA50)
  BREADTH_FULL: 50,       // ≥50% → Full size
  BREADTH_HALF: 40,       // 40-49% → Half size
  // Composite Score weights (รวม = 100)
  WEIGHTS: {
    rs: 40,
    p3m: 20,
    p1m: 15,
    rankRise: 15,
    rvol: 10,
  },
  // Stop loss / exit
  STOP_LOSS_PCT: 7.5,
  RS_EXIT: 60,
};

// ─── COLOR HELPERS ───────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  brightGreen: '\x1b[92m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  white: '\x1b[97m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

const colorRS = (rs) => {
  if (rs >= 90) return C.brightGreen;
  if (rs >= 80) return C.green;
  if (rs >= 70) return C.yellow;
  return C.gray;
};

const colorChange = (v) => {
  if (v == null) return C.gray;
  return v > 0 ? C.green : v < 0 ? C.red : C.gray;
};

const fPct = (v, decimals = 2) => {
  if (v == null || !isFinite(v)) return '-';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(decimals)}%`;
};

const fNum = (v) => {
  if (v == null) return '-';
  if (v >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 1 });
  if (v >= 10) return v.toFixed(2);
  return v.toFixed(3);
};

const fM = (v) => {
  if (v == null) return '-';
  const m = v / 1e6;
  if (m >= 1000) return `${(m / 1000).toFixed(1)}B`;
  return `${m.toFixed(0)}M`;
};

// ─── API ──────────────────────────────────────────────────────────────
async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'RS-Screener/1.0 (auto-screener)' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function fetchScanData() {
  const url = `${CONFIG.BASE_URL}/api/scan?market=${CONFIG.MARKET}`;
  return fetchJSON(url);
}

async function fetchBreadthHistory(days = 30) {
  const url = `${CONFIG.BASE_URL}/api/breadth?market=${CONFIG.MARKET}&days=${days}`;
  return fetchJSON(url);
}

// ─── SCORING ENGINE ───────────────────────────────────────────────────
/**
 * Normalize value within an array to 0-100 percentile rank
 */
function percentileRank(arr, val) {
  if (!arr.length) return 50;
  const sorted = [...arr].sort((a, b) => a - b);
  const below = sorted.filter(x => x < val).length;
  return (below / (sorted.length - 1)) * 100;
}

/**
 * Compute composite score 0-100 for each stock
 * Weights: RS 40% | 3M% 20% | 1M% 15% | ΔRank 15% | RVOL 10%
 */
function computeScores(stocks) {
  const valid = stocks.filter(s =>
    s.rs != null && s.val != null && s.val >= CONFIG.VAL_MIN_M * 1e6
  );

  // Extract arrays for percentile calc
  const p3mArr = valid.map(s => s.p3m ?? 0);
  const p1mArr = valid.map(s => s.p1m ?? 0);
  const rvolArr = valid.map(s => s.relVol ?? 0);
  const rdArr = valid.map(s => s.rD ?? 0);    // rank delta (positive = rising)

  return valid.map(s => {
    const rsScore = (s.rs / 100) * CONFIG.WEIGHTS.rs;

    const p3mRank = percentileRank(p3mArr, s.p3m ?? 0);
    const p3mScore = (p3mRank / 100) * CONFIG.WEIGHTS.p3m;

    const p1mRank = percentileRank(p1mArr, s.p1m ?? 0);
    const p1mScore = (p1mRank / 100) * CONFIG.WEIGHTS.p1m;

    // ΔRank: positive = rising (good), normalize 0-100
    const rdRank = percentileRank(rdArr, s.rD ?? 0);
    const rdScore = (rdRank / 100) * CONFIG.WEIGHTS.rankRise;

    // RVOL: cap at 3x, normalize
    const rvolCapped = Math.min(s.relVol ?? 0, 3);
    const rvolScore = (rvolCapped / 3) * CONFIG.WEIGHTS.rvol;

    const totalScore = rsScore + p3mScore + p1mScore + rdScore + rvolScore;

    return {
      ...s,
      _rsScore: rsScore,
      _p3mScore: p3mScore,
      _p1mScore: p1mScore,
      _rdScore: rdScore,
      _rvolScore: rvolScore,
      compositeScore: Math.round(totalScore * 10) / 10,
    };
  });
}

// ─── PORTFOLIO SIZING ────────────────────────────────────────────────
/**
 * RS-Weighted position sizing with min/max cap
 */
function computeWeights(shortlist) {
  const totalRS = shortlist.reduce((s, x) => s + x.rs, 0);
  if (!totalRS) return shortlist.map(s => ({ ...s, weight: 100 / shortlist.length }));

  const raw = shortlist.map(s => ({
    ...s,
    weight: (s.rs / totalRS) * 100,
  }));

  // Apply min/max cap iteratively
  let capped = raw.map(s => ({
    ...s,
    weight: Math.max(CONFIG.MIN_WEIGHT_PCT, Math.min(CONFIG.MAX_WEIGHT_PCT, s.weight)),
  }));

  // Re-normalize to 100%
  const total = capped.reduce((s, x) => s + x.weight, 0);
  capped = capped.map(s => ({ ...s, weight: Math.round((s.weight / total) * 1000) / 10 }));

  return capped;
}

// ─── MARKET REGIME ────────────────────────────────────────────────────
function getRegime(breadthFull) {
  const pct = breadthFull?.pctAboveMA50;
  if (pct == null) return { label: 'UNKNOWN', emoji: '❓', multiplier: 1, color: C.gray };
  if (pct >= CONFIG.BREADTH_FULL) return { label: 'BULL', emoji: '🟢', multiplier: 1.0, pct, color: C.brightGreen };
  if (pct >= CONFIG.BREADTH_HALF) return { label: 'NEUTRAL', emoji: '🟡', multiplier: 0.5, pct, color: C.yellow };
  return { label: 'BEAR', emoji: '🔴', multiplier: 0.25, pct, color: C.red };
}

// ─── ENTRY SIGNAL CHECK ───────────────────────────────────────────────
function checkEntrySignals(s) {
  const signals = [];
  const flags = [];

  if (s.rs >= 90) signals.push('RS≥90 LEADER');
  if (s.rD > 0) signals.push('↑ΔRank+' + s.rD);
  if (s.relVol >= 1.5) signals.push(`RVOL${s.relVol.toFixed(1)}x`);
  if ((s.p1m ?? 0) > 0) signals.push('1M+');
  if ((s.p1m ?? 0) > 5) signals.push('1M>5%');

  if (s.rD < -5) flags.push('⚠️ ΔRank-' + Math.abs(s.rD));
  if (s.rs < 70) flags.push('⚠️ RS<70');
  if ((s.p1m ?? 0) < -5) flags.push('⚠️ 1M<-5%');

  // Strong entry = at least 3 positive signals
  const strength = signals.length >= 3 ? 'STRONG' : signals.length >= 2 ? 'MODERATE' : 'WEAK';

  return { signals, flags, strength };
}

// ─── FORMATTING ──────────────────────────────────────────────────────
function bar(value, max, width = 20, fillChar = '█', emptyChar = '░') {
  const filled = Math.round((value / max) * width);
  return fillChar.repeat(Math.max(0, filled)) + emptyChar.repeat(Math.max(0, width - filled));
}

function pad(str, len, right = false) {
  const s = String(str ?? '');
  if (right) return s.padStart(len);
  return s.padEnd(len);
}

// ─── MAIN OUTPUT ─────────────────────────────────────────────────────
function printHeader(scanData, regime, breadthFull, breadthHist) {
  const ms = scanData.marketSummary;
  const money = ms?.money1d;
  const moneyDir = ms?.moneyDir;

  console.log('\n' + C.bold + C.cyan + '═'.repeat(80) + C.reset);
  console.log(C.bold + C.white + '  📊 RS SCREENER — หุ้นไทย (SET/mai)' + C.reset + C.gray + '  ' + new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) + C.reset);
  console.log(C.cyan + '═'.repeat(80) + C.reset);

  // Market Regime
  const regimeBg = regime.label === 'BULL' ? C.bgGreen : regime.label === 'NEUTRAL' ? C.bgYellow : C.bgRed;
  console.log(`\n  ${regime.emoji} ${C.bold}Market Regime:${C.reset} ${regimeBg}${C.bold} ${regime.label} ${C.reset} ` +
    `${regime.color}Breadth SMA50 = ${regime.pct ?? '?'}%${C.reset}`);

  // Breadth details
  if (breadthFull) {
    const ma50Pct = breadthFull.pctAboveMA50;
    const ma200Pct = breadthFull.pctAboveMA200;
    const ma50Bar = bar(ma50Pct, 100, 20);
    const ma200Bar = bar(ma200Pct, 100, 20);
    console.log(`  ${C.blue}SMA50:  ${C.reset}[${C.cyan}${ma50Bar}${C.reset}] ${C.bold}${ma50Pct}%${C.reset} เหนือ SMA50`);
    console.log(`  ${C.yellow}SMA200: ${C.reset}[${C.yellow}${ma200Bar}${C.reset}] ${C.bold}${ma200Pct}%${C.reset} เหนือ SMA200`);
    console.log(`  ${C.gray}Stock up: ${breadthFull.up} / down: ${breadthFull.down} / total: ${breadthFull.total}${C.reset}`);
  }

  // Money Flow
  if (money) {
    const flowColor = moneyDir === 'เข้า' ? C.green : C.red;
    const inPct = ((money.in / (money.in + money.out)) * 100).toFixed(0);
    console.log(`\n  💰 Money Flow: ${flowColor}${C.bold}${moneyDir}  สุทธิ ${fM(money.net)}${C.reset}` +
      `${C.gray}  (ขึ้น ${fM(money.in)} ${inPct}% / ลง ${fM(money.out)})${C.reset}`);
  }

  // Size recommendation
  const sizeReco = regime.multiplier === 1 ? '✅ FULL SIZE (100%)' :
    regime.multiplier === 0.5 ? '⚡ HALF SIZE (50%)' : '🛑 MINIMAL / CASH (25%)';
  console.log(`  📐 แนะนำขนาดลงทุน: ${C.bold}${regime.color}${sizeReco}${C.reset}`);

  // Universe stats
  const total = scanData.total_market;
  const passed = scanData.count;
  console.log(`\n  📋 Universe: ${C.bold}${passed}${C.reset} หุ้นผ่านเกณฑ์ (จาก ${total} ทั้งกระดาน)` +
    ` → กรอง RS≥${CONFIG.RS_MIN} + Val≥${CONFIG.VAL_MIN_M}M`);
}

function printShortlist(shortlist, regime) {
  console.log('\n' + C.bold + C.cyan + '─'.repeat(80) + C.reset);
  console.log(C.bold + '  🏆 SHORTLIST — ' + shortlist.length + ' ตัว (RS-Weighted Portfolio)' + C.reset);
  console.log(C.cyan + '─'.repeat(80) + C.reset);

  // Header
  const hdr = [
    pad('#', 3),
    pad('Ticker', 8),
    pad('Name', 22),
    pad('RS', 5, true),
    pad('Score', 7, true),
    pad('3M%', 7, true),
    pad('1M%', 7, true),
    pad('RVOL', 6, true),
    pad('ΔRank', 7, true),
    pad('Val', 7, true),
    pad('Weight', 7, true),
    pad('Signal', 12),
  ].join(' ');
  console.log(C.gray + '  ' + hdr + C.reset);
  console.log(C.gray + '  ' + '─'.repeat(78) + C.reset);

  shortlist.forEach((s, i) => {
    const entry = checkEntrySignals(s);
    const signalColor = entry.strength === 'STRONG' ? C.brightGreen :
      entry.strength === 'MODERATE' ? C.yellow : C.gray;
    const effectiveWeight = (s.weight * regime.multiplier).toFixed(1);

    const row = [
      pad(i + 1, 3),
      `${colorRS(s.rs)}${pad(s.ticker, 8)}${C.reset}`,
      C.gray + pad((s.name || '').slice(0, 21), 22) + C.reset,
      colorRS(s.rs) + pad(s.rs, 5, true) + C.reset,
      C.cyan + pad(s.compositeScore.toFixed(1), 7, true) + C.reset,
      colorChange(s.p3m) + pad(fPct(s.p3m, 1), 7, true) + C.reset,
      colorChange(s.p1m) + pad(fPct(s.p1m, 1), 7, true) + C.reset,
      (s.relVol >= 1.5 ? C.green : C.gray) + pad((s.relVol ?? 0).toFixed(1) + 'x', 6, true) + C.reset,
      (s.rD > 0 ? C.green : s.rD < 0 ? C.red : C.gray) + pad((s.rD > 0 ? '+' : '') + (s.rD ?? 0), 7, true) + C.reset,
      C.gray + pad(fM(s.val), 7, true) + C.reset,
      C.bold + pad(effectiveWeight + '%', 7, true) + C.reset,
      signalColor + entry.strength + C.reset,
    ].join(' ');

    console.log('  ' + row);
  });
}

function printSignalDetail(shortlist) {
  console.log('\n' + C.bold + C.cyan + '─'.repeat(80) + C.reset);
  console.log(C.bold + '  🎯 Entry Signal Detail' + C.reset);
  console.log(C.cyan + '─'.repeat(80) + C.reset);

  const strong = shortlist.filter(s => checkEntrySignals(s).strength === 'STRONG');
  const moderate = shortlist.filter(s => checkEntrySignals(s).strength === 'MODERATE');

  if (strong.length) {
    console.log(`\n  ${C.brightGreen}${C.bold}STRONG ENTRY (≥3 signals):${C.reset}`);
    strong.forEach(s => {
      const e = checkEntrySignals(s);
      console.log(`  ${C.brightGreen}●${C.reset} ${C.bold}${s.ticker}${C.reset} [RS${s.rs}]  ${e.signals.join(' · ')}`);
    });
  }

  if (moderate.length) {
    console.log(`\n  ${C.yellow}${C.bold}MODERATE ENTRY (2 signals):${C.reset}`);
    moderate.forEach(s => {
      const e = checkEntrySignals(s);
      console.log(`  ${C.yellow}●${C.reset} ${C.bold}${s.ticker}${C.reset} [RS${s.rs}]  ${e.signals.join(' · ')}`);
    });
  }
}

function printMarketSummary(scanData) {
  const ms = scanData.marketSummary;
  if (!ms) return;

  console.log('\n' + C.bold + C.cyan + '─'.repeat(80) + C.reset);
  console.log(C.bold + '  📰 Market Signals จาก Dashboard' + C.reset);
  console.log(C.cyan + '─'.repeat(80) + C.reset);

  if (ms.strongest?.length) {
    console.log(`\n  ${C.brightGreen}💪 Leaders (RS≥90):${C.reset} ` +
      ms.strongest.slice(0, 10).map(s => `${C.bold}${s.ticker}${C.reset}${C.gray}RS${s.rs}${C.reset}`).join('  '));
  }

  if (ms.upComing?.length) {
    console.log(`  ${C.yellow}🚀 Upcoming:${C.reset} ` +
      ms.upComing.slice(0, 8).map(s => `${s.ticker}${C.gray}${s.rs}${C.reset}`).join('  '));
  }

  if (ms.rank_up?.length) {
    console.log(`  ${C.green}⬆️  ขึ้นอันดับเร็ว:${C.reset} ` +
      ms.rank_up.slice(0, 8).map(s => `${s.ticker}${C.green}+${s.rD}${C.reset}`).join('  '));
  }

  if (ms.rank_down?.length) {
    console.log(`  ${C.red}⬇️  ลงอันดับเร็ว:${C.reset} ` +
      ms.rank_down.slice(0, 8).map(s => `${s.ticker}${C.red}${s.rD}${C.reset}`).join('  '));
  }

  if (ms.inflows1d?.length) {
    console.log(`  ${C.cyan}💰 กลุ่มที่หุ้นขึ้น:${C.reset} ${ms.inflows1d.slice(0, 5).join(' · ')}`);
  }

  if (ms.outflows1d?.length) {
    console.log(`  ${C.red}📉 กลุ่มที่หุ้นลง:${C.reset} ${ms.outflows1d.slice(0, 5).join(' · ')}`);
  }
}

function printThemes(scanData) {
  const themes = scanData.themes;
  if (!themes?.length) return;

  console.log('\n' + C.bold + C.cyan + '─'.repeat(80) + C.reset);
  console.log(C.bold + '  🎯 Top Themes (RS≥80 กลุ่มเดียวกัน)' + C.reset);
  console.log(C.cyan + '─'.repeat(80) + C.reset);

  themes.slice(0, 6).forEach(t => {
    const tickers = (t.stocks || []).map(s => `${C.bold}${s.ticker}${C.reset}${C.gray}${s.rs}${C.reset}`).join(' ');
    console.log(`  #${t.rank} ${C.cyan}${(t.name || '').slice(0, 25)}${C.reset}` +
      ` ${C.gray}avgRS=${t.avgRS}${C.reset}  ${tickers}`);
  });
}

function printRiskRules() {
  console.log('\n' + C.bold + C.cyan + '─'.repeat(80) + C.reset);
  console.log(C.bold + '  ⚠️  Risk Management Rules' + C.reset);
  console.log(C.cyan + '─'.repeat(80) + C.reset);
  console.log(`  🛑 Hard Stop Loss: ${C.bold}${C.red}-${CONFIG.STOP_LOSS_PCT}%${C.reset} จากต้นทุน → ออกทันที`);
  console.log(`  📉 RS Exit: RS ร่วงต่ำกว่า ${C.bold}${C.red}${CONFIG.RS_EXIT}${C.reset} → ออก`);
  console.log(`  🔄 Trailing Stop: กำไร >25% → trail -10% จาก high`);
  console.log(`  ⚡ Market Exit: Breadth <${CONFIG.BREADTH_HALF}% → ลด position 50%`);
  console.log(`  📐 Max per stock: ${CONFIG.MAX_WEIGHT_PCT}% / Min: ${CONFIG.MIN_WEIGHT_PCT}%`);
}

function printFooter(scanData, shortlist) {
  const scoreSum = shortlist.reduce((s, x) => s + x.compositeScore, 0);
  const avgScore = scoreSum / shortlist.length || 0;
  const avgRS = shortlist.reduce((s, x) => s + x.rs, 0) / shortlist.length || 0;

  console.log('\n' + C.bold + C.cyan + '─'.repeat(80) + C.reset);
  console.log(`  📊 Portfolio Stats: ${shortlist.length} ตัว  avgRS=${C.bold}${avgRS.toFixed(1)}${C.reset}  avgScore=${C.bold}${avgScore.toFixed(1)}${C.reset}`);
  console.log(C.gray + `  ข้อมูลจาก rsdashclean.vercel.app · ${scanData.created_at || new Date().toISOString()}` + C.reset);
  console.log(C.gray + '  ⚠️  ไม่ใช่คำแนะนำลงทุน — ใช้ประกอบการตัดสินใจเท่านั้น' + C.reset);
  console.log(C.cyan + '═'.repeat(80) + C.reset + '\n');
}

// ─── JSON EXPORT ─────────────────────────────────────────────────────
function exportJSON(shortlist, regime, scanData) {
  const payload = {
    generated_at: new Date().toISOString(),
    market_regime: {
      label: regime.label,
      pctAboveMA50: regime.pct,
      size_multiplier: regime.multiplier,
    },
    shortlist: shortlist.map(s => ({
      ticker: s.ticker,
      name: s.name,
      rs: s.rs,
      rank: s.rT,
      compositeScore: s.compositeScore,
      weight_pct: s.weight,
      effective_weight_pct: +(s.weight * regime.multiplier).toFixed(1),
      price: s.price,
      change_pct: s.change,
      p1m: s.p1m,
      p3m: s.p3m,
      p1y: s.p1y,
      rvol: s.relVol,
      rankDelta: s.rD,
      val_m: s.val ? +(s.val / 1e6).toFixed(1) : null,
      group: s.group,
      industry: s.industry,
      entry_strength: checkEntrySignals(s).strength,
      signals: checkEntrySignals(s).signals,
      stop_loss_price: s.price ? +(s.price * (1 - CONFIG.STOP_LOSS_PCT / 100)).toFixed(3) : null,
    })),
    stats: {
      avgRS: +(shortlist.reduce((s, x) => s + x.rs, 0) / shortlist.length).toFixed(1),
      avgCompositeScore: +(shortlist.reduce((s, x) => s + x.compositeScore, 0) / shortlist.length).toFixed(1),
      total_universe: scanData.count,
      total_market: scanData.total_market,
    },
  };

  const outPath = path.join(__dirname, `shortlist_${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`\n  💾 JSON saved: ${outPath}`);
  return payload;
}

// ─── HTML EXPORT ─────────────────────────────────────────────────────
function exportHTML(shortlist, regime, scanData) {
  const rows = shortlist.map((s, i) => {
    const e = checkEntrySignals(s);
    const signalBg = e.strength === 'STRONG' ? '#0a2a0a' : e.strength === 'MODERATE' ? '#2a2a00' : '#1a1a1a';
    const rsColor = s.rs >= 90 ? '#30d158' : s.rs >= 80 ? '#34c759' : s.rs >= 70 ? '#ffd60a' : '#8e8e93';
    const p3mColor = (s.p3m ?? 0) >= 0 ? '#30d158' : '#ff453a';
    const p1mColor = (s.p1m ?? 0) >= 0 ? '#30d158' : '#ff453a';
    const effectiveWeight = (s.weight * regime.multiplier).toFixed(1);

    return `
    <tr style="background:${signalBg}; border-bottom: 1px solid #1e2634;">
      <td style="padding:8px 12px; color:#6b7787;">${i + 1}</td>
      <td style="padding:8px 12px; font-weight:700; color:#e9edf2;">${s.ticker}</td>
      <td style="padding:8px 12px; color:#8b99a9; font-size:11px; max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${s.name || ''}</td>
      <td style="padding:8px 12px; font-weight:700; color:${rsColor}; text-align:right;">${s.rs}</td>
      <td style="padding:8px 12px; color:#5ac8fa; text-align:right;">${s.compositeScore.toFixed(1)}</td>
      <td style="padding:8px 12px; color:${p3mColor}; text-align:right;">${fPct(s.p3m, 1)}</td>
      <td style="padding:8px 12px; color:${p1mColor}; text-align:right;">${fPct(s.p1m, 1)}</td>
      <td style="padding:8px 12px; color:${(s.relVol ?? 0) >= 1.5 ? '#30d158' : '#6b7787'}; text-align:right;">${(s.relVol ?? 0).toFixed(1)}x</td>
      <td style="padding:8px 12px; color:${s.rD > 0 ? '#30d158' : s.rD < 0 ? '#ff453a' : '#6b7787'}; text-align:right;">${s.rD > 0 ? '+' : ''}${s.rD ?? 0}</td>
      <td style="padding:8px 12px; color:#8b99a9; text-align:right;">${fM(s.val)}</td>
      <td style="padding:8px 12px; font-weight:700; text-align:right;">${effectiveWeight}%</td>
      <td style="padding:8px 12px; font-size:11px;">
        <span style="background:${e.strength === 'STRONG' ? '#1a4a1a' : e.strength === 'MODERATE' ? '#3a3a00' : '#222'}; 
          color:${e.strength === 'STRONG' ? '#30d158' : e.strength === 'MODERATE' ? '#ffd60a' : '#8b99a9'};
          padding:2px 8px; border-radius:4px; font-weight:600;">${e.strength}</span>
      </td>
      <td style="padding:8px 12px; color:#ff453a; font-size:11px;">${s.price ? `฿${(s.price * (1 - CONFIG.STOP_LOSS_PCT / 100)).toFixed(3)}` : '-'}</td>
    </tr>`;
  }).join('');

  const regimeColor = regime.label === 'BULL' ? '#30d158' : regime.label === 'NEUTRAL' ? '#ffd60a' : '#ff453a';
  const ms = scanData.marketSummary;
  const bf = ms?.breadth_full;

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RS Screener — ${new Date().toLocaleDateString('th-TH')}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #05070b; color: #e9edf2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; }
  h1 { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
  .subtitle { color: #6b7787; font-size: 12px; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .card { background: #0d1219; border: 1px solid #1e2634; border-radius: 12px; padding: 16px; }
  .card-label { font-size: 11px; color: #6b7787; margin-bottom: 4px; }
  .card-value { font-size: 22px; font-weight: 800; }
  .card-sub { font-size: 11px; color: #6b7787; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; background: #0d1219; border: 1px solid #1e2634; border-radius: 12px; overflow: hidden; }
  th { padding: 10px 12px; text-align: right; font-size: 11px; font-weight: 600; color: #6b7787; background: #05070b; border-bottom: 1px solid #1e2634; }
  th:nth-child(1), th:nth-child(2), th:nth-child(3) { text-align: left; }
  td:nth-child(1), td:nth-child(2), td:nth-child(3) { text-align: left; }
  tr:hover { background: #111827 !important; }
  .breadth-bar { height: 8px; border-radius: 4px; overflow: hidden; display: flex; margin-top: 6px; }
  .breadth-bar-fill { background: linear-gradient(to right, #3d8bff, #5ac8fa); }
  .breadth-bar-empty { background: #1e2634; flex: 1; }
  .section-title { font-size: 14px; font-weight: 700; margin: 24px 0 12px; color: #5ac8fa; }
  .footer { margin-top: 24px; font-size: 11px; color: #3a4455; text-align: center; }
</style>
</head>
<body>
<h1>📊 RS Screener — หุ้นไทย (SET/mai)</h1>
<div class="subtitle">Generated: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} · Source: rsdashclean.vercel.app</div>

<div class="grid">
  <div class="card">
    <div class="card-label">Market Regime</div>
    <div class="card-value" style="color:${regimeColor};">${regime.emoji} ${regime.label}</div>
    <div class="card-sub">Breadth SMA50 = ${regime.pct ?? '?'}%</div>
  </div>
  <div class="card">
    <div class="card-label">SMA50 Breadth</div>
    <div class="card-value" style="color:${regimeColor};">${bf?.pctAboveMA50 ?? '?'}%</div>
    <div class="breadth-bar"><div class="breadth-bar-fill" style="width:${bf?.pctAboveMA50 ?? 0}%"></div><div class="breadth-bar-empty"></div></div>
    <div class="card-sub">${bf?.aboveMA50 ?? '-'} / ${bf?.total ?? '-'} หุ้น</div>
  </div>
  <div class="card">
    <div class="card-label">SMA200 Breadth</div>
    <div class="card-value" style="color:#ffd60a;">${bf?.pctAboveMA200 ?? '?'}%</div>
    <div class="breadth-bar"><div class="breadth-bar-fill" style="width:${bf?.pctAboveMA200 ?? 0}%; background:linear-gradient(to right,#ff9f0a,#ffd60a);"></div><div class="breadth-bar-empty"></div></div>
    <div class="card-sub">${bf?.aboveMA200 ?? '-'} / ${bf?.total ?? '-'} หุ้น</div>
  </div>
  <div class="card">
    <div class="card-label">Money Flow</div>
    <div class="card-value" style="color:${ms?.moneyDir === 'เข้า' ? '#30d158' : '#ff453a'};">${ms?.moneyDir === 'เข้า' ? '▲' : '▼'} ${fM(ms?.money1d?.net ?? 0)}</div>
    <div class="card-sub">ขึ้น ${fM(ms?.money1d?.in)} / ลง ${fM(ms?.money1d?.out)}</div>
  </div>
  <div class="card">
    <div class="card-label">Position Size</div>
    <div class="card-value" style="color:${regimeColor};">${(regime.multiplier * 100).toFixed(0)}%</div>
    <div class="card-sub">${regime.label === 'BULL' ? 'Full allocation' : regime.label === 'NEUTRAL' ? 'Half allocation' : 'Minimal / Cash'}</div>
  </div>
  <div class="card">
    <div class="card-label">Shortlist</div>
    <div class="card-value">${shortlist.length} ตัว</div>
    <div class="card-sub">จาก Universe ${scanData.count} (RS≥${CONFIG.RS_MIN})</div>
  </div>
</div>

<div class="section-title">🏆 Shortlist — RS-Weighted Portfolio</div>
<div style="overflow-x:auto;">
<table>
  <thead>
    <tr>
      <th>#</th><th>Ticker</th><th>Name</th>
      <th>RS</th><th>Score</th><th>3M%</th><th>1M%</th>
      <th>RVOL</th><th>ΔRank</th><th>Value</th>
      <th>Weight</th><th>Signal</th><th>Stop ฿</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
</div>

<div class="footer">
  ⚠️ ไม่ใช่คำแนะนำลงทุน — ใช้ประกอบการตัดสินใจเท่านั้น · RS Screener v1.0
</div>
</body>
</html>`;

  const date = new Date().toISOString().slice(0, 10);
  const outPath = path.join(__dirname, `shortlist_${date}.html`);
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(`\n  🌐 HTML saved: ${outPath}`);
  return outPath;
}

// ─── MAIN ─────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const doHTML = args.includes('--html');
  const doJSON = args.includes('--json');
  const topArg = args.find(a => a.startsWith('--top='));
  const topN = topArg ? parseInt(topArg.split('=')[1]) : CONFIG.MAX_STOCKS;

  console.log(C.cyan + '\n  ⏳ กำลังดึงข้อมูลจาก rsdashclean.vercel.app...' + C.reset);

  try {
    // Fetch data concurrently
    const [scanData, breadthData] = await Promise.all([
      fetchScanData(),
      fetchBreadthHistory(30).catch(() => null),
    ]);

    const stocks = scanData.data || [];
    const ms = scanData.marketSummary;
    const breadthFull = ms?.breadth_full;

    // Market Regime
    const regime = getRegime(breadthFull);

    // Score & filter
    const scored = computeScores(stocks);
    const filtered = scored
      .filter(s => s.rs >= CONFIG.RS_MIN)
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .slice(0, topN);

    // Position sizing
    const shortlist = computeWeights(filtered);

    // Output
    printHeader(scanData, regime, breadthFull, breadthData?.history);
    printShortlist(shortlist, regime);
    printSignalDetail(shortlist);
    printMarketSummary(scanData);
    printThemes(scanData);
    printRiskRules();
    printFooter(scanData, shortlist);

    // Export
    if (doJSON) exportJSON(shortlist, regime, scanData);
    if (doHTML) {
      const htmlPath = exportHTML(shortlist, regime, scanData);
      // Try to open in browser
      const { exec } = await import('child_process');
      exec(`start "" "${htmlPath}"`);
    }

  } catch (err) {
    console.error(C.red + '\n  ❌ Error: ' + err.message + C.reset);
    if (err.cause) console.error(C.gray + '  Cause: ' + err.cause.message + C.reset);
    process.exit(1);
  }
}

main();
