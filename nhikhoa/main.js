// ===============================
//  AUTO AGE (DOB) + Z-SCORE CHECK
// ===============================
const ngaysinhInput = document.getElementById('ngaysinh');
const tuoiSpan = document.getElementById('tuoi');

let AGE_INFO = { years: null, months: null, totalMonths: null, display: "-" };

function getNowInHoChiMinh() {
  // "Bây giờ" theo múi giờ Asia/Ho_Chi_Minh
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());

    const y = parseInt(parts.find(p => p.type === 'year')?.value || "0", 10);
    const m = parseInt(parts.find(p => p.type === 'month')?.value || "1", 10);
    const d = parseInt(parts.find(p => p.type === 'day')?.value || "1", 10);

    // dùng trưa để tránh DST/biên ngày (VN không DST nhưng cứ an toàn)
    return new Date(y, m - 1, d, 12, 0, 0);
  } catch (_) {
    return new Date(); // fallback theo máy
  }
}

function calcAgeFromDob(dob) {
  const now = getNowInHoChiMinh();
  if (!(dob instanceof Date) || isNaN(dob.getTime())) return null;

  let years = now.getFullYear() - dob.getFullYear();
  let months = now.getMonth() - dob.getMonth();
  let days = now.getDate() - dob.getDate();

  // nếu chưa tới ngày sinh trong tháng hiện tại -> trừ 1 tháng
  if (days < 0) months -= 1;

  // chuẩn hóa months
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0 || years > 200) return null;

  const display = (months && months !== 0) ? `${years} tuổi ${months} tháng` : `${years} tuổi`;
  const totalMonths = years * 12 + months;

  return { years, months, totalMonths, display };
}

function updateAgeUI() {
  const raw = (ngaysinhInput?.value || "").trim(); // input type=date => yyyy-mm-dd
  let dob = null;

  if (raw) {
    // parse yyyy-mm-dd
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10);
      const d = parseInt(m[3], 10);
      dob = new Date(y, mo - 1, d, 12, 0, 0);
    }
  }

  const info = dob ? calcAgeFromDob(dob) : null;
  if (info) {
    AGE_INFO = info;
    if (tuoiSpan) tuoiSpan.textContent = info.display;
  } else {
    AGE_INFO = { years: null, months: null, totalMonths: null, display: "-" };
    if (tuoiSpan) tuoiSpan.textContent = "-";
  }
  updateTomtat();
  scheduleGrowthCheck();
}

ngaysinhInput?.addEventListener('input', updateAgeUI);

// ===============================
//  AI CHECK: W/A, H/A, W/H (Z-score)
// ===============================
const waSpan = document.getElementById('wa');
const haSpan = document.getElementById('ha');
const whSpan = document.getElementById('wh');
const zscoreWrap = document.getElementById('zscoreWrap');
const zscoreStatus = document.getElementById('zscoreStatus');

let growthDebounce = 0;

function scheduleGrowthCheck() {
  clearTimeout(growthDebounce);
  growthDebounce = setTimeout(runGrowthCheck, 450);
}

function showZscoreSection(show) {
  if (!zscoreWrap) return;
  zscoreWrap.style.display = show ? "inline" : "none";
}

function setZscoreStatus(text) {
  if (!zscoreStatus) return;
  zscoreStatus.textContent = text ? `${text} ` : "";
}

function formatZ(z, label) {
  // z có thể là số hoặc chuỗi (AI trả về)
  let num = null;
  if (typeof z === "number" && isFinite(z)) num = z;
  if (num === null && typeof z === "string") {
    const m = z.match(/-?\d+(?:\.\d+)?/);
    if (m) num = parseFloat(m[0]);
  }
  if (num === null || !isFinite(num)) return "-";
  if (num >= -2 && num <= 2) return `-2SD<${label}<2SD`;
  if (num < -2) return `${label}<-2SD`;
  return `${label}>2SD`;
}

function setGrowthUI(wa, ha, wh) {
  if (waSpan) waSpan.textContent = wa ?? "-";
  if (haSpan) haSpan.textContent = ha ?? "-";
  if (whSpan) whSpan.textContent = wh ?? "-";
}

