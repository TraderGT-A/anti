import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { parseF45 } from "./parse_f45.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_FILE = path.join(__dirname, "raw.json");
const MERGE_SCRIPT = path.join(__dirname, "merge.mjs");
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function log(msg) {
  const ts = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
  console.log(`[${ts}] ${msg}`);
}

async function run() {
  log("เริ่มต้นตรวจสอบข่าวงบการเงินจาก SET...");

  if (!fs.existsSync(CHROME_PATH)) {
    throw new Error(`ไม่พบ Google Chrome ที่พาธ: ${CHROME_PATH}`);
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1280,800"
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36");

    log("กำลังเปิดหน้าข่าว SET (https://www.set.or.th/th/market/news-and-alert/news)...");
    const resp = await page.goto("https://www.set.or.th/th/market/news-and-alert/news", {
      waitUntil: "networkidle2",
      timeout: 35000
    });

    if (!resp || resp.status() >= 400) {
      throw new Error(`เปิดหน้าข่าว SET ไม่สำเร็จ HTTP Status: ${resp ? resp.status() : "no response"}`);
    }

    log("หน้าเว็บโหลดสำเร็จ กำลังดึงรายการข่าว 5 วันย้อนหลัง...");

    const scrapedData = await page.evaluate(async () => {
      const pad = n => String(n).padStart(2, "0");
      const now = new Date();
      const past = new Date(Date.now() - 5 * 864e5);

      const toDate = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
      const fromDate = `${pad(past.getDate())}/${pad(past.getMonth() + 1)}/${past.getFullYear()}`;

      // ดึงหน้าแรกเพื่อทราบจำนวนทั้งหมด (ใช้ perPage=20 ตามมาตรฐานเว็บ SET)
      const firstUrl = `/api/set/news/search?fromDate=${fromDate}&toDate=${toDate}&page=1&perPage=20&lang=th`;
      const firstResp = await fetch(firstUrl);
      if (!firstResp.ok) throw new Error("ไม่สามารถเรียก API ค้นหาข่าวของ SET ได้");
      const firstJson = await firstResp.json();
      const totalCount = firstJson.totalCount || 0;
      let allNews = firstJson.newsInfoList || [];

      // ดึงหน้าถัดไปแบบ concurrent (จำกัดสูงสุด 35 หน้า = 700 รายการ)
      const totalPages = Math.min(Math.ceil(totalCount / 20), 35);
      if (totalPages > 1) {
        const pagePromises = [];
        for (let p = 2; p <= totalPages; p++) {
          const u = `/api/set/news/search?fromDate=${fromDate}&toDate=${toDate}&page=${p}&perPage=20&lang=th`;
          pagePromises.push(fetch(u).then(r => r.ok ? r.json() : { newsInfoList: [] }));
        }
        const restResults = await Promise.all(pagePromises);
        for (const res of restResults) {
          if (res && res.newsInfoList) allNews = allNews.concat(res.newsInfoList);
        }
      }

      // กรองเฉพาะข่าวงบการเงินที่ไม่ใช่ประกาศเตือนของตลาด/ก.ล.ต.
      const ignoreSources = new Set(["SET", "SEC", "MAI"]);
      const filedList = allNews.filter(n => {
        const h = String(n.headline || "");
        const s = String(n.symbol || "").trim().toUpperCase();
        const src = String(n.source || "").trim().toUpperCase();
        if (ignoreSources.has(src) || ignoreSources.has(s)) return false;
        if (!h.includes("งบการเงิน")) return false;
        // ไม่เอาข่าวเตือนขึ้นเครื่องหมาย
        if (/ขึ้นเครื่องหมาย|CS|SP|ก\.ล\.ต\./.test(h)) return false;
        return true;
      });

      // กรองข่าว F45 สำหรับดึงตัวเลขงบ
      const f45List = allNews.filter(n => {
        const h = String(n.headline || "");
        return h.includes("F45");
      });

      // ดึงเนื้อหา F45 ของแต่ละหุ้นที่มีข่าว
      const results = [];
      for (const item of filedList) {
        const sym = String(item.symbol || "").trim().toUpperCase();
        const matchingF45 = f45List.find(f => String(f.symbol || "").trim().toUpperCase() === sym);
        let f45Pre = null;
        if (matchingF45 && matchingF45.url) {
          try {
            const fResp = await fetch(matchingF45.url);
            if (fResp.ok) {
              const html = await fResp.text();
              const m = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
              if (m) f45Pre = m[1];
            }
          } catch (e) {}
        }

        results.push({
          symbol: sym,
          datetime: item.datetime,
          headline: item.headline,
          f45Headline: matchingF45 ? matchingF45.headline : null,
          f45Pre
        });
      }

      return { totalNewsCount: allNews.length, filedCount: filedList.length, results };
    });

    log(`พบข่าวทั้งหมด ${scrapedData.totalNewsCount} รายการ, เป็นข่าวงบการเงิน ${scrapedData.filedCount} รายการ`);

    const rawList = [];
    let parsedWithNumbers = 0;
    let fallbackCount = 0;

    for (const r of scrapedData.results) {
      const item = {
        symbol: r.symbol,
        datetime: r.datetime,
        headline: r.headline
      };

      // พยายามแกะตัวเลขจาก F45 (แนวทาง 2)
      if (r.f45Pre) {
        try {
          const parsed = parseF45(r.f45Pre);
          if (parsed && typeof parsed.niY === "number") {
            item.niY = parsed.niY;
            if (typeof parsed.eps === "number") item.eps = parsed.eps;
            if (typeof parsed.npCurrent === "number") item.npCurrent = parsed.npCurrent;
            if (typeof parsed.npPrior === "number") item.npPrior = parsed.npPrior;
            parsedWithNumbers++;
          } else {
            fallbackCount++;
          }
        } catch (e) {
          fallbackCount++;
        }
      } else {
        fallbackCount++;
      }

      rawList.push(item);
    }

    log(`ประมวลผลเสร็จสิ้น: มีตัวเลขงบกำไร (แนวทาง 2) = ${parsedWithNumbers} ตัว · ไม่มีตัวเลข/ใช้ชื่อยื่นแล้ว (แนวทาง 1) = ${fallbackCount} ตัว`);

    // บันทึกไฟล์ raw.json
    fs.writeFileSync(RAW_FILE, JSON.stringify(rawList, null, 2), "utf8");
    log(`บันทึก ${RAW_FILE} เรียบร้อยแล้ว`);

    // รัน merge.mjs เพื่ออัปเดต rsdash/set_filed_th.json
    log("กำลังรวมข้อมูลเข้า rsdash/set_filed_th.json ด้วย merge.mjs...");
    const mergeOutput = execSync(`node "${MERGE_SCRIPT}"`, { encoding: "utf8" });
    log(`ผลลัพธ์ merge.mjs: ${mergeOutput.trim()}`);

    log("✓ เสร็จสิ้นกระบวนการทั้งหมดเรียบร้อย");
  } catch (err) {
    log(`✗ เกิดข้อผิดพลาด: ${err.message}`);
    throw err;
  } finally {
    await browser.close();
    log("ปิด Chrome เรียบร้อย");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
