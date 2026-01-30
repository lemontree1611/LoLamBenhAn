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
  // cập nhật lại đánh giá Z-score khi tuổi thay đổi
  if (typeof scheduleGrowthCheck === 'function') scheduleGrowthCheck();
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
    const response = await fetch("../source/apikey.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(payload) }
        ]
      })
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

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
    document.getElementById('benhanForm')?.reset();
    document.getElementById('tuoi').textContent = '-';
    document.getElementById('wa').textContent = '-';
    document.getElementById('ha').textContent = '-';
    document.getElementById('wh').textContent = '-';
    closePreview();
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

    const response = await fetch("../source/apikey.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: chatHistory
      })
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "Bot không trả lời.";

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
//  SHARE + SYNC (DB via PHP API)
//  - Chưa bấm "Chia sẻ" => KHÔNG gắn id, KHÔNG gọi server
//  - Bấm "Chia sẻ" => tạo id 6 số, gắn ?id=xxxxxx&i=1, copy link, bật sync
//  - Người mở link có i=1 => tự bật sync
// ===============================
(function initShareAndSync() {
  const noticeEl = document.getElementById("share-notice");
  const btnShare = document.getElementById("btn-share");
  const formEl = document.getElementById("benhanForm");

  let __CURRENT_SHARE_LINK__ = "";

  if (noticeEl) {
    noticeEl.addEventListener("click", async (ev) => {
      const btn = ev.target.closest?.("#share-copy-btn");
      if (!btn) return;
      ev.preventDefault();

      const link = btn.getAttribute("data-link") || __CURRENT_SHARE_LINK__ || "";
      if (!link) return;

      const ok = await copyText(link);
      if (!ok) return;

      setCopyBtnState(btn, "done");
      window.setTimeout(() => setCopyBtnState(btn, "idle"), 1200);
    });
  }

  function setCopyBtnState(btn, state) {
    if (!btn) return;
    if (state === "done") {
      btn.textContent = "Đã copy";
      btn.classList.add("is-done");
      btn.dataset.state = "done";
      return;
    }
    btn.textContent = "Copy";
    btn.classList.remove("is-done");
    btn.dataset.state = "idle";
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      try {
        window.prompt("Copy link:", text);
        return true;
      } catch (_) {}
      return false;
    }
  }

  function setNotice(html, show = true) {
    if (!noticeEl) return;
    noticeEl.innerHTML = html || "";
    noticeEl.style.display = show ? "block" : "none";
  }

  function getParam(name) {
    try { return new URLSearchParams(window.location.search).get(name); }
    catch { return null; }
  }

  function setUrlParams(paramsObj) {
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(paramsObj)) {
      if (v === null || v === undefined || v === "") url.searchParams.delete(k);
      else url.searchParams.set(k, String(v));
    }
    history.replaceState(null, "", url.toString());
    return url.toString();
  }

  function genId6() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let id = "";
    for (let i = 0; i < 6; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
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
      out[el.id] = (el.value ?? "");
    }
    return out;
  }

  function applyData(dataObj) {
    if (!dataObj || typeof dataObj !== "object") return;
    __SYNC.applyingRemote = true;
    try {
      for (const el of collectFields()) {
        if (!(el.id in dataObj)) continue;
        // không overwrite field đang focus
        if (document.activeElement === el) continue;

        const v = dataObj[el.id] ?? "";
        if (el.value !== v) {
          el.value = v;

          // Nếu là select mẫu (tuần hoàn/hô hấp/...) thì đổ vào textarea tương ứng
          if (el.tagName === "SELECT") {
            const mappedTextareaId = __SELECT_TO_TEXTAREA__[el.id];
            if (mappedTextareaId) {
              _setTextareaFromSelect(el.id, mappedTextareaId, { silentSync: true });
            }
          }

          // Kích hoạt các auto-calc/auto-summary
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    } finally {
      __SYNC.applyingRemote = false;
    }
  }

  // ---------- API ----------
  const API = {
    load: (id) => fetch(`../source/live/load.php?id=${encodeURIComponent(id)}`, { cache: "no-store" }).then(r => r.json()),
    pull: (id, after) => fetch(`../source/live/pull.php?id=${encodeURIComponent(id)}&after=${encodeURIComponent(after)}`, { cache: "no-store" }).then(r => r.json()),
    saveField: (id, field, value, baseVersion) => {
      const fd = new FormData();
      fd.append("id", id);
      fd.append("field", field);
      fd.append("value", value ?? "");
      fd.append("base_version", baseVersion ?? 0);
      return fetch("../source/live/save_field.php", { method: "POST", body: fd }).then(r => r.json());
    },
    saveBulk: async (id, dataObj, baseVersion) => {
      // optional: nếu bạn có save_bulk.php
      const res = await fetch("../source/live/save_bulk.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, data: dataObj, base_version: baseVersion ?? 0 }),
      });
      if (!res.ok) throw new Error("save_bulk not available");
      return res.json();
    }
  };

  // ---------- SYNC STATE ----------
  const __SYNC = {
    enabled: false,
    applyingRemote: false,
    recordId: null,
    baseVersion: 0,
    lastUpdId: 0,

    // polling
    pollTimer: null,          // setTimeout id
    tabActive: !document.hidden,
    othersOnline: null,       // null=unknown, true/false from server hints
    lastPeerHintAt: 0,
    // adaptive polling
    pollCfg: { active: 3000, probe: 5000, idle: 60000, idleAfter: 30000 }, // 3s, 5s, 60s, 30s
    lastActivityAt: Date.now(),
    _tickFn: null,


    // save de-dup
    lastSaved: new Map(),     // field -> last saved value (string)

    _norm(v) { return String(v ?? ""); },

    async enable(id, { showSharedMsg = false } = {}) {
      if (this.enabled) return;
      this.enabled = true;
      this.recordId = String(id);

      // expose for dropdown autofill helpers
      window.__SHARE_SYNC__ = {
        enabled: true,
        saveFieldNow: (field, value) => this.saveFieldNow(field, value),
      };

      setNotice(`Đang kết nối để chia sẻ bệnh án ID <b>${escapeHtml(this.recordId)}</b>...`, true);

      // 1) load from server
      let server;
      try {
        server = await API.load(this.recordId);
      } catch (e) {
        setNotice(`⚠️ Không tải được dữ liệu đồng bộ. Kiểm tra file PHP/DB. (${escapeHtml(e.message || String(e))})`, true);
        return;
      }

      this.baseVersion = Number(server?.version || 0);
      this.lastUpdId = Number(server?.last_upd_id || 0);

      // 2) merge: ưu tiên dữ liệu đang có ở local, field trống mới lấy từ server
      const local = snapshotData();
      const merged = { ...server?.data };
      for (const [k, v] of Object.entries(local)) {
        if (v && String(v).trim() !== "") merged[k] = v;
      }
      applyData(merged);

      // cập nhật cache "đã lưu" theo trạng thái hiện tại sau khi apply
      this.lastSaved = new Map(Object.entries(snapshotData()).map(([k, v]) => [k, this._norm(v)]));

      // 3) push local current state lên server (để dữ liệu share lúc bấm nút được lưu)
      const payload = snapshotData();
      try {
        await API.saveBulk(this.recordId, payload, this.baseVersion);
        // nếu saveBulk thành công thì coi như mọi field đã "đã lưu"
        this.lastSaved = new Map(Object.entries(payload).map(([k, v]) => [k, this._norm(v)]));
      } catch (_) {
        // fallback: save từng field (chỉ field có dữ liệu)
        for (const [k, v] of Object.entries(payload)) {
          if (!v || String(v).trim() === "") continue;
          try { await this.saveFieldNow(k, v, { force: true }); } catch (_) {}
        }
      }

      if (showSharedMsg) {
        const sharedLink = setUrlParams({ id: this.recordId, i: 1 });
        __CURRENT_SHARE_LINK__ = sharedLink;

        setNotice(`
          <div class="share-row">
            <span class="share-label" style="color: green !important;">Đã chia sẻ</span>
            <a class="share-link" href="${escapeHtml(sharedLink)}" target="_blank" rel="noopener">${escapeHtml(sharedLink)}</a>
            <span class="share-actions">
              <button type="button" class="apple-icon-btn" id="share-copy-btn" data-link="${escapeHtml(sharedLink)}" aria-label="Copy link">Copy</button>
            </span>
          </div>
          <div class="share-hint">
            Gửi link phía trên cho mọi để làm bệnh án cùng nhau. Bệnh án sẽ tự động xóa sau <b>3 ngày</b> không truy cập
          </div>
        `, true);
      } else {
        setNotice(`
          <div class="share-row">
            <span class="share-label" style="color: green !important;">Kết nối thành công</span>
            <span class="share-muted">(Bệnh án ID <b>${escapeHtml(this.recordId)}</b>)</span>
          </div>
        `, true);
      }

      // 4) bind events
      this.bindFieldEvents();

      // 4.1) pause/resume polling by tab visibility
      document.addEventListener("visibilitychange", () => {
        this.tabActive = !document.hidden;
        if (!this.enabled) return;

        if (!this.tabActive) {
          this.stopPolling();
        } else {
          // tab active lại => poll ngay 1 lần để bắt kịp
          this.startPolling({ immediate: true });
        }
      });

      // 5) start polling (smart)
      this.startPolling({ immediate: true });
    },

    bindFieldEvents() {
      for (const el of collectFields()) {
        // input/textarea: lưu khi blur
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          el.addEventListener("blur", () => {
            if (!this.enabled || this.applyingRemote) return;
            this.saveFieldNow(el.id, el.value);
          });
          // một số input đặc biệt nên lưu khi change (date, number spinner)
          el.addEventListener("change", () => {
            if (!this.enabled || this.applyingRemote) return;
            this.saveFieldNow(el.id, el.value);
          });
        }

        // select: lưu khi change
        if (el.tagName === "SELECT") {
          const mappedTextareaId = __SELECT_TO_TEXTAREA__[el.id];

          // Các select mẫu (tuần hoàn/hô hấp/...) -> đổ vào textarea và lưu textarea
          if (mappedTextareaId) {
            el.addEventListener("change", () => {
              if (!this.enabled || this.applyingRemote) return;
              _setTextareaFromSelect(el.id, mappedTextareaId);
            });
          } else {
            // Select thường: lưu trực tiếp giá trị select
            el.addEventListener("change", () => {
              if (!this.enabled || this.applyingRemote) return;
              this.saveFieldNow(el.id, el.value);
            });
          }
        }
      }
    },

    // cố gắng suy ra có "người khác" hay không từ response pull.php (nếu server có trả)
    _updateOthersHint(j) {
      const boolHints = [
        j?.others_online,
        j?.has_others,
        j?.has_other,
        j?.hasOther,
        j?.hasOthers,
      ];
      for (const b of boolHints) {
        if (typeof b === "boolean") {
          this.othersOnline = b;
          this.lastPeerHintAt = Date.now();
          return;
        }
      }

      const numCandidates = [
        j?.peer_count,
        j?.peers,
        j?.viewer_count,
        j?.viewers,
        j?.online,
        j?.active_peers,
        j?.active,
      ];
      for (const n of numCandidates) {
        const num = Number(n);
        if (Number.isFinite(num)) {
          this.othersOnline = num > 1;
          this.lastPeerHintAt = Date.now();
          return;
        }
      }
      // không có hint => giữ nguyên (null/giá trị cũ)
    },

    async saveFieldNow(field, value, { force = false } = {}) {
      // local change -> quay về poll nhanh
      this.bumpActivity();
      if (!this.enabled || !this.recordId) return;

      const v = this._norm(value);
      const prev = this.lastSaved.get(field);

      // ✅ chỉ save khi dữ liệu thật sự thay đổi
      if (!force && prev !== undefined && prev === v) return;

      try {
        const resp = await API.saveField(this.recordId, field, v, this.baseVersion);
        if (resp?.ok) {
          this.baseVersion = Number(resp.version || this.baseVersion);
          if (resp.upd_id) this.lastUpdId = Math.max(this.lastUpdId, Number(resp.upd_id));

          // cập nhật cache đã lưu
          this.lastSaved.set(field, v);

        } else if (resp?.conflict) {
          // server thắng nếu conflict
          this.baseVersion = Number(resp.server_version || this.baseVersion);

          const serverVal = this._norm(resp.server_value ?? "");
          this.lastSaved.set(field, serverVal);

          const el = document.getElementById(field);
          if (el && document.activeElement !== el) {
            this.applyingRemote = true;
            el.value = serverVal;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            this.applyingRemote = false;
          }
        }
      } catch (e) {
        // im lặng để không spam alert, nhưng vẫn có thể debug bằng console
        console.warn("saveField error", field, e);
      }
    },


    stopPolling() {
      if (this.pollTimer) {
        clearTimeout(this.pollTimer);
        this.pollTimer = null;
      }
      // giữ _tickFn để có thể reschedule khi activity
    },


    bumpActivity() {
      // Gọi khi có thao tác local hoặc khi nhận remote update
      this.lastActivityAt = Date.now();
      // Nếu đang ở chế độ idle (poll lâu), lập tức chuyển về poll nhanh 3s
      if (this._tickFn) {
        if (this.pollTimer) {
          clearTimeout(this.pollTimer);
          this.pollTimer = null;
        }
        if (this.enabled && this.recordId && this.tabActive) {
          this.pollTimer = setTimeout(this._tickFn, this.pollCfg.active);
        }
      }
    },

    startPolling({ immediate = false } = {}) {
      this.stopPolling();
      const cfg = this.pollCfg;

      const tick = async () => {
        this.pollTimer = null;

        if (!this.enabled || !this.recordId) return;

        // ✅ tắt poll khi tab không active
        if (!this.tabActive) return;

        // ✅ chỉ polling khi có người khác (nếu server có hint, thì tắt poll nhanh khi không có ai)
        // nếu đã biết chắc không có người khác => chỉ probe chậm để xem có ai vào không
        const shouldFastPoll = (this.othersOnline === true);

        try {
          const j = await API.pull(this.recordId, this.lastUpdId);

          // cập nhật hint người khác (nếu server trả)
          this._updateOthersHint(j);

          const ups = j?.updates || [];
          if (Array.isArray(ups) && ups.length) {
            // có cập nhật mới -> chuyển về poll nhanh
            this.bumpActivity();
            for (const u of ups) {
              this.lastUpdId = Math.max(this.lastUpdId, Number(u.upd_id || 0));
              this.baseVersion = Math.max(this.baseVersion, Number(u.version || 0));

              const el = document.getElementById(u.field_key);
              if (!el) continue;
              if (document.activeElement === el) continue; // không đè khi đang gõ

              const newVal = this._norm(u.field_value ?? "");
              // cập nhật UI + cache đã lưu
              this.applyingRemote = true;
              el.value = newVal;
              this.lastSaved.set(u.field_key, newVal);

              // Với SELECT mẫu (tuần hoàn/hô hấp/...), khi nhận remote thì cần
              // đổ lại vào textarea tương ứng nhưng KHÔNG gửi ngược lên server.
              if (el.tagName === "SELECT") {
                const mappedTextareaId = __SELECT_TO_TEXTAREA__[el.id];
                if (mappedTextareaId) {
                  _setTextareaFromSelect(el.id, mappedTextareaId, { silentSync: true });
                  // _setTextareaFromSelect sẽ thay đổi textarea => cập nhật cache textarea luôn
                  const ta = document.getElementById(mappedTextareaId);
                  if (ta) this.lastSaved.set(mappedTextareaId, this._norm(ta.value));
                }
              }

              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
              this.applyingRemote = false;
            }
          }
        } catch (e) {
          console.warn("poll error", e);
        } finally {
          // schedule next
          if (!this.enabled || !this.recordId) return;
          if (!this.tabActive) return;

          // nếu server không cung cấp hint => vẫn probe chậm để giảm hits
          const idleFor = Date.now() - (this.lastActivityAt || 0);
          const nextMs = (idleFor >= cfg.idleAfter)
            ? cfg.idle
            : ((this.othersOnline === true) ? cfg.active : cfg.probe);

          this.pollTimer = setTimeout(tick, nextMs);
        }
      };

      this._tickFn = tick;

      if (immediate) {
        // chạy ngay (0ms) để đồng bộ lại liền khi vừa active
        this.pollTimer = setTimeout(tick, 0);
      } else {
        this.pollTimer = setTimeout(tick, (this.pollCfg?.active || 3000));
      }
    }
  };

  // expose state so dropdown helper can call save
  window.__SHARE_SYNC__ = window.__SHARE_SYNC__ || { enabled: false, saveFieldNow: () => {} };

  // ---------- UI actions ----------
  async function onShareClick() {
    // 1) tạo id nếu chưa có
    let id = getParam("id");
    if (!id) id = genId6();

    // 2) gắn id lên URL (không reload)
    const shareLink = setUrlParams({ id, i: null });

    // 3) lưu link hiện tại (nút Copy trong tab sẽ dùng)
    __CURRENT_SHARE_LINK__ = shareLink;

    // 4) (tuỳ chọn) copy ngay khi bấm Chia sẻ
    try {
      await navigator.clipboard.writeText(shareLink);
    } catch (_) {
      /* im lặng — vẫn có nút Copy */
    }

    // 5) bật sync + show message
    await __SYNC.enable(id, { showSharedMsg: true });
  }

  if (btnShare) btnShare.addEventListener("click", onShareClick);

  // ---------- Auto-enable when opened from shared link ----------
  const id = getParam("id");
  const i = getParam("i");
  if (id) {
    // Bất kể i=1/2/3 hay không có i, vẫn coi là link chia sẻ theo cùng id
    if (i !== null && i !== undefined) {
      // dọn URL cho gọn: bỏ i
      setUrlParams({ i: null });
    }
    __SYNC.enable(id, { showSharedMsg: false });
  } else {
    // chưa chia sẻ => ẩn notice
    setNotice("", false);
  }
})();