async function runGrowthCheck() {
  const h = parseFloat(document.getElementById('chieucao')?.value);
  const w = parseFloat(document.getElementById('cannang')?.value);

  const hasAge = (AGE_INFO?.totalMonths || AGE_INFO?.totalMonths === 0);
  const hasHW = !(isNaN(h) || isNaN(w) || h <= 0 || w <= 0);

  // Chỉ hiện "Đánh giá Z-score:" khi nhập đủ dữ liệu (ngày sinh + chiều cao + cân nặng)
  if (!hasAge || !hasHW) {
    showZscoreSection(false);
    setZscoreStatus("");
    setGrowthUI("-", "-", "-");
    return;
  }

  showZscoreSection(true);
  setZscoreStatus("Đang tính toán");
  // clear tạm để tránh hiểu nhầm là kết quả cũ
  setGrowthUI("", "", "");

  const gender = (document.getElementById('gioitinh')?.value || "").trim();
  const payload = {
    height_cm: h,
    weight_kg: w,
    age_years: AGE_INFO.years,
    age_months: AGE_INFO.months,
    age_total_months: AGE_INFO.totalMonths,
    gender
  };

  const system = `
Bạn là trợ lý y khoa. Nhiệm vụ: đánh giá 3 chỉ số Z-score theo WHO (hoặc chuẩn nhi khoa phổ biến):
1) weight_for_age (cân nặng theo tuổi)
2) height_for_age (chiều cao theo tuổi)
3) weight_for_height (cân nặng theo chiều cao)

Đầu vào là JSON. Bạn phải trả về DUY NHẤT 1 JSON hợp lệ (không giải thích), dạng:
{
  "weight_for_age": "<kết quả>",
  "height_for_age": "<kết quả>",
  "weight_for_height": "<kết quả>"
}

Yêu cầu trả kết quả:
- Trả về DUY NHẤT 1 JSON hợp lệ (không giải thích).
- Mỗi giá trị là Z-score dạng số (number), ví dụ -1.3.
`.trim();

  try {
        const response = await fetch("https://lolambenhan.onrender.com/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(payload) }
        ]
      })
    });

    // đọc text trước để tránh lỗi parse JSON nếu server trả HTML
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${raw.slice(0, 200)}`);
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch (_) {
      throw new Error(`Server không trả JSON. Nhận: ${raw.slice(0, 200)}`);
    }

    // Render chat API trả { answer: "..." }
    const text = (data && typeof data.answer === "string") ? data.answer : "";

    // cố gắng parse JSON từ AI
    let obj = null;
    try {
      obj = JSON.parse(text);
    } catch (_) {
      // thử cắt JSON trong trường hợp AI bọc thêm chữ
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        try { obj = JSON.parse(m[0]); } catch (_) {}
      }
    }

    if (obj && typeof obj === "object") {
      setZscoreStatus("");
      setGrowthUI(
        formatZ(obj.weight_for_age, "CN/T"),
        formatZ(obj.height_for_age, "CC/T"),
        formatZ(obj.weight_for_height, "CN/CC")
      );
    } else {
      setZscoreStatus("");
      // fallback: nếu AI trả thô, cố gắng parse số từ text và vẫn format
      setGrowthUI(
        formatZ(text, "CN/T"),
        formatZ(text, "CC/T"),
        formatZ(text, "CN/CC")
      );
    }
  } catch (err) {
    setZscoreStatus("");
    setGrowthUI("Lỗi", "Lỗi", "Lỗi");
    console.error(err);
  }
}

document.getElementById('chieucao')?.addEventListener('input', scheduleGrowthCheck);
document.getElementById('cannang')?.addEventListener('input', scheduleGrowthCheck);
document.getElementById('gioitinh')?.addEventListener('input', scheduleGrowthCheck);
// ===============================
//  DROPDOWN AUTOFILL
// ===============================
// Map select -> textarea (các mục chọn mẫu đổ vào textarea)
const __SELECT_TO_TEXTAREA__ = {
  timmachSelect: "timmach",
  hohapSelect: "hopho",
  TieuhoaSelect: "tieuhoa",
  thanSelect: "than",
  thankinhSelect: "thankinh",
  cokhopSelect: "cokhop",
};

function _setTextareaFromSelect(selectId, textareaId, opts = {}) {
  const select = document.getElementById(selectId);
  const textarea = document.getElementById(textareaId);
  if (!select || !textarea) return;
  if (!select.value) return;

  textarea.value = select.value;

  // Kích hoạt lại các logic phụ thuộc (tóm tắt/preview/z-score...)
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));

  // Nếu đang bật đồng bộ, lưu ngay để người khác thấy luôn
  if (!opts.silentSync && window.__SHARE_SYNC__?.enabled) {
    window.__SHARE_SYNC__.saveFieldNow(textareaId, textarea.value);
  }
}

function insertTimmach() { _setTextareaFromSelect("timmachSelect", "timmach"); }
function insertHohap()   { _setTextareaFromSelect("hohapSelect",   "hopho"); }
function insertTieuhoa() { _setTextareaFromSelect("TieuhoaSelect", "tieuhoa"); }
function insertthan()    { _setTextareaFromSelect("thanSelect",    "than"); }
function insertthankinh(){ _setTextareaFromSelect("thankinhSelect","thankinh"); }
function insertcokhop()  { _setTextareaFromSelect("cokhopSelect",  "cokhop"); }


// ===============================
//  AUTO SUMMARY
// ===============================
function updateTomtat() {
  const gtRaw = (document.getElementById("gioitinh")?.value || "").trim();
  const gioitinh = gtRaw ? gtRaw.toLowerCase() : "--"; // nam/nữ
  const tuoi = (document.getElementById("tuoi")?.textContent || "-").trim();
  const tuoiText = (tuoi && tuoi !== "-" && tuoi !== "--") ? tuoi : "--";
  const lydo = (document.getElementById("lydo")?.value || "").trim();
  const lydoText = lydo ? lydo : "--";

  const text = (() => {
    const parts = [];
    // Giới tính
    parts.push(`Bệnh nhi ${gioitinh}`.trim());
    // Tuổi (nếu có)
    if (tuoiText && tuoiText !== "-" && tuoiText !== "--") parts.push(tuoiText);
    let head = parts.join(" ");
    // Lý do vào viện
    if (lydoText && lydoText !== "-" && lydoText !== "--") {
      head += `, vào viện vì lý do ${lydoText}.`;
    } else {
      head += `.`;
    }
    return `${head} Qua hỏi bệnh, khám bệnh ghi nhận:`;
  })();
  const el = document.getElementById("tomtat");
  if (el) el.value = text;
}

["gioitinh", "lydo"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", updateTomtat);
});

// ===============================
//  HELPERS
// ===============================
function getField(id) {
  return (document.getElementById(id)?.value || "").trim();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function nl2br(s) {
  return escapeHtml(s).replace(/\n/g, '<br/>');
}

function formatNgayGio(val) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return escapeHtml(val);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${hh} giờ ${mm} phút, ngày ${dd}/${MM}/${yyyy}`;
}


