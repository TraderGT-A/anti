/**
 * แยกตัวเลขกำไรสุทธิและ EPS จากข้อความในแท็ก <pre> ของแบบสรุปผลการดำเนินงาน (F45)
 */
export function parseF45(preText) {
  if (!preText || typeof preText !== "string") return null;

  // ตัดแท็ก HTML ออกถ้ามี
  const text = preText.replace(/<[^>]+>/g, " ");
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let netProfitLine = "";
  let epsLine = "";

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];

    // บรรทัดกำไรสุทธิ: มีคำว่า "กำไร (ขาดทุน)" แต่ไม่มี "ต่อหุ้น"
    if (l.includes("กำไร (ขาดทุน)") && !l.includes("ต่อหุ้น") && !netProfitLine) {
      let combined = l;
      let j = i + 1;
      while (j < lines.length && !lines[j].includes("กำไร") && !lines[j].includes("ต่อหุ้น") && !lines[j].includes("ประเภทรายงาน")) {
        combined += " " + lines[j];
        j++;
      }
      netProfitLine = combined;
    }

    // บรรทัด EPS: มีคำว่า "ต่อหุ้น"
    if ((l.includes("ต่อหุ้น") || l.includes("สุทธิต่อหุ้น")) && !epsLine) {
      let combined = l;
      let j = i + 1;
      // บางแบบฟอร์ม ตัวเลขอยู่บรรทัดถัดไป หรือบรรทัดก่อนหน้า
      let prev = (i > 0 && /\d/.test(lines[i - 1])) ? lines[i - 1] : "";
      let next = (i + 1 < lines.length && /\d/.test(lines[i + 1])) ? lines[i + 1] : "";
      epsLine = `${prev} ${l} ${next}`.trim();
    }
  }

  function extractNumbers(str) {
    if (!str) return [];
    // จับตัวเลขที่มีจุลภาค เช่น 6,670,089 หรือในวงเล็บ (1,572,898) หรือทศนิยม 0.19
    const matches = str.match(/(?:\(?\s*[-+]?\d[\d,]*\.?\d*\s*\)?)/g) || [];
    return matches.map(m => {
      let s = m.trim();
      let neg = false;
      if (s.startsWith("(") && s.endsWith(")")) {
        neg = true;
        s = s.slice(1, -1);
      }
      s = s.replace(/,/g, "").trim();
      const n = parseFloat(s);
      return isNaN(n) ? null : (neg ? -n : n);
    }).filter(n => n !== null);
  }

  const npNums = extractNumbers(netProfitLine);
  const epsNums = extractNumbers(epsLine);

  let npCurrent = null, npPrior = null, niY = null, eps = null, epsPrior = null;

  if (npNums.length >= 2) {
    npCurrent = npNums[0];
    npPrior = npNums[1];
    if (npPrior !== 0) {
      niY = Number(((npCurrent - npPrior) / Math.abs(npPrior) * 100).toFixed(2));
    }
  }

  if (epsNums.length >= 2) {
    eps = epsNums[0];
    epsPrior = epsNums[1];
  } else if (epsNums.length === 1) {
    eps = epsNums[0];
  }

  if (npCurrent === null && niY === null) return null;

  return { npCurrent, npPrior, niY, eps, epsPrior };
}
