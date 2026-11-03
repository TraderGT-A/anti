// จับ industry → Theme ของเรา (สำเนาจาก MEGATREND ใน index.html — แก้ที่นั่นแล้วต้องอัปเดตไฟล์นี้ด้วย: สร้างใหม่ด้วยสคริปต์ใน HANDOFF)
export const MEGATREND = {
  // ——— AI / เทค ———
  "Semiconductors":"ชิป / เซมิคอนดักเตอร์","Semiconductor Equipment":"เครื่องผลิตชิป","Electronic Production Equipment":"อุปกรณ์อิเล็กทรอนิกส์",
  "Electronic Equipment/Instruments":"เครื่องมืออิเล็กทรอนิกส์","Computer Peripherals":"AI ฮาร์ดแวร์ / อุปกรณ์ต่อพ่วง",
  "Computer Processing Hardware":"CPU / GPU","Computer Communications":"เครือข่าย","Telecommunications Equipment":"อุปกรณ์โทรคมนาคม",
  "Software":"ซอฟต์แวร์ / AI","Packaged Software":"ซอฟต์แวร์ / AI","Internet Software/Services":"อินเทอร์เน็ต / AI","Information Technology Services":"บริการไอที",
  "Semiconductors.1":"ชิป / เซมิคอนดักเตอร์","Semiconductor":"ชิป / เซมิคอนดักเตอร์","Electronic Components":"ชิ้นส่วนอิเล็กทรอนิกส์",
  // ——— Data Center / โลกกายภาพ ———
  "Data Center":"ดาต้าเซ็นเตอร์","Data Centers":"ดาต้าเซ็นเตอร์","Cooling Systems":"ระบบทำความเย็น DC","Cable/Satellite TV":"สื่อ / บันเทิง",
  "Electronics Distributors":"จัดจำหน่ายอิเล็กทรอนิกส์","Air Freight/Couriers":"โลจิสติกส์","Aerospace & Defense":"การบิน / ป้องกันประเทศ",
  "Aerospace & Defense.1":"การบิน / ป้องกันประเทศ","Railroads":"รถไฟ","Trucking":"ขนส่งทางบก","Marine Shipping":"ขนส่งทางเรือ",
  "Other Transportation":"ขนส่งอื่นๆ","Airlines":"สายการบิน","Industrial Machinery":"เครื่องจักรอุตสาหกรรม","Construction Machinery/Heavy Trucks":"เครื่องจักรก่อสร้าง",
  "Robotics":"หุ่นยนต์","Electronic Technology":"เทค / อิเล็กทรอนิกส์",
  // ——— พลังงาน / ไฟฟ้า ———
  "Electric Utilities":"ไฟฟ้า / สาธารณูปโภค","Alternative Power Generation":"พลังงานสะอาด","Water Utilities":"ประปา / น้ำ",
  "Gas Distributors":"ก๊าซธรรมชาติ","Integrated Oil":"น้ำมันครบวงจร","Oil & Gas Production":"น้ำมัน / ก๊าซ ต้นน้ำ","Oilfield Services/Equipment":"บริการน้ำมัน",
  "Coal":"ถ่านหิน","Power":"ไฟฟ้า / พลังงาน","Nuclear":"นิวเคลียร์","Energy":"พลังงาน","Renewable Energy":"พลังงานสะอาด",
  // ——— ทรัพยากร / วัสดุ ———
  "Copper":"ทองแดง","Gold":"ทองคำ","Precious Metals":"โลหะมีค่า","Aluminum":"อะลูมิเนียม","Steel":"เหล็ก",
  "Metal Fabrications":"โลหะ","Building Materials":"วัสดุก่อสร้าง","Chemicals: Specialty":"เคมีเฉพาะทาง","Chemicals: Major Diversified":"เคมี",
  "Paper/Pulp":"กระดาษ / เยื่อ","Forest Products":"ไม้ / ป่าไม้","Textiles":"สิ่งทอ","Other Metals/Minerals":"เหมือง / แร่",
  "Critical Materials":"วัสดุวิกฤต","Rare Earth":"แร่หายาก","Lithium":"ลิเธียม",
  // ——— ดูแลสุขภาพ ———
  "Biotechnology":"ไบโอเทค","Pharmaceuticals: Major":"ยา (รายใหญ่)","Pharmaceuticals: Other":"ยา","Medical Specialties":"เครื่องมือแพทย์",
  "Medical Instruments":"เครื่องมือแพทย์","Medical Distributors":"จัดจำหน่ายการแพทย์","Healthcare Facilities":"สถานพยาบาล","Healthcare":"สาธารณสุข / การแพทย์",
  "Medical/Nursing Services":"บริการการแพทย์","Health Technology":"เทคโนโลยีสุขภาพ",
  // ——— การเงิน → Fintech/Bank ——
  "Major Banks":"ธนาคารใหญ่","Regional Banks":"ธนาคารภูมิภาค","Finance/Rental/Leasing":"การเงิน / เช่าซื้อ",
  "Investment Banks/Brokers":"วาณิชธนกิจ / โบรกเกอร์","Financial Conglomerates":"กลุ่มการเงิน","Savings Banks":"ธนาคารออมสิน","Banks":"ธนาคาร",
  "Insurance Brokers/Services":"นายหน้าประกัน","Property/Casualty Insurance":"ประกันวินาศภัย","Life/Health Insurance":"ประกันชีวิต",
  "FinTech":"ฟินเทค","Consumer Finance":"สินเชื่อรายย่อย","Financial Services":"บริการการเงิน", "Specialty Finance":"การเงินเฉพาะทาง",
  // ——— Consumer / Retail ———
  "Hotels/Resorts/Cruise Lines":"ท่องเที่ยว / รีสอร์ท","Movies/Entertainment":"บันเทิง / สื่อ","Broadcasting":"สื่อ / โฆษณา",
  "Advertising/Marketing Services":"โฆษณา / การตลาด","Department Stores":"ห้างสรรพสินค้า","Specialty Stores":"ค้าปลีกเฉพาะทาง",
  "Food: Meat/Fish/Dairy":"อาหาร (เนื้อ / ปลา / นม)","Food: Major Diversified":"อาหาร / CPG","Beverages: Non-Alcoholic":"เครื่องดื่ม",
  "Leisure Products":"ไลฟ์สไตล์ / สันทนาการ","Recreational Products":"สินค้าสันทนาการ","Consumer Electronics":"เครื่องใช้ไฟฟ้า",
  "Appliances":"เครื่องใช้ในบ้าน","Household/Personal Care":"ของใช้ส่วนตัว / CPG","Tobacco":"ยาสูบ","Apparel/Footwear":"เครื่องแต่งกาย",
  "Footwear":"รองเท้า","Home Improvement Chains":"ปรับปรุงบ้าน","Home Furnishings":"เฟอร์นิเจอร์","Wholesale Distributors":"ค้าส่ง",
  "Food Distributors":"จัดจำหน่ายอาหาร","Internet Retail":"ขายออนไลน์ / อีคอมเมิร์ซ","Retail - Apparel/Shoes":"ค้าปลีกเครื่องแต่งกาย",
  "Retail - Catalog/Specialty":"ค้าปลีกเฉพาะทาง","Retail - Discount":"ค้าปลีกดิสเคาน์","Food Retail":"ค้าปลีกอาหาร",
  "Motor Vehicles":"ยานยนต์ / EV","Auto Parts: OEM":"ชิ้นส่วนยานยนต์","Automotive Aftermarket":"หลังการขายยานยนต์",
  "Consumer Durables":"สินค้าคงทน","Consumer Non-Durables":"สินค้าอุปโภค","Apparel/Footwear Retail":"ค้าปลีกเครื่องแต่งกาย",
  "Miscellaneous Manufacturing":"การผลิตเบ็ดเตล็ด","Miscellaneous":"เบ็ดเตล็ด","Industrial Specialties":"อุตสาหกรรมเฉพาะ",
  "Engineering & Construction":"ก่อสร้าง / โครงสร้างพื้นฐาน","Homebuilding":"ที่อยู่อาศัย","Heavy Construction":"งานก่อสร้างใหญ่",
  "Commercial Services/Supplies":"บริการ / วัสดุพาณิชย์","Business Services":"บริการธุรกิจ","Rental & Leasing":"เช่า / ลีสซิ่ง",
  "Real Estate Development":"อสังหาฯ / พัฒนาที่ดิน","Real Estate Investment Trusts":"REIT","Real Estate Management/Services":"บริการอสังหาฯ",
  "Oil Refining/Marketing":"โรงกลั่น / จำหน่ายน้ำมัน","Integrated Oil & Gas":"น้ำมัน - ก๊าซครบวงจร","Food Processing":"แปรรูปอาหาร",
  "Sugar/Confectionery":"น้ำตาล / ขนม","Fishing":"ประมง","Agriculture":"เกษตร","Transportation":"ขนส่ง / โลจิสติกส์",
  "Personal Products":"สินค้าส่วนตัว","Containers/Packaging":"บรรจุภัณฑ์","Shipbuilding":"ต่อเรือ","Metal Processing":"แปรรูปโลหะ",
  "Professional Services":"บริการมืออาชีพ","Education":"การศึกษา","IT Consulting":"ที่ปรึกษาไอที","Security Services":"รักษาความปลอดภัย",
  "Packaged Software.1":"ซอฟต์แวร์ / AI","Software.1":"ซอฟต์แวร์ / AI",
};;
const KEYS = Object.keys(MEGATREND).map((k) => [k.toLowerCase(), MEGATREND[k]]);
export function themeOf(industry) {
  const i = String(industry || "");
  if (!i) return null;
  if (MEGATREND[i]) return MEGATREND[i];
  const l = i.toLowerCase();
  const f = KEYS.find(([k]) => l.includes(k));
  return f ? f[1] : null;
}
// ชื่อกลุ่มที่แสดงในหน้าเว็บ (เหมือน themeDisplay ใน index.html): Theme ของเรา → ชื่อไทยของ industry (ในวงเล็บ) → ชื่ออังกฤษ
const TH_INDUSTRY = {
  "Computer Peripherals":"คอมพิวเตอร์ต่อพ่วง","Electrical Products":"ผลิตภัณฑ์ไฟฟ้า","Oil Refining/Marketing":"โรงกลั่น/การตลาดน้ำมัน",
  "Computer Processing Hardware":"ฮาร์ดแวร์ประมวลผล","Hotels/Resorts/Cruise Lines":"โรงแรม/รีสอร์ท/เรือสำราญ",
  "Medical/Nursing Services":"การแพทย์/พยาบาล","Personnel Services":"จัดหางาน/บุคคลากร","Semiconductors":"เซมิคอนดักเตอร์",
  "Electronic Production Equipment":"อุปกรณ์ผลิตอิเล็กทรอนิกส์","Electronic Components":"ชิ้นส่วนอิเล็กทรอนิกส์",
  "Semiconductor Equipment":"อุปกรณ์เซมิคอนดักเตอร์","Automotive Aftermarket":"หลังการขายยานยนต์","Aerospace & Defense":"การบิน/ป้องกันประเทศ",
  "Aerospace & Defense.1":"การบิน/ป้องกันประเทศ","Software":"ซอฟต์แวร์","Packaged Software":"ซอฟต์แวร์",
  "Internet Software/Services":"ซอฟต์แวร์/บริการอินเทอร์เน็ต","Information Technology Services":"บริการเทคโนโลยีสารสนเทศ",
  "Computer Communications":"การสื่อสารคอมพิวเตอร์","Telecommunications Equipment":"อุปกรณ์โทรคมนาคม","Wireless Telecommunications":"โทรคมนาคมไร้สาย",
  "Major Banks":"ธนาคารใหญ่","Regional Banks":"ธนาคารภูมิภาค","Finance/Rental/Leasing":"การเงิน/เช่าซื้อ/ลีสซิ่ง",
  "Investment Banks/Brokers":"ธนาคารลงทุน/โบรกเกอร์","Financial Conglomerates":"กลุ่มธุรกิจการเงิน","Insurance Brokers/Services":"นายหน้าประกันภัย",
  "Property/Casualty Insurance":"ประกันวินาศภัย","Life/Health Insurance":"ประกันชีวิต/สุขภาพ","Real Estate Development":"พัฒนาอสังหาริมทรัพย์",
  "Real Estate Investment Trusts":"กองทรัสต์อสังหาฯ","Specialty Stores":"ร้านค้าเฉพาะทาง","Department Stores":"ห้างสรรพสินค้า",
  "Food: Meat/Fish/Dairy":"อาหาร: เนื้อ/ปลา/นม","Food: Major Diversified":"อาหาร: หลากหลาย","Beverages: Non-Alcoholic":"เครื่องดื่มไม่มีแอลกอฮอล์",
  "Movies/Entertainment":"ภาพยนตร์/บันเทิง","Broadcasting":"กระจายเสียง","Cable/Satellite TV":"เคเบิล/ดาวเทียม",
  "Advertising/Marketing Services":"โฆษณา/การตลาด","Alternative Power Generation":"พลังงานทางเลือก","Electric Utilities":"สาธารณูปโภคไฟฟ้า",
  "Water Utilities":"ประปา","Gas Distributors":"จัดจำหน่ายก๊าซ","Integrated Oil":"น้ำมันแบบครบวงจร",
  "Oil & Gas Production":"ผลิตน้ำมัน/ก๊าซ","Oilfield Services/Equipment":"บริการ/อุปกรณ์น้ำมัน","Marine Shipping":"ขนส่งทางเรือ",
  "Other Transportation":"ขนส่งอื่นๆ","Railroads":"รถไฟ","Airlines":"สายการบิน","Trucking":"ขนส่งทางรถบรรทุก",
  "Chemicals: Specialty":"เคมีเฉพาะทาง","Chemicals: Major Diversified":"เคมีหลากหลาย","Pharmaceuticals: Major":"ยา: กลุ่มใหญ่",
  "Pharmaceuticals: Other":"ยา: อื่นๆ","Biotechnology":"ไบโอเทค","Medical Specialties":"เครื่องมือแพทย์เฉพาะทาง",
  "Medical Instruments":"เครื่องมือแพทย์","Medical Distributors":"จัดจำหน่ายการแพทย์","Healthcare Facilities":"สถานพยาบาล",
  "Industrial Specialties":"อุตสาหกรรมเฉพาะทาง","Industrial Machinery":"เครื่องจักรอุตสาหกรรม","Construction Machinery/Heavy Trucks":"เครื่องจักรก่อสร้าง/รถบรรทุกหนัก",
  "Engineering & Construction":"วิศวกรรม/ก่อสร้าง","Metal Fabrications":"ผลิตภัณฑ์โลหะ","Steel":"เหล็ก","Aluminum":"อะลูมิเนียม",
  "Precious Metals":"โลหะมีค่า","Gold":"ทอง","Building Materials":"วัสดุก่อสร้าง","Paper/Pulp":"กระดาษ/เยื่อกระดาษ",
  "Textiles":"สิ่งทอ","Apparel/Footwear":"เครื่องนุ่งห่ม/รองเท้า","Footwear":"รองเท้า","Miscellaneous Manufacturing":"การผลิตเบ็ดเตล็ด",
  "Miscellaneous":"เบ็ดเตล็ด","Motor Vehicles":"ยานยนต์","Auto Parts: OEM":"ชิ้นส่วนยานยนต์ OEM",
  "Consumer Electronics":"เครื่องใช้ไฟฟ้าอิเล็กทรอนิกส์","Appliances":"เครื่องใช้ในบ้าน","Household/Personal Care":"ของใช้ในครัวเรือน/ส่วนตัว",
  "Tobacco":"ยาสูบ","Leisure Products":"สินค้าไลฟ์สไตล์/สันทนาการ","Recreational Products":"สินค้าสันทนาการ",
  "Home Improvement Chains":"ห่วงโซ่ปรับปรุงบ้าน","Home Furnishings":"เฟอร์นิเจอร์บ้าน","Wholesale Distributors":"จัดจำหน่ายแบบส่ง",
  "Food Distributors":"จัดจำหน่ายอาหาร","Computer Processing Hardware.1":"ฮาร์ดแวร์ประมวลผล",
  "Savings Banks":"ธนาคารออมสิน","Real Estate Development.1":"พัฒนาอสังหาริมทรัพย์","Forest Products":"ผลิตภัณฑ์ป่าไม้",
  "Coal":"ถ่านหิน","Copper":"ทองแดง","Other Metals/Minerals":"โลหะ/แร่อื่นๆ","Electronic Equipment/Instruments":"อุปกรณ์อิเล็กทรอนิกส์/เครื่องมือ",
  "Process Industries":"อุตสาหกรรมกระบวนการ","Retail - Apparel/Shoes":"ค้าปลีกเครื่องนุ่งห่ม/รองเท้า","Retail - Catalog/Specialty":"ค้าปลีกเฉพาะทาง",
  "Retail - Discount":"ค้าปลีกดิสเคาน์","Internet Retail":"ค้าปลีกออนไลน์","Food Retail":"ค้าปลีกอาหาร",
  "Regional Banks.1":"ธนาคารภูมิภาค","Commercial Services/Supplies":"บริการ/วัสดุพาณิชย์",
};;
const TH_KEYS = Object.keys(TH_INDUSTRY).map((k) => [k.toLowerCase(), TH_INDUSTRY[k]]);
export function themeLabel(industry) {
  const m = themeOf(industry);
  if (m) return m;
  const i = String(industry || "");
  if (!i) return null;
  const x = TH_INDUSTRY[i] || (TH_KEYS.find(([k]) => i.toLowerCase().includes(k)) || [])[1];
  return x ? `(${x})` : i;
}