function formatNgaySinh(val) {
  if (!val) return '';
  // input type="date" => yyyy-mm-dd
  const m = String(val).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  // fallback: cố gắng parse Date
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, '0');
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${MM}/${yyyy}`;
  }
  return escapeHtml(val);
}


// tách data ra riêng để dùng cho docx + preview
function getFormData() {
  return {
    hoten: getField('hoten'),
    gioitinh: getField('gioitinh'),
    ngaysinh: getField('ngaysinh'),
    tuoi: document.getElementById('tuoi')?.textContent || '-',
    dantoc: getField('dantoc'),
    hoten_bome: getField('hoten_bome'),
    nghenghiep: getField('nghenghiep'),
    diachi: getField('diachi'),
    ngaygio: getField('ngaygio'),
    lydo: getField('lydo'),
    benhsu: getField('benhsu'),
    tiensu: getField('tiensu'),
    mach: getField('mach'),
    nhietdo: getField('nhietdo'),
    ha_tren: getField('ha_tren'),
    ha_duoi: getField('ha_duoi'),
    nhiptho: getField('nhiptho'),
    chieucao: getField('chieucao'),
    cannang: getField('cannang'),
    wa: document.getElementById('wa')?.textContent || '-',
    ha: document.getElementById('ha')?.textContent || '-',
    wh: document.getElementById('wh')?.textContent || '-',
    tongtrang: getField('tongtrang'),
    timmach: getField('timmach'),
    hopho: getField('hopho'),
    tieuhoa: getField('tieuhoa'),
    than: getField('than'),
    thankinh: getField('thankinh'),
    cokhop: getField('cokhop'),
    coquankhac: getField('coquankhac'),
    tomtat: getField('tomtat'),
    chandoanso: getField('chandoanso'),
    chandoanpd: getField('chandoanpd'),
    cls_thuongquy: getField('cls_thuongquy'),
    cls_chuandoan: getField('cls_chuandoan'),
    ketqua: getField('ketqua'),
    chandoanxacdinh: getField('chandoanxacdinh'),
    huongdieutri: getField('huongdieutri'),
    dieutri: getField('dieutri'),
    tienluong: getField('tienluong'),
    bienluan: getField('bienluan')
  };
}

// ===============================
//  BUILD HTML (for Preview iframe)
// ===============================
function buildHTMLDoc() {
  const data = getFormData();
  const dateNow = new Date().toLocaleString('vi-VN');

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>BỆNH ÁN NHI KHOA - ${escapeHtml(data.hoten)}</title>
<style>
  @page { size: A4; margin: 2cm; }

  body {
    font-family: "Times New Roman", serif;
    font-size: 14pt;
    line-height: 1.5;
    padding: 2cm;       
    margin: 0;
    box-sizing: border-box;
  }

  p { margin: 0; }
  b { font-weight: 700; }
  .center { text-align: center; }

  /* =========================
     MOBILE PREVIEW OVERRIDE
     ========================= */
  @media (max-width: 768px) {
    body {
      padding: 1cm;     
    }
  }

  @media (max-width: 480px) {
    body {
      padding: 0.8cm;   
    }
  }
</style>
</head>
<body>
  <h1 class="center" style="margin:0 0 8px 0;font-size:20pt;"><b>BỆNH ÁN NHI KHOA</b></h1>
  <p><em>Ngày làm bệnh án: ${escapeHtml(dateNow)}</em></p>

  <p style="margin-top:12px;"><b>A. PHẦN HÀNH CHÁNH</b></p>
  <p><b>1. Họ và tên:</b> ${escapeHtml(data.hoten)}</p>
  <p><b>2. Giới tính:</b> ${escapeHtml(data.gioitinh)}</p>
  <p><b>3. Sinh ngày:</b> ${formatNgaySinh(data.ngaysinh)} <span>(${escapeHtml(data.tuoi)})</span></p>
  <p><b>4. Dân tộc:</b> ${escapeHtml(data.dantoc)}</p>
  <p><b>5. Họ tên bố/mẹ:</b> ${escapeHtml(data.hoten_bome)}</p>
  <p><b>6. Nghề nghiệp:</b> ${escapeHtml(data.nghenghiep)}</p>
  <p><b>7. Địa chỉ:</b> ${escapeHtml(data.diachi)}</p>
  <p><b>8. Ngày giờ vào viện:</b> ${formatNgayGio(data.ngaygio)}</p>

  <p style="margin-top:12px;"><b>B. PHẦN BỆNH ÁN</b></p>

  <p style="margin-top:6px;"><b>I. Hỏi bệnh</b></p>
  <p><b>1. Lý do vào viện:</b> ${nl2br(data.lydo)}</p>
  <p><b>2. Bệnh sử:</b><br/>${nl2br(data.benhsu)}</p>
  <p><b>3. Tiền sử:</b><br/>${nl2br(data.tiensu)}</p>

  <p style="margin-top:10px;"><b>II. Khám bệnh</b></p>
  <p><b>1. Toàn trạng:</b><br/>
    - Sinh hiệu: Mạch ${escapeHtml(data.mach)} lần/phút, nhiệt độ: ${escapeHtml(data.nhietdo)} °C,
      Huyết áp ${escapeHtml(data.ha_tren)}/${escapeHtml(data.ha_duoi)} mmHg, nhịp thở: ${escapeHtml(data.nhiptho)} lần/phút<br/>
    - Chiều cao: ${escapeHtml(data.chieucao)} cm, cân nặng: ${escapeHtml(data.cannang)} kg,
      Đánh giá Z-score: ${escapeHtml(data.wa)}; ${escapeHtml(data.ha)}; ${escapeHtml(data.wh)}<br/>
    ${nl2br(data.tongtrang)}
  </p>

  <p style="margin-top:6px;"><b>2. Khám cơ quan:</b></p>
  <p><b>a) Tuần hoàn:</b><br/>${nl2br(data.timmach)}</p>
  <p><b>b) Hô hấp:</b><br/>${nl2br(data.hopho)}</p>
  <p><b>c) Tiêu hoá:</b><br/>${nl2br(data.tieuhoa)}</p>
  <p><b>d) Thận - tiết niệu:</b><br/>${nl2br(data.than)}</p>
  <p><b>e) Thần kinh:</b><br/>${nl2br(data.thankinh)}</p>
  <p><b>f) Cơ - Xương - Khớp:</b><br/>${nl2br(data.cokhop)}</p>
  <p><b>g) Các cơ quan khác:</b> ${nl2br(data.coquankhac)}</p>

  <p style="margin-top:10px;"><b>III. Kết luận</b></p>
  <p><b>1. Tóm tắt bệnh án:</b><br/>${nl2br(data.tomtat)}</p>
  <p><b>2. Chẩn đoán sơ bộ:</b> ${nl2br(data.chandoanso)}</p>
  <p><b>3. Chẩn đoán phân biệt:</b><br/>${nl2br(data.chandoanpd)}</p>

  <p><b>4. Đề nghị cận lâm sàng và kết quả:</b></p>
  <p><b>a) Đề nghị cận lâm sàng:</b></p>
  <p>- Thường quy: ${nl2br(data.cls_thuongquy)}</p>
  <p>- Chẩn đoán: ${nl2br(data.cls_chuandoan)}</p>
  <p><b>b) Kết quả:</b><br/>${nl2br(data.ketqua)}</p>

  <p><b>5. Chẩn đoán xác định:</b><br/>${nl2br(data.chandoanxacdinh)}</p>

  <p><b>6. Điều trị:</b></p>
  <p><b>a) Hướng điều trị:</b><br/>${nl2br(data.huongdieutri)}</p>
  <p><b>b) Điều trị cụ thể:</b><br/>${nl2br(data.dieutri)}</p>

  <p><b>7. Tiên lượng:</b><br/>${nl2br(data.tienluong)}</p>

  <p style="margin-top:12px;"><b>C. PHẦN BIỆN LUẬN</b></p>
  <p>${nl2br(data.bienluan)}</p>
</body>
</html>
  `;
}

// ===============================
//  PREVIEW POPUP (iframe)
// ===============================
function openPreview() {
  const modal = document.getElementById('previewModal');
  const frame = document.getElementById('previewFrame');
  if (!modal || !frame) return;

  frame.srcdoc = buildHTMLDoc();
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
}

function closePreview() {
  const modal = document.getElementById('previewModal');
  if (!modal) return;
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
}

document.addEventListener('click', (e) => {
  const modal = document.getElementById('previewModal');
  if (!modal || !modal.classList.contains('show')) return;
  if (e.target === modal) closePreview();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePreview();
});

