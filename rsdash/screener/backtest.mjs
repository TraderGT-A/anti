import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

const TICKERS = [
    'AOT.BK','PTT.BK','CPALL.BK','SCC.BK','ADVANC.BK',
    'DELTA.BK','GULF.BK','PTTEP.BK','BDMS.BK','BBL.BK',
    'KBANK.BK','SCB.BK','CPN.BK','TRUE.BK','MINT.BK',
    'KTB.BK','CRC.BK','OR.BK','BGRIM.BK','GPSC.BK',
    'TOP.BK','IVL.BK','CBG.BK','TU.BK','CPAXT.BK',
    'INTUCH.BK','WHA.BK','BEM.BK','GLOBAL.BK','TISCO.BK'
];

async function fetchData(ticker) {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=4y`;
    for(let i=0; i<3; i++) {
        try {
            const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const data = await res.json();
            const timestamps = data.chart.result[0].timestamp || [];
            const closes = data.chart.result[0].indicators.quote[0].close || [];
            let resMap = {};
            for(let j=0; j<timestamps.length; j++) {
                if (closes[j]) {
                    const date = new Date(timestamps[j] * 1000).toISOString().split('T')[0];
                    resMap[date] = closes[j];
                }
            }
            return resMap;
        } catch(e) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    return {};
}

async function run() {
    console.log(">> Downloading 4-year historical data for 30 top SET stocks...");
    const allData = {};
    for(let t of TICKERS) {
        allData[t] = await fetchData(t);
    }

    const dates = Object.keys(allData['AOT.BK']).sort();
    
    const prices = {};
    for (let t of TICKERS) {
        prices[t] = new Array(dates.length).fill(null);
    }

    for (let i = 0; i < dates.length; i++) {
        const d = dates[i];
        for (let t of TICKERS) {
            let p = allData[t][d];
            if (p == null && i > 0) p = prices[t][i-1];
            prices[t][i] = p;
        }
    }

    const sma50 = {};
    const mom3m = {};
    for (let t of TICKERS) {
        sma50[t] = new Array(dates.length).fill(null);
        mom3m[t] = new Array(dates.length).fill(null);
        for (let i = 0; i < dates.length; i++) {
            if (i >= 50) {
                let sum = 0;
                for (let j = 0; j < 50; j++) sum += prices[t][i-j];
                sma50[t][i] = sum / 50;
            }
            if (i >= 60) {
                const past = prices[t][i-60];
                if (past) mom3m[t][i] = (prices[t][i] - past) / past;
            }
        }
    }

    let cash = 1000000;
    let holdings = {}; 
    const equityCurve = [];
    const benchmarkCurve = [];
    
    // NEW: Trade Log
    const tradeLog = [];
    
    const startIdx = 100; 
    
    let benchCash = 1000000;
    let benchHoldings = {};
    const benchAlloc = benchCash / TICKERS.length;
    for(let t of TICKERS) {
        if(prices[t][startIdx]) {
            const shares = Math.floor(benchAlloc / prices[t][startIdx]);
            benchHoldings[t] = { shares };
            benchCash -= shares * prices[t][startIdx];
        }
    }

    let hitsStopLoss = 0;

    console.log(">> Starting Portfolio Simulation...");

    for (let i = startIdx; i < dates.length; i++) {
        const today = dates[i];
        
        let portValue = cash;
        for (let t in holdings) {
            const p = prices[t][i];
            if (p) portValue += holdings[t].shares * p;
        }
        equityCurve.push({ date: today, value: portValue });
        
        let benchValue = benchCash;
        for (let t in benchHoldings) {
            const p = prices[t][i];
            if (p) benchValue += benchHoldings[t].shares * p;
        }
        benchmarkCurve.push({ date: today, value: benchValue });

        // Daily Stop Loss Check (-7.5%)
        for (let t in holdings) {
            const currentPrice = prices[t][i];
            const entryPrice = holdings[t].entryPrice;
            const entryDate = holdings[t].entryDate;
            if (currentPrice && currentPrice <= entryPrice * 0.925) {
                cash += holdings[t].shares * currentPrice;
                
                tradeLog.push({
                    ticker: t.replace('.BK',''),
                    entryDate,
                    entryPrice,
                    exitDate: today,
                    exitPrice: currentPrice,
                    reason: 'Stop Loss (-7.5%)',
                    profitPct: ((currentPrice - entryPrice) / entryPrice) * 100
                });
                
                delete holdings[t];
                hitsStopLoss++;
            }
        }

        // Weekly Rebalance (Friday)
        const dObj = new Date(today);
        if (dObj.getDay() === 5) {
            let aboveSMA = 0;
            let validStocks = 0;
            for (let t of TICKERS) {
                if (prices[t][i] && sma50[t][i]) {
                    validStocks++;
                    if (prices[t][i] > sma50[t][i]) aboveSMA++;
                }
            }
            const breadth = validStocks > 0 ? aboveSMA / validStocks : 0;

            if (breadth < 0.40) {
                // Sell all due to Bear Market
                for (let t in holdings) {
                    const exitPrice = prices[t][i];
                    if (exitPrice) {
                        cash += holdings[t].shares * exitPrice;
                        tradeLog.push({
                            ticker: t.replace('.BK',''),
                            entryDate: holdings[t].entryDate,
                            entryPrice: holdings[t].entryPrice,
                            exitDate: today,
                            exitPrice: exitPrice,
                            reason: 'Market Bear (Cash)',
                            profitPct: ((exitPrice - holdings[t].entryPrice) / holdings[t].entryPrice) * 100
                        });
                    }
                }
                holdings = {};
            } else {
                // Rank top 5
                const scored = [];
                for (let t of TICKERS) {
                    if (prices[t][i] && prices[t][i] > sma50[t][i] && mom3m[t][i] != null) {
                        scored.push({ ticker: t, score: mom3m[t][i] });
                    }
                }
                scored.sort((a,b) => b.score - a.score);
                const targetHoldings = scored.slice(0, 5).map(x => x.ticker);

                // Sell non-target
                for (let t in holdings) {
                    if (!targetHoldings.includes(t)) {
                        const exitPrice = prices[t][i];
                        if (exitPrice) {
                            cash += holdings[t].shares * exitPrice;
                            tradeLog.push({
                                ticker: t.replace('.BK',''),
                                entryDate: holdings[t].entryDate,
                                entryPrice: holdings[t].entryPrice,
                                exitDate: today,
                                exitPrice: exitPrice,
                                reason: 'Rebalance (Rank Drop)',
                                profitPct: ((exitPrice - holdings[t].entryPrice) / holdings[t].entryPrice) * 100
                            });
                        }
                        delete holdings[t];
                    }
                }

                // Buy targets
                const targetAlloc = portValue / 5;
                for (let t of targetHoldings) {
                    if (!holdings[t] && prices[t][i]) {
                        const entryPrice = prices[t][i];
                        const availableCash = Math.min(cash, targetAlloc);
                        const shares = Math.floor(availableCash / entryPrice);
                        if (shares > 0) {
                            holdings[t] = { shares, entryPrice, entryDate: today };
                            cash -= shares * entryPrice;
                        }
                    }
                }
            }
        }
    }

    // Sell remaining holdings at the end of simulation to finalize Trade Log
    const lastDay = dates[dates.length - 1];
    for (let t in holdings) {
        const exitPrice = prices[t][dates.length - 1];
        if (exitPrice) {
            tradeLog.push({
                ticker: t.replace('.BK',''),
                entryDate: holdings[t].entryDate,
                entryPrice: holdings[t].entryPrice,
                exitDate: lastDay,
                exitPrice: exitPrice,
                reason: 'End of Test (Unrealized)',
                profitPct: ((exitPrice - holdings[t].entryPrice) / holdings[t].entryPrice) * 100
            });
        }
    }

    function calcStats(curve) {
        const startVal = curve[0].value;
        const endVal = curve[curve.length-1].value;
        const years = curve.length / 252;
        const cagr = Math.pow(endVal / startVal, 1 / years) - 1;
        
        let maxDd = 0;
        let peak = startVal;
        for(let p of curve) {
            if (p.value > peak) peak = p.value;
            const dd = (peak - p.value) / peak;
            if (dd > maxDd) maxDd = dd;
        }
        return { cagr: cagr * 100, maxDd: maxDd * 100, ret: ((endVal/startVal)-1)*100 };
    }

    const stratStats = calcStats(equityCurve);
    const benchStats = calcStats(benchmarkCurve);

    console.log(">> Generating HTML Chart & Trade Log...");

    const stratDD = [];
    let stratPeak = equityCurve[0].value;
    for(let i=0; i<equityCurve.length; i++) {
        if(equityCurve[i].value > stratPeak) stratPeak = equityCurve[i].value;
        stratDD.push(((equityCurve[i].value - stratPeak) / stratPeak) * 100);
    }

    const benchDD = [];
    let benchPeak = benchmarkCurve[0].value;
    for(let i=0; i<benchmarkCurve.length; i++) {
        if(benchmarkCurve[i].value > benchPeak) benchPeak = benchmarkCurve[i].value;
        benchDD.push(((benchmarkCurve[i].value - benchPeak) / benchPeak) * 100);
    }

    const datesJson = JSON.stringify(equityCurve.map(x => x.date));
    const stratValJson = JSON.stringify(equityCurve.map(x => Math.round(x.value)));
    const benchValJson = JSON.stringify(benchmarkCurve.map(x => Math.round(x.value)));
    const stratDdJson = JSON.stringify(stratDD.map(x => x.toFixed(2)));
    const benchDdJson = JSON.stringify(benchDD.map(x => x.toFixed(2)));

    // Generate Trade Log HTML Rows
    const tradeTableRows = tradeLog.map(t => {
        const color = t.profitPct > 0 ? '#30d158' : '#ff453a';
        return `
        <tr style="border-bottom:1px solid #1e2634; text-align:right;">
            <td style="padding:10px; text-align:left; color:#e9edf2; font-weight:bold;">${t.ticker}</td>
            <td style="padding:10px; color:#8b99a9;">${t.entryDate}</td>
            <td style="padding:10px; color:#e9edf2;">฿${t.entryPrice.toFixed(2)}</td>
            <td style="padding:10px; color:#8b99a9;">${t.exitDate}</td>
            <td style="padding:10px; color:#e9edf2;">฿${t.exitPrice.toFixed(2)}</td>
            <td style="padding:10px; color:#5ac8fa;">${t.reason}</td>
            <td style="padding:10px; font-weight:bold; color:${color};">${t.profitPct > 0 ? '+' : ''}${t.profitPct.toFixed(2)}%</td>
        </tr>
        `;
    }).reverse().join(''); // Reverse to show latest trades first

    const html = `<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <title>RS Screener Backtest Results</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { background: #05070b; color: #e9edf2; font-family: sans-serif; padding: 20px; margin: 0; }
        .container { max-width: 1200px; margin: 0 auto; }
        h2 { text-align: center; color: #5ac8fa; margin-bottom: 5px; }
        p { text-align: center; color: #6b7787; margin-top: 0; font-size: 14px; margin-bottom: 30px; }
        .chart-box { background: #0d1219; border: 1px solid #1e2634; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
        .stats { display: flex; justify-content: space-around; background: #0d1219; border: 1px solid #1e2634; border-radius: 12px; padding: 20px; margin-bottom: 20px; flex-wrap: wrap; gap: 15px; }
        .stat-item { text-align: center; }
        .stat-label { font-size: 12px; color: #8b99a9; }
        .stat-val { font-size: 20px; font-weight: bold; margin-top: 5px; }
        .st-green { color: #30d158; }
        .st-blue { color: #5ac8fa; }
        .st-red { color: #ff453a; }
        table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
        th { background: #05070b; position: sticky; top: 0; padding: 10px; color: #8b99a9; text-align:right; border-bottom:1px solid #1e2634; }
        th:first-child { text-align:left; }
    </style>
</head>
<body>
    <div class="container">
        <h2>📊 กลยุทธ์ RS Screener vs ตลาด (Equal Weight SET30)</h2>
        <p>ระยะเวลาทดสอบย้อนหลัง: ${equityCurve[0].date} ถึง ${equityCurve[equityCurve.length-1].date}</p>
        
        <div class="stats">
            <div class="stat-item">
                <div class="stat-label">พอร์ตเรากำไร (Total Return)</div>
                <div class="stat-val st-green">+${stratStats.ret.toFixed(2)}%</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">ตลาดกำไร (Total Return)</div>
                <div class="stat-val st-blue">+${benchStats.ret.toFixed(2)}%</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">พอร์ตเราติดลบสูงสุด (Max DD)</div>
                <div class="stat-val st-red">-${stratStats.maxDd.toFixed(2)}%</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">ตลาดติดลบสูงสุด (Max DD)</div>
                <div class="stat-val st-red">-${benchStats.maxDd.toFixed(2)}%</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">จำนวนการเทรดทั้งหมด</div>
                <div class="stat-val">${tradeLog.length} ครั้ง</div>
            </div>
        </div>

        <div class="chart-box">
            <canvas id="eqChart" height="100"></canvas>
        </div>
        <div class="chart-box">
            <canvas id="ddChart" height="70"></canvas>
        </div>

        <div class="chart-box" style="max-height: 500px; overflow-y: auto;">
            <h3 style="text-align:center; color:#ffd60a; margin-top: 0;">📜 ประวัติการซื้อขายทั้งหมด (Trade Log)</h3>
            <p style="text-align:center; margin-bottom: 10px;">เช็คได้เลยว่าระบบเข้าออกวันไหน ราคาเท่าไหร่ และออกแบบไหน</p>
            <table>
                <tr>
                    <th>หุ้น (Ticker)</th>
                    <th>วันที่ซื้อ (Entry Date)</th>
                    <th>ราคาซื้อ (Entry)</th>
                    <th>วันที่ขาย (Exit Date)</th>
                    <th>ราคาขาย (Exit)</th>
                    <th>สาเหตุที่ขาย (Reason)</th>
                    <th>กำไร/ขาดทุน (P/L)</th>
                </tr>
                ${tradeTableRows}
            </table>
        </div>
    </div>

    <script>
        const dates = ${datesJson};
        const stratVals = ${stratValJson};
        const benchVals = ${benchValJson};
        const stratDD = ${stratDdJson};
        const benchDD = ${benchDdJson};

        const eqCtx = document.getElementById('eqChart').getContext('2d');
        new Chart(eqCtx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [
                    { label: 'RS Strategy', data: stratVals, borderColor: '#30d158', backgroundColor: 'rgba(48, 209, 88, 0.1)', borderWidth: 2, pointRadius: 0, fill: true, tension: 0.1 },
                    { label: 'Benchmark (SET30)', data: benchVals, borderColor: '#5ac8fa', borderWidth: 2, pointRadius: 0, borderDash: [5, 5], tension: 0.1 }
                ]
            },
            options: {
                responsive: true,
                interaction: { mode: 'index', intersect: false },
                plugins: { title: { display: true, text: '📈 Equity Curve (การเติบโตของเงินทุน)', color: '#e9edf2', font: { size: 16 } }, legend: { labels: { color: '#e9edf2' } } },
                scales: { x: { ticks: { color: '#8b99a9', maxTicksLimit: 20 }, grid: { color: '#1e2634' } }, y: { ticks: { color: '#8b99a9' }, grid: { color: '#1e2634' } } }
            }
        });

        const ddCtx = document.getElementById('ddChart').getContext('2d');
        new Chart(ddCtx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [
                    { label: 'Strategy Drawdown %', data: stratDD, borderColor: '#ff453a', backgroundColor: 'rgba(255, 69, 58, 0.2)', borderWidth: 1, pointRadius: 0, fill: true, tension: 0.1 },
                    { label: 'Benchmark Drawdown %', data: benchDD, borderColor: '#ff9f0a', borderWidth: 1, pointRadius: 0, tension: 0.1 }
                ]
            },
            options: {
                responsive: true,
                interaction: { mode: 'index', intersect: false },
                plugins: { title: { display: true, text: '📉 Drawdown (การขาดทุนสะสมจากจุดสูงสุด)', color: '#e9edf2', font: { size: 16 } }, legend: { labels: { color: '#e9edf2' } } },
                scales: { x: { ticks: { color: '#8b99a9', maxTicksLimit: 20 }, grid: { color: '#1e2634' } }, y: { max: 0, ticks: { color: '#8b99a9' }, grid: { color: '#1e2634' } } }
            }
        });
    </script>
</body>
</html>`;

    const htmlPath = path.resolve('backtest_chart.html');
    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log(`>> Trade Log added & Chart saved to: ${htmlPath}`);

    exec(`start "" "${htmlPath}"`);
}

run().catch(console.error);