// ===============================
//  EXPORT DOCX (A4, 2cm margins, TNR 14, 1.5 line)
// ===============================
async function generateDocx() {
  const overlay = document.getElementById('loadingOverlay');

  try {
    if (overlay) overlay.style.display = 'flex';

    const data = getFormData();
    const dateNow = new Date().toLocaleString('vi-VN');

    // 2cm -> twips
    const MARGIN_2CM = 1134; // ~2cm
    const LINE_15 = 360;     // 1.5 lines (240 = 1.0)

    // Base font 14pt = 28 half-points
    const runBase = { font: "Times New Roman", size: 28 };
    const TITLE_SIZE = 40; // 20pt

    const basePara = {
      spacing: { line: LINE_15, lineRule: docx.LineRuleType.AUTO },
    };

    function para(text, opts = {}) {
      return new docx.Paragraph({
        ...basePara,
        ...opts,
        children: [
          new docx.TextRun({ text: text || "", bold: false, ...runBase, ...(opts.run || {}) }),
        ],
      });
    }

    // Dùng cho TIÊU ĐỀ/MỤC: đậm toàn dòng
    function paraHeading(prefixBold, titleBold, opts = {}) {
      return new docx.Paragraph({
        ...basePara,
        ...opts,
        children: [
          new docx.TextRun({ text: prefixBold || "", bold: true, ...runBase }),
          new docx.TextRun({ text: titleBold || "", bold: true, ...runBase }),
        ],
      });
    }

    // Dùng cho DÒNG Label: Value (label đậm, value thường)
    function paraLabelValue(labelBold, valueText, opts = {}) {
      return new docx.Paragraph({
        ...basePara,
        ...opts,
        children: [
          new docx.TextRun({ text: labelBold || "", bold: true, ...runBase }),
          new docx.TextRun({ text: valueText || "", bold: false, ...runBase }),
        ],
      });
    }

    // Label: Value nhưng value nhiều dòng (split \n)
    function paraLabelValueMultiline(labelBold, valueText, opts = {}) {
      const lines = String(valueText || "").split(/\r?\n/);
      const first = lines.shift() ?? "";

      const out = [
        new docx.Paragraph({
          ...basePara,
          ...opts,
          children: [
            new docx.TextRun({ text: labelBold || "", bold: true, ...runBase }),
            new docx.TextRun({ text: first, bold: false, ...runBase }),
          ],
        }),
      ];

      for (const line of lines) out.push(para(line));
      return out;
    }

    function textToParagraphs(text) {
      if (!text) return [];
      return String(text).split(/\r?\n/).map(line => para(line));
    }

    // Dòng "3. Sinh ngày: xxxx (xx tuổi)" -> (xx tuổi) KHÔNG đậm
    function paraSinhNgayRow() {
      return new docx.Paragraph({
        ...basePara,
        children: [
          new docx.TextRun({ text: "3. Sinh ngày: ", bold: true, ...runBase }),
          new docx.TextRun({ text: `${formatNgaySinh(data.ngaysinh)} `, bold: false, ...runBase }),
          new docx.TextRun({ text: `(${data.tuoi})`, bold: false, ...runBase }),
        ],
      });
    }


    const doc = new docx.Document({
      styles: {
        default: {
          document: {
            run: { font: "Times New Roman", size: 28 },
            paragraph: { spacing: { line: LINE_15, lineRule: docx.LineRuleType.AUTO } },
          },
        },
      },
      sections: [{
        properties: {
          page: {
            margin: { top: MARGIN_2CM, right: MARGIN_2CM, bottom: MARGIN_2CM, left: MARGIN_2CM },
            size: { orientation: docx.PageOrientation.PORTRAIT },
          },
        },
        children: [
          // Title 20pt
          new docx.Paragraph({
            alignment: docx.AlignmentType.CENTER,
            spacing: { after: 200, line: LINE_15, lineRule: docx.LineRuleType.AUTO },
            children: [
              new docx.TextRun({
                text: "BỆNH ÁN NHI KHOA",
                bold: true,
                font: "Times New Roman",
                size: TITLE_SIZE,
              }),
            ],
          }),

          // Date
          new docx.Paragraph({
            ...basePara,
            spacing: { ...basePara.spacing, after: 200 },
            children: [
              new docx.TextRun({ text: `Xuất: ${dateNow}`, italics: true, bold: false, ...runBase }),
            ],
          }),

          // A
          paraHeading("A. ", "PHẦN HÀNH CHÁNH", { spacing: { ...basePara.spacing, before: 100, after: 100 } }),
          paraLabelValue("1. Họ và tên: ", data.hoten),
          paraLabelValue("2. Giới tính: ", data.gioitinh),
          paraSinhNgayRow(),
          paraLabelValue("4. Dân tộc: ", data.dantoc),
          paraLabelValue("5. Họ tên bố/mẹ: ", data.hoten_bome),
          paraLabelValue("6. Nghề nghiệp: ", data.nghenghiep),
          paraLabelValue("7. Địa chỉ: ", data.diachi),
          paraLabelValue("8. Ngày giờ vào viện: ", formatNgayGio(data.ngaygio), { spacing: { ...basePara.spacing, after: 120 } }),

          // B
          paraHeading("B. ", "PHẦN BỆNH ÁN", { spacing: { ...basePara.spacing, before: 180, after: 100 } }),

          paraHeading("I. ", "Hỏi bệnh", { spacing: { ...basePara.spacing, before: 120, after: 60 } }),
          ...paraLabelValueMultiline("1. Lý do vào viện: ", data.lydo),
          paraHeading("2. ", "Bệnh sử:", { spacing: { ...basePara.spacing, before: 60, after: 0 } }),
          ...textToParagraphs(data.benhsu),
          paraHeading("3. ", "Tiền sử:", { spacing: { ...basePara.spacing, before: 60, after: 0 } }),
          ...textToParagraphs(data.tiensu),

          paraHeading("II. ", "Khám bệnh", { spacing: { ...basePara.spacing, before: 160, after: 60 } }),
          paraHeading("1. ", "Toàn trạng:", { spacing: { ...basePara.spacing, after: 0 } }),
          para(`- Sinh hiệu: Mạch ${data.mach} lần/phút, nhiệt độ: ${data.nhietdo}°C, HA ${data.ha_tren}/${data.ha_duoi} mmHg, nhịp thở: ${data.nhiptho} lần/phút`),
          para(`- Chiều cao: ${data.chieucao} cm, cân nặng: ${data.cannang} kg, Đánh giá Z-score: CN/Tuổi ${data.wa}; CC/Tuổi ${data.ha}; CN/CC ${data.wh}`),
          ...textToParagraphs(data.tongtrang),

          paraHeading("2. ", "Khám cơ quan:", { spacing: { ...basePara.spacing, before: 120, after: 20 } }),
          paraHeading("a) ", "Tuần hoàn:", { spacing: { ...basePara.spacing, after: 0 } }),
          ...textToParagraphs(data.timmach),

          paraHeading("b) ", "Hô hấp:", { spacing: { ...basePara.spacing, before: 40, after: 0 } }),
          ...textToParagraphs(data.hopho),

          paraHeading("c) ", "Tiêu hoá:", { spacing: { ...basePara.spacing, before: 40, after: 0 } }),
          ...textToParagraphs(data.tieuhoa),

          paraHeading("d) ", "Thận - tiết niệu:", { spacing: { ...basePara.spacing, before: 40, after: 0 } }),
          ...textToParagraphs(data.than),

          paraHeading("e) ", "Thần kinh:", { spacing: { ...basePara.spacing, before: 40, after: 0 } }),
          ...textToParagraphs(data.thankinh),

          paraHeading("f) ", "Cơ - Xương - Khớp:", { spacing: { ...basePara.spacing, before: 40, after: 0 } }),
          ...textToParagraphs(data.cokhop),

          // g) label đậm, value thường
          paraLabelValue("g) Các cơ quan khác: ", data.coquankhac, { spacing: { ...basePara.spacing, before: 40, after: 0 } }),

          paraHeading("III. ", "Kết luận", { spacing: { ...basePara.spacing, before: 160, after: 60 } }),
          paraHeading("1. ", "Tóm tắt bệnh án:", { spacing: { ...basePara.spacing, after: 0 } }),
          ...textToParagraphs(data.tomtat),

          // label đậm, value thường
          ...paraLabelValueMultiline("2. Chẩn đoán sơ bộ: ", data.chandoanso, { spacing: { ...basePara.spacing, before: 60 } }),

          paraHeading("3. ", "Chẩn đoán phân biệt:", { spacing: { ...basePara.spacing, before: 60, after: 0 } }),
          ...textToParagraphs(data.chandoanpd),

          paraHeading("4. ", "Đề nghị cận lâm sàng và kết quả:", { spacing: { ...basePara.spacing, before: 60 } }),
          paraHeading("a) ", "Đề nghị cận lâm sàng:", { spacing: { ...basePara.spacing, before: 20 } }),
          para(`- Thường quy: ${data.cls_thuongquy}`),
          para(`- Chẩn đoán: ${data.cls_chuandoan}`),

          paraHeading("b) ", "Kết quả:", { spacing: { ...basePara.spacing, before: 40, after: 0 } }),
          ...textToParagraphs(data.ketqua),

          paraHeading("5. ", "Chẩn đoán xác định:", { spacing: { ...basePara.spacing, before: 60, after: 0 } }),
          ...textToParagraphs(data.chandoanxacdinh),

          paraHeading("6. ", "Điều trị:", { spacing: { ...basePara.spacing, before: 60 } }),
          paraHeading("a) ", "Hướng điều trị:", { spacing: { ...basePara.spacing, after: 0 } }),
          ...textToParagraphs(data.huongdieutri),

          paraHeading("b) ", "Điều trị cụ thể:", { spacing: { ...basePara.spacing, before: 40, after: 0 } }),
          ...textToParagraphs(data.dieutri),

          paraHeading("7. ", "Tiên lượng:", { spacing: { ...basePara.spacing, before: 60, after: 0 } }),
          ...textToParagraphs(data.tienluong),

          // C
          paraHeading("C. ", "PHẦN BIỆN LUẬN", { spacing: { ...basePara.spacing, before: 180, after: 60 } }),
          ...textToParagraphs(data.bienluan),
        ],
      }],
    });

    const blob = await docx.Packer.toBlob(doc);
    saveAs(blob, `${data.hoten || 'benhan'}.docx`);
  } catch (err) {
    alert("⚠️ Lỗi: " + (err?.message || err));
    console.error(err);
  } finally {
    if (overlay) overlay.style.display = 'none';
  }
}

// ===============================
//  RESET
// ===============================
function resetForm() {
  if (confirm('Xoá hết dữ liệu trong form?')) {
    // Đồng bộ xoá (nếu đang share)
    try { window.__SHARE_SYNC__?.clearAllNow?.(); } catch (_) {}

    // Reset local
    document.getElementById('benhanForm')?.reset();
    const tuoi = document.getElementById('tuoi'); if (tuoi) tuoi.textContent = '-';
    const wa = document.getElementById('wa'); if (wa) wa.textContent = '-';
    const ha = document.getElementById('ha'); if (ha) ha.textContent = '-';
    const wh = document.getElementById('wh'); if (wh) wh.textContent = '-';
    try { closePreview(); } catch (_) {}

    // Đồng bộ lại state rỗng qua websocket (phòng trường hợp server không support type 'clear')
    try { window.__SHARE_SYNC__?.sendStateNow?.(); } catch (_) {}

    // Trigger các tính năng phụ thuộc để UI đồng nhất (tóm tắt/z-score...)
    try { document.getElementById('chieucao')?.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
    try { document.getElementById('cannang')?.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
    try { document.getElementById('ngaysinh')?.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
  }
}

// ===============================
//  TOPBAR ACTIONS (Export / Preview / Reset)
// ===============================
document.getElementById("btn-export")?.addEventListener("click", generateDocx);
document.getElementById("btn-preview")?.addEventListener("click", openPreview);
document.getElementById("btn-reset")?.addEventListener("click", resetForm);

// Liquid glass: subtle parallax follow scroll (updates CSS vars)
(function bindGlassScroll(){
  const root = document.documentElement;
  let raf = 0;
  function onScroll(){
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      root.style.setProperty("--scroll-y", String(window.scrollY || 0) + "px");
      root.style.setProperty("--scroll-x", String(window.scrollX || 0) + "px");
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  onScroll();
})();

// ===============================
//  CHAT (giữ nguyên như bạn đang có)
// ===============================
const chatToggleBtn = document.getElementById("btn-chat");
const chatBox = document.getElementById("chat-panel");
const chatClose = document.getElementById("chat-close");
const chatSend = document.getElementById("chat-send");
const chatInput = document.getElementById("chat-text");
const chatMessages = document.getElementById("chat-messages");

// ===============================
//  CHAT API (Render)
//  Backend proxy gọi Gemini, trả JSON: { answer: "..." }
//  (Đổi domain nếu Render của bạn khác)
// ===============================
const CHAT_API_URL = "https://lolambenhan.onrender.com/chat";

if (chatToggleBtn && chatBox) {
  chatToggleBtn.onclick = () => {
    const willShow = !chatBox.classList.contains("show");
    chatBox.classList.toggle("show", willShow);
    chatToggleBtn.setAttribute("aria-expanded", String(willShow));
  };
}
if (chatClose && chatBox) {
  chatClose.onclick = () => {
    chatBox.classList.remove("show");
    chatToggleBtn?.setAttribute("aria-expanded", "false");
  };
}

// ===============================
//  CHAT MEMORY MODES (1/2/3)
// ===============================
const SYSTEM_PROMPT = `
Bạn tên là LÒ. Bạn là người máy hỗ trợ hoàn thành bệnh án.
Mình có thể tìm lý thuyết bệnh học, hỗ trợ biện luận và đưa ra ý kiến để giúp bạn hoàn thành bệnh án tốt nhất.
`;

// 1 = RAM (mất khi reload)
// 2 = sessionStorage (giữ khi F5, mất khi đóng tab)
// 3 = localStorage (giữ khi đóng/mở lại trình duyệt)
let CHAT_MEMORY_MODE = 1;

// key lưu trữ
const CHAT_STORAGE_KEY = "lo_chat_history_v1";

function getStorageByMode(mode) {
  if (mode === 2) return window.sessionStorage;
  if (mode === 3) return window.localStorage;
  return null; // mode 1: RAM only
}

// chatHistory luôn tồn tại trong RAM; nếu mode 2/3 thì sync vào storage
const chatHistory = loadChatHistory();

function loadChatHistory() {
  const store = getStorageByMode(CHAT_MEMORY_MODE);
  if (!store) return [{ role: "system", content: SYSTEM_PROMPT }];

  try {
    const raw = store.getItem(CHAT_STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr) && arr.length) return arr;
  } catch (_) {}

  return [{ role: "system", content: SYSTEM_PROMPT }];
}

function saveChatHistory() {
  const store = getStorageByMode(CHAT_MEMORY_MODE);
  if (!store) return;

  // giới hạn lịch sử để không phình
  const MAX_MSG = 30;
  const trimmed = chatHistory.slice(-MAX_MSG);

  // luôn đảm bảo system prompt đứng đầu
  if (trimmed[0]?.role !== "system") {
    trimmed.unshift({ role: "system", content: SYSTEM_PROMPT });
  }

  // sync lại mảng RAM
  chatHistory.length = 0;
  chatHistory.push(...trimmed);

  try {
    store.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatHistory));
  } catch (_) {}
}

// đổi mode khi cần (tùy bạn muốn làm dropdown trong UI)
function setChatMemoryMode(mode) {
  CHAT_MEMORY_MODE = mode;

  // xóa storage cũ cả 2 nơi để tránh “lẫn”
  try { sessionStorage.removeItem(CHAT_STORAGE_KEY); } catch (_) {}
  try { localStorage.removeItem(CHAT_STORAGE_KEY); } catch (_) {}

  // reset RAM -> hệ thống
  chatHistory.length = 0;
  chatHistory.push({ role: "system", content: SYSTEM_PROMPT });
  saveChatHistory();
}

// reset chat (xóa lịch sử + UI)
function resetChat() {
  try { sessionStorage.removeItem(CHAT_STORAGE_KEY); } catch (_) {}
  try { localStorage.removeItem(CHAT_STORAGE_KEY); } catch (_) {}
  chatHistory.length = 0;
  chatHistory.push({ role: "system", content: SYSTEM_PROMPT });
  if (chatMessages) chatMessages.innerHTML = "";
}

function buildFormContextForBot() {
  // lấy đúng 2 trường bạn yêu cầu
  const tomtat = (document.getElementById("tomtat")?.value || "").trim();
  const chandoanso = (document.getElementById("chandoanso")?.value || "").trim();

  // nếu cả 2 trống thì khỏi gửi context
  if (!tomtat && !chandoanso) return "";

  return `
DỮ LIỆU TỪ FORM (tham khảo khi trả lời):
- Tóm tắt bệnh án: ${tomtat || "(chưa có)"}
- Chẩn đoán sơ bộ: ${chandoanso || "(chưa có)"}
`.trim();
}

async function sendMessage() {
  if (!chatInput || !chatMessages || !chatSend) return;

  const text = chatInput.value.trim();
  if (!text) return;

  // UI: user message
  chatMessages.innerHTML += `<div class="msg user">${escapeHtml(text)}</div>`;
  chatInput.value = "";
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // disable khi đang gửi
  chatInput.disabled = true;
  chatSend.disabled = true;

  // loading UI
  const loadingEl = document.createElement("div");
  loadingEl.className = "msg loading";
  loadingEl.innerHTML = `
    <span class="loading-text">Đang soạn tin</span>
    <span class="typing-dots"><span></span><span></span><span></span></span>
  `;
  chatMessages.appendChild(loadingEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // đổi text sau 10s
  const timeoutId = setTimeout(() => {
    const textEl = loadingEl.querySelector(".loading-text");
    if (textEl) textEl.textContent = "Bạn đợi xíu nhe";
  }, 10000);

  try {
    // ✅ Cách 3: bơm context từ form (tóm tắt + chẩn đoán sơ bộ)
    const formContext = buildFormContextForBot();
    const userContent = formContext ? (formContext + "\n\nCâu hỏi: " + text) : text;

    // ✅ Cách 1/2/3: lưu lịch sử theo mode
    chatHistory.push({ role: "user", content: userContent });
    saveChatHistory();

    const response = await fetch(CHAT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chatHistory })
    });

    // Đọc text trước để tránh lỗi: Unexpected token '<' (server trả HTML)
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${raw.slice(0, 200)}`);
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch (_) {
      throw new Error(`Server không trả JSON. Nhận: ${raw.slice(0, 200)}`);
    }

    // Backend Render (Gemini proxy) trả { answer: "..." }
    const reply = (data && typeof data.answer === "string" && data.answer.trim())
      ? data.answer.trim()
      : "Bot không trả lời.";

    clearTimeout(timeoutId);
    loadingEl.remove();

    // lưu assistant vào history
    chatHistory.push({ role: "assistant", content: reply });
    saveChatHistory();

    // UI: bot message (hiển thị reply “sạch” — không cần hiện context)
    chatMessages.innerHTML += `<div class="msg bot">${escapeHtml(reply)}</div>`;
    chatMessages.scrollTop = chatMessages.scrollHeight;

  } catch (err) {
    clearTimeout(timeoutId);
    loadingEl.remove();
    chatMessages.innerHTML += `<div class="msg bot">⚠️ Lỗi: ${escapeHtml(err.message || String(err))}</div>`;
  } finally {
    chatInput.disabled = false;
    chatSend.disabled = false;
    chatInput.focus();
  }
}

if (chatSend) chatSend.onclick = sendMessage;
if (chatInput) {
  chatInput.addEventListener("keypress", e => {
    if (e.key === "Enter") sendMessage();
  });
}

// ===============================
//  SHARE ONLINE (WebSocket - Render, ws thuần)
//  - Không hiện notice khi chưa bấm Chia sẻ
//  - Dùng ?room=xxxx để 2 máy vào cùng phòng
//  - Đồng bộ realtime + đồng bộ Xoá hết
// ===============================
(function initShareWebSocket() {
  const WS_URL = "wss://lolambenhan.onrender.com"; // <-- đổi nếu domain Render thay đổi

  const noticeEl = document.getElementById("share-notice");
  const btnShare = document.getElementById("btn-share");
  const formEl = document.getElementById("benhanForm");

  // Disable nút Chia sẻ khi đã vào room (đang chia sẻ) + hiển thị trạng thái kết nối
  function setShareButtonDisabled(disabled) {
    if (!btnShare) return;
    btnShare.disabled = !!disabled;
    btnShare.classList.toggle("is-disabled", !!disabled);
    if (disabled) {
      btnShare.setAttribute("aria-disabled", "true");
      btnShare.title = "Đang trong phiên chia sẻ";
    } else {
      btnShare.removeAttribute("aria-disabled");
      btnShare.title = "";
    }
  }

  function dotSVG(color) {
    return `
      <svg style="vertical-align:middle;margin-right:6px;flex-shrink:0;" width="10" height="10" viewBox="0 0 10 10"
           xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="5" cy="5" r="5" fill="${color}"></circle>
      </svg>
    `.trim();
  }

  function setShareStatus(status, count) {
    if (!btnShare) return;

    // Khi đã ở room => luôn disable
    const inRoom = !!state.room;

    if (!inRoom) {
      // chưa vào room: nút chia sẻ bình thường
      setShareButtonDisabled(false);
      btnShare.textContent = "Chia sẻ";
      return;
    }

    setShareButtonDisabled(true);

    if (status === "connecting") {
      btnShare.innerHTML = `${dotSVG("#f59e0b")}Connecting…`;
      return;
    }

    if (status === "offline") {
      btnShare.innerHTML = `${dotSVG("#ef4444")}Offline`;
      return;
    }

    // online
    const n = (typeof count === "number" && isFinite(count)) ? count : null;
    btnShare.innerHTML = `${dotSVG("#22c55e")}${n !== null ? `${n} online` : "Online"}`;
  }

  const state = {
    ws: null,
    room: null,
    connected: false,
    applyingRemote: false,
    sendTimer: 0,
    lastSentJson: "",
    boundEvents: false,
  };

  function setNotice(html, show = true) {
    if (!noticeEl) return;
    noticeEl.innerHTML = html || "";
    noticeEl.style.display = show ? "block" : "none";
  }

  // Luôn ẩn notice lúc mới vào (đúng yêu cầu)
  setNotice("", false);

  function getRoomFromURL() {
    try {
      const u = new URL(window.location.href);
      const r = u.searchParams.get("room");
      return r && r.trim() ? r.trim() : null;
    } catch {
      return null;
    }
  }

  function setRoomToURL(room) {
    const u = new URL(window.location.href);
    u.searchParams.set("room", room);
    history.replaceState(null, "", u.toString());
    return u.toString();
  }

  function randomRoom() {
    return (Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)).toLowerCase();
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try { window.prompt("Copy link:", text); return true; } catch {}
      return false;
    }
  }

  function renderSharedNotice(link) {
    // Dùng đúng class đã có trong style.css để khỏi lệch style
    setNotice(`
      <div class="share-row">
        <span class="share-label" style="color: green !important;">Đã chia sẻ</span>
        <a class="share-link" href="${escapeHtml(link)}" target="_blank" rel="noopener">${escapeHtml(link)}</a>
        <span class="share-actions">
          <button type="button" class="apple-icon-btn" id="share-copy-btn" data-link="${escapeHtml(link)}">Copy</button>
        </span>
      </div>
      <div class="share-hint">
        Gửi cho người khác link phía trên để họ truy cập và làm bệnh án cùng bạn.
      </div>
    `, true);
  }

  function renderConnectedNotice(room) {
    // Khi người nhận mở link có room=... thì chỉ báo kết nối (không hiện “nhấn chia sẻ…”)
    setNotice(`
      <div class="share-row">
        <span class="share-label" style="color: green !important;">Kết nối thành công</span>
        <span class="share-muted">(Room <b>${escapeHtml(room)}</b>)</span>
        <span class="share-actions">
          <button type="button" class="apple-icon-btn" id="share-copy-btn" data-link="${escapeHtml(window.location.href)}">Copy link</button>
        </span>
      </div>
      <div class="share-hint">
        Bạn đang ở phiên bệnh án do người khác chia sẽ, mọi thay đổi sẽ tự động lưu lại.
      </div>
    `, true);
  }

  function bindNoticeCopyButton() {
    if (!noticeEl) return;
    const btn = noticeEl.querySelector("#share-copy-btn");
    if (!btn) return;

    btn.addEventListener("click", async () => {
      const link = btn.getAttribute("data-link") || window.location.href;
      const ok = await copyText(link);
      if (!ok) return;

      const old = btn.textContent;
      btn.textContent = "Đã copy";
      btn.classList.add("is-done");
      window.setTimeout(() => {
        btn.textContent = old;
        btn.classList.remove("is-done");
      }, 1200);
    }, { once: true });
  }

  function collectFields() {
    if (!formEl) return [];
    const els = Array.from(formEl.querySelectorAll("input[id], textarea[id], select[id]"));
    return els.filter(el => {
      const id = el.id || "";
      if (!id) return false;
      if (el.type === "button" || el.type === "submit") return false;
      return true;
    });
  }

  function snapshotData() {
    const out = {};
    for (const el of collectFields()) {
      if (el.type === "checkbox") out[el.id] = !!el.checked;
      else if (el.type === "radio") {
        if (el.checked) out[el.id] = el.value ?? "";
      } else {
        out[el.id] = (el.value ?? "");
      }
    }
    return out;
  }

  function applyData(dataObj) {
    if (!dataObj || typeof dataObj !== "object") return;

    state.applyingRemote = true;
    try {
      for (const el of collectFields()) {
        if (!(el.id in dataObj)) continue;
        // không overwrite field đang focus
        if (document.activeElement === el) continue;

        const v = dataObj[el.id];

        if (el.type === "checkbox") {
          el.checked = !!v;
        } else if (el.type === "radio") {
          el.checked = (String(v) === String(el.value));
        } else {
          el.value = (v ?? "");
        }

        // Nếu là select mẫu thì đổ vào textarea tương ứng
        if (el.tagName === "SELECT") {
          const mappedTextareaId = __SELECT_TO_TEXTAREA__?.[el.id];
          if (mappedTextareaId) _setTextareaFromSelect(el.id, mappedTextareaId, { silentSync: true });
        }

        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }

      // đảm bảo các computed cập nhật
      try { tinhBMI(); } catch (_) {}
      try { updateTomtat(); } catch (_) {}

    } finally {
      state.applyingRemote = false;
    }
  }

  function wsSend(obj) {
    if (!state.ws || state.ws.readyState !== 1) return;
    // gửi kèm room để server dễ route (kể cả khi join/presence có vấn đề)
    if (state.room && (obj?.type === "state" || obj?.type === "clear")) {
      obj.room = state.room;
    }
    state.ws.send(JSON.stringify(obj));
  }

  function scheduleSendState(immediate = false) {
    if (!state.connected || state.applyingRemote) return;
    if (state.sendTimer) clearTimeout(state.sendTimer);

    const run = () => {
      const payload = snapshotData();
      const json = JSON.stringify(payload);
      if (json === state.lastSentJson) return;
      state.lastSentJson = json;
      wsSend({ type: "state", payload });
    };

    state.sendTimer = setTimeout(run, immediate ? 0 : 350);
  }

  function bindFormEvents() {
    if (!formEl) return;
    if (state.boundEvents) return;
    state.boundEvents = true;
    formEl.addEventListener("input", () => scheduleSendState(false));
    formEl.addEventListener("change", () => scheduleSendState(false));
  }

  function connect(room, { showNotice } = { showNotice: false }) {
    if (!WS_URL) return;

    // cleanup cũ
    try { state.ws?.close(); } catch (_) {}
    state.ws = null;
    state.connected = false;
    state.room = room;
    state.onlineCount = null;
    setShareStatus("connecting");

    const ws = new WebSocket(WS_URL);
    state.ws = ws;

    ws.onopen = () => {
      wsSend({ type: "join", room });
      state.connected = true;
      // vẫn hiển thị Connecting… cho tới khi nhận presence/joined
      setShareStatus("connecting", state.onlineCount);

      // Khi đã vào room thì mới bind events
      bindFormEvents();

      if (showNotice) {
        renderSharedNotice(window.location.href);
        bindNoticeCopyButton();
      } else {
        // nếu người nhận mở link => cho biết đang đồng bộ
        renderConnectedNotice(room);
        bindNoticeCopyButton();
      }

      // đẩy state hiện tại lên ngay (để người vào sau nhận)
      scheduleSendState(true);
    };

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }

      if (msg.type === "joined") {
        // server xác nhận đã vào phòng
        setShareStatus("online", state.onlineCount);
        return;
      }

      if (msg.type === "presence") {
        // cập nhật số người online trong phòng
        if (typeof msg.count === "number") state.onlineCount = msg.count;
        setShareStatus(state.connected ? "online" : "connecting", state.onlineCount);
        return;
      }

      if (msg.type === "state") {
        applyData(msg.payload || {});
        return;
      }
      if (msg.type === "clear") {
        // reset local (không confirm)
        __resetFormUIOnly();
        return;
      }
    };

    ws.onclose = () => {
      state.connected = false;
      if (state.room) setShareStatus("offline", state.onlineCount);
      // không hiện notice khi chưa bấm chia sẻ; còn đang share thì giữ notice nhưng có thể reconnect
      // auto reconnect nhẹ nếu đã có room
      if (state.room) {
        setTimeout(() => {
          // chỉ reconnect nếu vẫn ở đúng room (tránh reconnect khi user rời room)
          const cur = getRoomFromURL();
          if (cur && cur === state.room) connect(state.room, { showNotice: showNotice || false });
        }, 1200);
      }
    };

    ws.onerror = () => {
      if (state.room) setShareStatus("offline", state.onlineCount);
      // nếu người dùng đã bấm chia sẻ mà lỗi thì báo nhẹ
      if (showNotice) {
        setNotice(`
          <div class="share-row">
            <span class="share-label" style="color: #c00 !important;">Không kết nối được</span>
            <span class="share-muted">Kiểm tra Render đang chạy và WS_URL.</span>
          </div>
        `, true);
      }
    };
  }

  // Reset UI-only (dùng khi nhận "clear" từ remote)
  function __resetFormUIOnly() {
    document.getElementById('benhanForm')?.reset();
    const tuoi = document.getElementById('tuoi'); if (tuoi) tuoi.textContent = '-';
    const bmi = document.getElementById('bmi'); if (bmi) bmi.textContent = '-';
    const pl = document.getElementById('phanloai'); if (pl) pl.textContent = '-';
    try { closePreview(); } catch (_) {}
  }

  // expose để resetForm() gọi khi user bấm Xoá hết
  window.__SHARE_SYNC__ = window.__SHARE_SYNC__ || {};
  window.__SHARE_SYNC__.enabled = false;
  window.__SHARE_SYNC__.saveFieldNow = () => scheduleSendState(false); // compat cho dropdown helper
  // gửi ngay toàn bộ state hiện tại (dùng cho reset/đồng bộ cưỡng bức)
  window.__SHARE_SYNC__.sendStateNow = () => scheduleSendState(true);
  window.__SHARE_SYNC__.clearAllNow = () => {
    if (!state.connected) return;
    wsSend({ type: "clear" });
  };

  // click Chia sẻ: tạo room, cập nhật URL, connect, show notice
  async function onShareClick() {
    let room = getRoomFromURL();
    if (!room) {
      room = randomRoom();
      setRoomToURL(room);
    }
    const link = window.location.href;

    // Copy link ngay khi bấm (nếu được)
    try { await navigator.clipboard.writeText(link); } catch (_) {}

    // Đã bắt đầu chia sẻ => khoá nút Chia sẻ và hiện trạng thái Connecting…
    state.room = room;
    setShareStatus("connecting");

    connect(room, { showNotice: true });
    window.__SHARE_SYNC__.enabled = true;

    // render notice ngay (không chờ ws open) để user thấy có phản hồi
    renderSharedNotice(link);
    bindNoticeCopyButton();
  }

  if (btnShare) btnShare.addEventListener("click", onShareClick);

  // Auto-connect khi người nhận mở link có ?room=
  const roomFromUrl = getRoomFromURL();
  if (roomFromUrl) {
    // Nếu mở bằng link có room => đang trong phiên chia sẻ
    state.room = roomFromUrl;
    setShareStatus("connecting");
    connect(roomFromUrl, { showNotice: false });
    window.__SHARE_SYNC__.enabled = true;
    // vẫn cho thấy đang đồng bộ (không hiện hint “nhấn chia sẻ…”)
    renderConnectedNotice(roomFromUrl);
    bindNoticeCopyButton();
  }

})();
