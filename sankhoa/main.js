// ===============================
//  AUTO AGE + BMI
// ===============================
const namsinhInput = document.getElementById('namsinh');
const tuoiSpan = document.getElementById('tuoi');

namsinhInput?.addEventListener('input', () => {
  const y = parseInt(namsinhInput.value);
  if (!isNaN(y)) {
    const now = new Date();
    const age = now.getFullYear() - y;
    tuoiSpan.textContent = age >= 0 && age < 200 ? age : '-';
  } else {
    tuoiSpan.textContent = '-';
  }
  updateTomtat();
});

function tinhBMI() {
  const h = parseFloat(document.getElementById('chieucao')?.value);
  const w = parseFloat(document.getElementById('cannang')?.value);
  const bmiSpan = document.getElementById('bmi');
  const plSpan = document.getElementById('phanloai');

  if (!bmiSpan || !plSpan) return;

  if (!isNaN(h) && !isNaN(w) && h > 0) {
    const bmi = w / ((h * 0.01) * (h * 0.01));
    bmiSpan.textContent = bmi.toFixed(1);

    let pl = "";
    if (bmi < 18.5) pl = "gầy";
    else if (bmi < 23) pl = "trung bình";
    else if (bmi < 25) pl = "thừa cân";
    else if (bmi < 27.5) pl = "tiền béo phì";
    else if (bmi < 30) pl = "béo phì độ I";
    else pl = "béo phì độ II";

    plSpan.textContent = pl;
  } else {
    bmiSpan.textContent = "-";
    plSpan.textContent = "-";
  }
}

document.getElementById('chieucao')?.addEventListener('input', tinhBMI);
document.getElementById('cannang')?.addEventListener('input', tinhBMI);

// ===============================
//  DROPDOWN AUTOFILL
// ===============================
// Map select -> textarea (các mục chọn mẫu đổ vào textarea)

// Share sync stub (sẽ được bật khi bấm "Chia sẻ")
window.__SHARE_SYNC__ = window.__SHARE_SYNC__ || { enabled: false, saveFieldNow: () => {} };
const __SELECT_TO_TEXTAREA__ = {
  timmachSelect: "timmach",
  hohapSelect: "hopho",
  // TieuhoaSelect: "tieuhoa", // trang Sản khoa không có tiêu hoá
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

  // Kích hoạt lại các logic phụ thuộc (tóm tắt/BMI/preview...)
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));


  // Nếu đang bật đồng bộ, lưu ngay để người khác thấy luôn
  if (!opts.silentSync && window.__SHARE_SYNC__?.enabled) {
    window.__SHARE_SYNC__.saveFieldNow(textareaId, textarea.value);
  }
}

function insertTimmach() { _setTextareaFromSelect("timmachSelect", "timmach"); }
function insertHohap()   { _setTextareaFromSelect("hohapSelect",   "hopho"); }
function insertthan()    { _setTextareaFromSelect("thanSelect",    "than"); }
function insertthankinh(){ _setTextareaFromSelect("thankinhSelect","thankinh"); }
function insertcokhop()  { _setTextareaFromSelect("cokhopSelect",  "cokhop"); }

// ===============================
//  AUTO SUMMARY
// ===============================
function updateTomtat() {
  const tuoi = (document.getElementById("tuoi")?.textContent || "").trim();
  const para = (document.getElementById("para")?.value || "").trim();
  const lydo = (document.getElementById("lydo")?.value || "").trim();

  const ageText = (tuoi && tuoi !== "-") ? `${tuoi} tuổi` : "... tuổi";
  const paraText = para ? para : "....";
  const reasonText = lydo ? lydo : "...";

  // ưu tiên dự sinh từ Siêu âm 1 (TCN1) nếu tính được
  const due = calcDueDateFromSA1();
  const dueText = due ? formatDDMMYYYY(due) : "..../..../....";

  const text = `Sản phụ ${ageText}, PARA ${paraText}, vào viện vì lý do ${reasonText}, dự sinh ${dueText}. Qua hỏi bệnh, khám bệnh ghi nhận:`;
  const el = document.getElementById("tomtat");
  if (el) el.value = text;
}

["lydo", "para"].forEach(id => {
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

// ===============================
//  KHÁM THAI (TCN1/2/3) — STATE-DRIVEN (đồng bộ checkbox chắc chắn)
//  - Checkbox (TCN1/2/3 + OGTT) được quản lý bằng syncState và renderFromState()
//  - Khi nhận dữ liệu remote: cập nhật syncState -> render -> UI luôn đúng (kể cả đang focus)
// ===============================
const __TCN_KEYS__ = ["tcn1_on", "tcn2_on", "tcn3_on", "tcn2_ogtt_on"];
const syncState = {
  tcn1_on: true,
  tcn2_on: true,
  tcn3_on: true,
  tcn2_ogtt_on: false
};

function parseDateInput(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function formatDDMMYYYY(d) {
  if (!d) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function addDays(dateObj, days) {
  const d = new Date(dateObj.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function calcDueDateFromSA1() {
  const d0 = parseDateInput(document.getElementById('tcn1_sa1_date')?.value);
  const x = parseInt(document.getElementById('tcn1_sa1_x')?.value, 10);
  const y = parseInt(document.getElementById('tcn1_sa1_y')?.value, 10);
  if (!d0 || isNaN(x) || isNaN(y)) return null;
  const gaDays = (x * 7) + y;
  return addDays(d0, 280 - gaDays);
}

function updateDueDisplay() {
  const out = document.getElementById('tcn1_sa1_due');
  if (!out) return;
  const due = calcDueDateFromSA1();
  out.textContent = due ? formatDDMMYYYY(due) : '-';
}

function buildKhamThaiText() {
  const blocks = [];

  // TCN1
  if (syncState.tcn1_on) {
    const lines = [];
    lines.push('TCN1');

    const d0 = parseDateInput(document.getElementById('tcn1_sa1_date')?.value);
    const x = parseInt(document.getElementById('tcn1_sa1_x')?.value, 10);
    const y = parseInt(document.getElementById('tcn1_sa1_y')?.value, 10);
    const crl = (document.getElementById('tcn1_sa1_crl')?.value || '').trim();
    const due = calcDueDateFromSA1();

    const parts = ['- Siêu âm 1'];
    if (d0) parts.push(`(${formatDDMMYYYY(d0)}):`);
    const gaOk = !isNaN(x) && !isNaN(y);
    if (gaOk) {
      if (y === 0) parts.push(`Ghi nhận thai ${x} tuần,`);
      else parts.push(`Ghi nhận thai ${x} tuần ${y} ngày,`);
    }
    if (crl) parts.push(`CRL: ${crl} mm`);
    if (due) parts.push(`=> Dự sinh: ${formatDDMMYYYY(due)}`);

    const saLine = parts.join(' ')
      .replace(/\s+,/g, ',')
      .replace(/\s{2,}/g, ' ')
      .trim();

    lines.push(saLine);

    const t1 = (document.getElementById('tcn1_text')?.value || '').trim();
    if (t1) lines.push(t1);

    blocks.push(lines.join('\n'));
  }

  // TCN2
  if (syncState.tcn2_on) {
    const lines = [];
    lines.push('TCN2');

    const t2 = (document.getElementById('tcn2_text')?.value || '').trim();
    if (t2) lines.push(t2);

    if (syncState.tcn2_ogtt_on) {
      const ogttVal = (document.getElementById('tcn2_ogtt')?.value || '').trim();
      lines.push(`- OGTT: ${ogttVal}`.trim());
    }

    blocks.push(lines.join('\n'));
  }

  // TCN3
  if (syncState.tcn3_on) {
    const lines = [];
    lines.push('TCN3');
    const t3 = (document.getElementById('tcn3_text')?.value || '').trim();
    if (t3) lines.push(t3);
    blocks.push(lines.join('\n'));
  }

  return blocks.join('\n\n');
}

function syncKhamThaiComputed() {
  const ta = document.getElementById('benhsu_khamthai');
  if (ta) ta.value = buildKhamThaiText();
  updateTomtat();
}

function renderFromState() {
  // 1) render checkbox
  for (const key of __TCN_KEYS__) {
    const cb = document.querySelector(`input[type="checkbox"][data-sync="${key}"]`) || document.getElementById(key);
    if (cb) cb.checked = !!syncState[key];
  }

  // 2) show/hide box by state (không phụ thuộc vào checkbox UI)
  for (const key of ["tcn1_on", "tcn2_on", "tcn3_on"]) {
    const box = document.querySelector(`[data-visible-when="${key}"]`) || document.getElementById(key.replace("_on", "_box"));
    if (box) box.style.display = syncState[key] ? "block" : "none";
  }

  // 3) enable/disable OGTT input
  const ogttInput = document.getElementById("tcn2_ogtt");
  if (ogttInput) {
    ogttInput.disabled = !syncState.tcn2_ogtt_on;
    if (!syncState.tcn2_ogtt_on) ogttInput.value = "";
  }

  // 4) recompute
  updateDueDisplay();
  syncKhamThaiComputed();
}

function setStateFromCheckboxEl(el) {
  const key = el?.dataset?.sync || el?.id;
  if (!key || !(key in syncState)) return;
  syncState[key] = !!el.checked;
}

function initKhamThaiUI() {
  if (!document.getElementById('tcn1_on')) return;

  // init state from DOM
  for (const key of __TCN_KEYS__) {
    const el = document.getElementById(key);
    if (el && el.type === "checkbox") syncState[key] = !!el.checked;
  }

  // bind checkbox changes => update state, render, sync server immediately
  for (const key of __TCN_KEYS__) {
    const el = document.getElementById(key);
    if (!el) continue;

    el.addEventListener("change", () => {
      setStateFromCheckboxEl(el);
      renderFromState();

      // save ngay cho người khác thấy luôn (checkbox cần realtime)
      if (window.__SHARE_SYNC__?.enabled && !window.__SHARE_SYNC__?.applyingRemote) {
        window.__SHARE_SYNC__.saveFieldNow(key, syncState[key] ? "1" : "0");
      }
    });
  }

  // bind input changes inside TCN => cập nhật computed + nếu đang share thì save realtime (để người khác thấy)
  const realtimeIds = [
    'tcn1_sa1_date', 'tcn1_sa1_x', 'tcn1_sa1_y', 'tcn1_sa1_crl',
    'tcn1_text', 'tcn2_text', 'tcn2_ogtt', 'tcn3_text'
  ];

  for (const id of realtimeIds) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener("input", () => {
      renderFromState(); // cập nhật due + khamthai tổng hợp
      if (window.__SHARE_SYNC__?.enabled && !window.__SHARE_SYNC__?.applyingRemote) {
        window.__SHARE_SYNC__.saveFieldNow(id, el.value ?? "");
        // benhsu_khamthai là field export => cũng save
        const ta = document.getElementById("benhsu_khamthai");
        if (ta) window.__SHARE_SYNC__.saveFieldNow("benhsu_khamthai", ta.value ?? "");
      }
    });
  }

  renderFromState();
}

document.addEventListener('DOMContentLoaded', initKhamThaiUI);


// tách data ra riêng để dùng cho docx + preview
function getFormData() {
  return {
    hoten: getField('hoten'),
    namsinh: getField('namsinh'),
    tuoi: document.getElementById('tuoi')?.textContent || '-',
    para: getField('para'),
    dantoc: getField('dantoc'),
    nghenghiep: getField('nghenghiep'),
    diachi: getField('diachi'),
    ngaygio: getField('ngaygio'),
    lydo: getField('lydo'),
    tiensu: getField('tiensu'),
    benhsu_nhapvien: getField('benhsu_nhapvien'),
    benhsu_khamthai: getField('benhsu_khamthai'),
    mach: getField('mach'),
    nhietdo: getField('nhietdo'),
    ha_tren: getField('ha_tren'),
    ha_duoi: getField('ha_duoi'),
    nhiptho: getField('nhiptho'),
    chieucao: getField('chieucao'),
    cannang: getField('cannang'),
    bmi: document.getElementById('bmi')?.textContent || '-',
    phanloai: document.getElementById('phanloai')?.textContent || '-',
    tongtrang: getField('tongtrang'),
    cls_dalam: getField('cls_dalam'),

    timmach: getField('timmach'),
    hopho: getField('hopho'),
    than: getField('than'),
    thankinh: getField('thankinh'),
    cokhop: getField('cokhop'),
    coquankhac: getField('coquankhac'),

    khamchuyenkhoa: getField('khamchuyenkhoa'),

    tomtat: getField('tomtat'),
    chandoanso: getField('chandoanso'),
    chandoanpd: getField('chandoanpd'),
    cls_thuongquy: getField('cls_thuongquy'),
    cls_chuandoan: getField('cls_chuandoan'),
    ketqua: getField('ketqua'),
    chandoanxacdinh: getField('chandoanxacdinh'),
    tienluong: getField('tienluong'),
    huongdieutri: getField('huongdieutri'),
    dieutri: getField('dieutri'),
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
  <title>BỆNH ÁN SẢN KHOA - ${escapeHtml(data.hoten)}</title>
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
  <h1 class="center" style="margin:0 0 8px 0;font-size:20pt;"><b>BỆNH ÁN SẢN KHOA</b></h1>
  <p><em>Ngày làm bệnh án: ${escapeHtml(dateNow)}</em></p>

  <p style="margin-top:12px;"><b>A. PHẦN HÀNH CHÁNH</b></p>
  <p><b>1. Họ và tên:</b> ${escapeHtml(data.hoten)}</p>
  <p><b>2. Năm sinh:</b> ${escapeHtml(data.namsinh)} <span>(${escapeHtml(data.tuoi)} tuổi)</span></p>
  <p><b>3. PARA:</b> ${escapeHtml(data.para)}</p>
  <p><b>4. Dân tộc:</b> ${escapeHtml(data.dantoc)}</p>
  <p><b>5. Nghề nghiệp:</b> ${escapeHtml(data.nghenghiep)}</p>
  <p><b>6. Địa chỉ:</b> ${escapeHtml(data.diachi)}</p>
  <p><b>7. Ngày giờ vào viện:</b> ${formatNgayGio(data.ngaygio)}</p>

  <p style="margin-top:12px;"><b>B. PHẦN BỆNH ÁN</b></p>

  <p style="margin-top:6px;"><b>I. Hỏi bệnh</b></p>
  <p><b>1. Lý do vào viện:</b> ${nl2br(data.lydo)}</p>
  <p><b>2. Tiền sử:</b><br/>${nl2br(data.tiensu)}</p>
  <p><b>3. Bệnh sử:</b><br/>${nl2br(data.benhsu_nhapvien)}</p>
  <p><b>Quá trình khám thai</b><br/>${nl2br(data.benhsu_khamthai)}</p>

  <p style="margin-top:10px;"><b>II. Khám bệnh</b></p>
  <p><b>1. Toàn trạng:</b><br/>
    - Sinh hiệu: Mạch ${escapeHtml(data.mach)} lần/phút, nhiệt độ: ${escapeHtml(data.nhietdo)} °C,
      Huyết áp ${escapeHtml(data.ha_tren)}/${escapeHtml(data.ha_duoi)} mmHg, nhịp thở: ${escapeHtml(data.nhiptho)} lần/phút<br/>
    - Chiều cao: ${escapeHtml(data.chieucao)} cm, cân nặng: ${escapeHtml(data.cannang)} kg,
      BMI = ${escapeHtml(data.bmi)} kg/m² => Phân loại ${escapeHtml(data.phanloai)} theo WHO Asia<br/>
    ${nl2br(data.tongtrang)}
  </p>

  <p style="margin-top:6px;"><b>2. Các cơ quan:</b></p>
  <p><b>a) Tuần hoàn:</b><br/>${nl2br(data.timmach)}</p>
  <p><b>b) Hô hấp:</b><br/>${nl2br(data.hopho)}</p>
  <p><b>c) Thận - tiết niệu:</b><br/>${nl2br(data.than)}</p>
  <p><b>d) Thần kinh:</b><br/>${nl2br(data.thankinh)}</p>
  <p><b>e) Cơ - Xương - Khớp:</b><br/>${nl2br(data.cokhop)}</p>
  <p><b>f) Các cơ quan khác:</b> ${nl2br(data.coquankhac)}</p>

  <p style="margin-top:6px;"><b>3. Khám chuyên khoa:</b><br/>${nl2br(data.khamchuyenkhoa)}</p>

  <p style="margin-top:6px;"><b>4. Các cận lâm sàng đã làm:</b><br/>${nl2br(data.cls_dalam)}</p>

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

  <p><b>6. Tiên lượng:</b><br/>${nl2br(data.tienluong)}</p>

  <p><b>7. Điều trị:</b></p>
  <p><b>a) Hướng điều trị:</b><br/>${nl2br(data.huongdieutri)}</p>
  <p><b>b) Điều trị cụ thể:</b><br/>${nl2br(data.dieutri)}</p>

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

    // Dòng "2. Năm sinh: xxxx (xx tuổi)" -> (xx tuổi) KHÔNG đậm
    function paraNamSinhRow() {
      return new docx.Paragraph({
        ...basePara,
        children: [
          new docx.TextRun({ text: "2. Năm sinh: ", bold: true, ...runBase }),
          new docx.TextRun({ text: `${data.namsinh} `, bold: false, ...runBase }),
          new docx.TextRun({ text: `(${data.tuoi} tuổi)`, bold: false, ...runBase }),
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
                text: "BỆNH ÁN SẢN KHOA",
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
              new docx.TextRun({ text: `Ngày làm bệnh án: ${dateNow}`, italics: true, bold: false, ...runBase }),
            ],
          }),

          // A
          paraHeading("A. ", "PHẦN HÀNH CHÁNH", { spacing: { ...basePara.spacing, before: 100, after: 100 } }),
          paraLabelValue("1. Họ và tên: ", data.hoten),
          paraNamSinhRow(),
          paraLabelValue("3. PARA: ", data.para),
          paraLabelValue("4. Dân tộc: ", data.dantoc),
          paraLabelValue("5. Nghề nghiệp: ", data.nghenghiep),
          paraLabelValue("6. Địa chỉ: ", data.diachi),
          paraLabelValue("7. Ngày giờ vào viện: ", formatNgayGio(data.ngaygio), { spacing: { ...basePara.spacing, after: 120 } }),

          // B
          paraHeading("B. ", "PHẦN BỆNH ÁN", { spacing: { ...basePara.spacing, before: 180, after: 100 } }),

          paraHeading("I. ", "Hỏi bệnh", { spacing: { ...basePara.spacing, before: 120, after: 60 } }),
          ...paraLabelValueMultiline("1. Lý do vào viện: ", data.lydo),
          paraHeading("2. ", "Tiền sử:", { spacing: { ...basePara.spacing, before: 60, after: 0 } }),
          ...textToParagraphs(data.tiensu),
          paraHeading("3. ", "Bệnh sử:", { spacing: { ...basePara.spacing, before: 60, after: 0 } }),
          ...textToParagraphs(data.benhsu_nhapvien),
          paraHeading("", "Quá trình khám thai", { spacing: { ...basePara.spacing, before: 40, after: 0 } }),
          ...textToParagraphs(data.benhsu_khamthai),

          paraHeading("II. ", "Khám bệnh", { spacing: { ...basePara.spacing, before: 160, after: 60 } }),
          paraHeading("1. ", "Toàn trạng:", { spacing: { ...basePara.spacing, after: 0 } }),
          para(`- Sinh hiệu: Mạch ${data.mach} lần/phút, nhiệt độ: ${data.nhietdo}°C, HA ${data.ha_tren}/${data.ha_duoi} mmHg, nhịp thở: ${data.nhiptho} lần/phút`),
          para(`- Chiều cao: ${data.chieucao} cm, cân nặng: ${data.cannang} kg, BMI = ${data.bmi} kg/m² => Phân loại ${data.phanloai} theo WHO Asia`),
          ...textToParagraphs(data.tongtrang),

          paraHeading("2. ", "Các cơ quan:", { spacing: { ...basePara.spacing, before: 120, after: 20 } }),
          paraHeading("a) ", "Tuần hoàn:", { spacing: { ...basePara.spacing, after: 0 } }),
          ...textToParagraphs(data.timmach),

          paraHeading("b) ", "Hô hấp:", { spacing: { ...basePara.spacing, before: 40, after: 0 } }),
          ...textToParagraphs(data.hopho),

          paraHeading("c) ", "Thận - tiết niệu:", { spacing: { ...basePara.spacing, before: 40, after: 0 } }),
          ...textToParagraphs(data.than),

          paraHeading("d) ", "Thần kinh:", { spacing: { ...basePara.spacing, before: 40, after: 0 } }),
          ...textToParagraphs(data.thankinh),

          paraHeading("e) ", "Cơ - Xương - Khớp:", { spacing: { ...basePara.spacing, before: 40, after: 0 } }),
          ...textToParagraphs(data.cokhop),

          // f) label đậm, value thường
          paraLabelValue("f) Các cơ quan khác: ", data.coquankhac, { spacing: { ...basePara.spacing, before: 40, after: 0 } }),

          paraHeading("3. ", "Khám chuyên khoa:", { spacing: { ...basePara.spacing, before: 60, after: 0 } }),
          ...textToParagraphs(data.khamchuyenkhoa),

          paraHeading("4. ", "Các cận lâm sàng đã làm:", { spacing: { ...basePara.spacing, before: 60, after: 0 } }),
          ...textToParagraphs(data.cls_dalam),

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

          paraHeading("6. ", "Tiên lượng:", { spacing: { ...basePara.spacing, before: 60, after: 0 } }),
          ...textToParagraphs(data.tienluong),

          paraHeading("7. ", "Điều trị:", { spacing: { ...basePara.spacing, before: 60 } }),
          paraHeading("a) ", "Hướng điều trị:", { spacing: { ...basePara.spacing, after: 0 } }),
          ...textToParagraphs(data.huongdieutri),

          paraHeading("b) ", "Điều trị cụ thể:", { spacing: { ...basePara.spacing, before: 40, after: 0 } }),
          ...textToParagraphs(data.dieutri),

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
    document.getElementById('bmi').textContent = '-';
    document.getElementById('phanloai').textContent = '-';
    closePreview();
  }
}

// ===============================
//  TOOLBAR (Top Glass Bar)
//  - Giữ nguyên logic cũ: generateDocx / openPreview / resetForm
// ===============================
document.addEventListener('DOMContentLoaded', () => {
  const bExport = document.getElementById('btn-export');
  const bPreview = document.getElementById('btn-preview');
  const bReset = document.getElementById('btn-reset');

  if (bExport) bExport.addEventListener('click', () => generateDocx());
  if (bPreview) bPreview.addEventListener('click', () => openPreview());
  if (bReset) bReset.addEventListener('click', () => resetForm());
});

// ===============================
//  CHAT (giữ nguyên như bạn đang có)
// ===============================
const chatBubble = document.getElementById("chat-bubble");
const chatBox = document.getElementById("chat-panel");
const chatToolbarBtn = document.getElementById("btn-chat");
const chatClose = document.getElementById("chat-close");
const chatSend = document.getElementById("chat-send");
const chatInput = document.getElementById("chat-text");
const chatMessages = document.getElementById("chat-messages");

function toggleChatPanel() {
  if (!chatBox) return;
  chatBox.classList.toggle("show");
  if (chatToolbarBtn) chatToolbarBtn.setAttribute("aria-expanded", chatBox.classList.contains("show") ? "true" : "false");
}
if (chatBubble && chatBox) {
  chatBubble.onclick = toggleChatPanel;
}
if (chatToolbarBtn && chatBox) {
  chatToolbarBtn.onclick = toggleChatPanel;
}

if (chatClose && chatBox) {
  chatClose.onclick = () => {
    chatBox.classList.remove("show");
    if (chatToolbarBtn) chatToolbarBtn.setAttribute("aria-expanded", "false");
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
//  - Bấm "Chia sẻ" => tạo id 6 ký tự, gắn ?id=xxxxxx&i=1, copy link, bật sync
//  - Người mở link có id => tự bật sync
//  - Checkbox sync bằng checked (1/0) + cập nhật syncState/renderFromState để UI luôn đúng
// ===============================
(function initShareAndSync() {
  const noticeEl = document.getElementById("share-notice");
  const btnShare = document.getElementById("btn-share");
  const formEl = document.getElementById("benhanForm");

  let __CURRENT_SHARE_LINK__ = "";

  if (!noticeEl || !formEl) return;

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
    for (let i = 0; i < 6; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
    return id;
  }

  function _isCheckbox(el) {
    return el && el.tagName === "INPUT" && (el.type === "checkbox" || el.type === "radio");
  }

  function _boolFromAny(v) {
    const s = String(v ?? "").toLowerCase().trim();
    return s === "1" || s === "true" || s === "yes" || s === "on" || s === "checked";
  }

  function collectFields() {
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
      if (_isCheckbox(el)) {
        out[el.id] = el.checked ? "1" : "0";
      } else {
        out[el.id] = (el.value ?? "");
      }
    }
    return out;
  }

  function applyData(dataObj) {
    if (!dataObj || typeof dataObj !== "object") return;
    __SYNC.applyingRemote = true;
    try {
      let touchedState = false;

      for (const el of collectFields()) {
        if (!(el.id in dataObj)) continue;

        // ✅ checkbox/radio: luôn overwrite để UI sync 100%
        if (_isCheckbox(el)) {
          const newChecked = _boolFromAny(dataObj[el.id]);
          if (el.checked !== newChecked) {
            el.checked = newChecked;
            if (el.id in syncState) { syncState[el.id] = newChecked; touchedState = true; }
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
          continue;
        }

        // input/textarea/select bình thường: không overwrite field đang focus
        if (document.activeElement === el) continue;

        const v = dataObj[el.id] ?? "";
        if (el.value !== v) {
          el.value = v;

          // Select mẫu: đổ vào textarea tương ứng
          if (el.tagName === "SELECT") {
            const mappedTextareaId = __SELECT_TO_TEXTAREA__[el.id];
            if (mappedTextareaId) _setTextareaFromSelect(el.id, mappedTextareaId, { silentSync: true });
          }

          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }

      if (touchedState) renderFromState();
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
    lastSaved: new Map(),
  
    _norm(v) { return String(v ?? ""); },
  
    async enable(id, { showSharedMsg = false } = {}) {
      if (this.enabled) return;
      this.enabled = true;
      this.recordId = String(id);
  
      // expose for helpers (dropdown + realtime checkbox)
      window.__SHARE_SYNC__ = {
        enabled: true,
        get applyingRemote() { return __SYNC.applyingRemote; },
        saveFieldNow: (field, value, opts) => this.saveFieldNow(field, value, opts),
  };
  
      setNotice(`Đang kết nối để chia sẻ bệnh án ID <b>${escapeHtml(this.recordId)}</b>...`, true);
  
      // 1) load
      let server;
      try {
        server = await API.load(this.recordId);
      } catch (e) {
        setNotice(`⚠️ Không tải được dữ liệu đồng bộ. (${escapeHtml(e.message || String(e))})`, true);
        return;
      }
  
      this.baseVersion = Number(server?.version || 0);
      this.lastUpdId = Number(server?.last_upd_id || 0);
  
      // 2) merge: ưu tiên local (field trống mới lấy server)
      const local = snapshotData();
      const merged = { ...server?.data };
      for (const [k, v] of Object.entries(local)) {
        if (v && String(v).trim() !== "") merged[k] = v;
      }
      applyData(merged);
  
      // cache "đã lưu"
      this.lastSaved = new Map(Object.entries(snapshotData()).map(([k, v]) => [k, this._norm(v)]));
  
      // 3) push local lên server
      const payload = snapshotData();
      try {
        await API.saveBulk(this.recordId, payload, this.baseVersion);
        this.lastSaved = new Map(Object.entries(payload).map(([k, v]) => [k, this._norm(v)]));
      } catch (_) {
        for (const [k, v] of Object.entries(payload)) {
          // luôn push checkbox, còn text thì chỉ push nếu có dữ liệu
          const isCb = __TCN_KEYS__.includes(k) || (document.getElementById(k)?.type === "checkbox");
          if (!isCb && (!v || String(v).trim() === "")) continue;
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
            Gửi link phía trên cho mọi người để làm bệnh án cùng nhau. Bệnh án sẽ tự động xóa sau <b>3 ngày</b> không truy cập
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
  
      // 4) bind + poll
      this.bindFieldEvents();
  
      document.addEventListener("visibilitychange", () => {
        this.tabActive = !document.hidden;
        if (!this.enabled) return;
        if (!this.tabActive) this.stopPolling();
        else this.startPolling({ immediate: true });
      });
  
      this.startPolling({ immediate: true });
    },
  
    bindFieldEvents() {
      for (const el of collectFields()) {
        // checkbox/radio: save ngay khi change
        if (_isCheckbox(el)) {
          el.addEventListener("change", () => {
            if (!this.enabled || this.applyingRemote) return;
            const val = el.checked ? "1" : "0";
            this.saveFieldNow(el.id, val, { force: true });
          });
          continue;
        }
  
        // input/textarea: lưu khi blur + change
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          el.addEventListener("blur", () => {
            if (!this.enabled || this.applyingRemote) return;
            this.saveFieldNow(el.id, el.value);
          });
          el.addEventListener("change", () => {
            if (!this.enabled || this.applyingRemote) return;
            this.saveFieldNow(el.id, el.value);
          });
        }
  
        // select: lưu khi change (nếu là select mẫu thì lưu textarea)
        if (el.tagName === "SELECT") {
          const mappedTextareaId = __SELECT_TO_TEXTAREA__[el.id];
          if (mappedTextareaId) {
            el.addEventListener("change", () => {
              if (!this.enabled || this.applyingRemote) return;
              _setTextareaFromSelect(el.id, mappedTextareaId);
            });
          } else {
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
      // không có hint => giữ nguyên
    },
  
    bumpActivity() {
      // Gọi khi có thao tác local hoặc khi nhận remote update
      this.lastActivityAt = Date.now();
  
      // Nếu đang ở chế độ idle (poll lâu), lập tức chuyển về poll nhanh
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
  
    async saveFieldNow(field, value, { force = false } = {}) {
      // local change -> quay về poll nhanh
      this.bumpActivity();
  
      if (!this.enabled || !this.recordId) return;
  
      const v = this._norm(value);
      const prev = this.lastSaved.get(field);
      if (!force && prev !== undefined && prev === v) return;
  
      try {
        const resp = await API.saveField(this.recordId, field, v, this.baseVersion);
  
        if (resp?.ok) {
          this.baseVersion = Number(resp.version || this.baseVersion);
          if (resp.upd_id) this.lastUpdId = Math.max(this.lastUpdId, Number(resp.upd_id));
          this.lastSaved.set(field, v);
  
        } else if (resp?.conflict) {
          this.baseVersion = Number(resp.server_version || this.baseVersion);
          const serverVal = this._norm(resp.server_value ?? "");
          this.lastSaved.set(field, serverVal);
  
          const el = document.getElementById(field);
          if (!el) return;
  
          this.applyingRemote = true;
  
          if (_isCheckbox(el)) {
            const newChecked = _boolFromAny(serverVal);
            el.checked = newChecked;
            if (field in syncState) syncState[field] = newChecked;
            renderFromState();
          } else if (document.activeElement !== el) {
            el.value = serverVal;
  
            // select mẫu: đổ lại textarea tương ứng nhưng không sync ngược
            if (el.tagName === "SELECT") {
              const mappedTextareaId = __SELECT_TO_TEXTAREA__[el.id];
              if (mappedTextareaId) {
                _setTextareaFromSelect(el.id, mappedTextareaId, { silentSync: true });
                const ta = document.getElementById(mappedTextareaId);
                if (ta) this.lastSaved.set(mappedTextareaId, this._norm(ta.value));
              }
            }
  
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
  
          this.applyingRemote = false;
        }
      } catch (e) {
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
  
    startPolling({ immediate = false } = {}) {
      this.stopPolling();
      const cfg = this.pollCfg;
  
      const tick = async () => {
        this.pollTimer = null;
        if (!this.enabled || !this.recordId) return;
  
        // ✅ tắt poll khi tab không active
        if (!this.tabActive) return;
  
        let touchedState = false;
  
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
  
              const newVal = this._norm(u.field_value ?? "");
              this.lastSaved.set(u.field_key, newVal);
  
              this.applyingRemote = true;
  
              if (_isCheckbox(el)) {
                const newChecked = _boolFromAny(newVal);
                if (el.checked !== newChecked) el.checked = newChecked;
                if (u.field_key in syncState) { syncState[u.field_key] = newChecked; touchedState = true; }
                el.dispatchEvent(new Event("change", { bubbles: true }));
  
              } else {
                if (document.activeElement === el) { this.applyingRemote = false; continue; }
  
                if (el.value !== newVal) el.value = newVal;
  
                // select mẫu -> đổ lại textarea
                if (el.tagName === "SELECT") {
                  const mappedTextareaId = __SELECT_TO_TEXTAREA__[el.id];
                  if (mappedTextareaId) {
                    _setTextareaFromSelect(el.id, mappedTextareaId, { silentSync: true });
                    const ta = document.getElementById(mappedTextareaId);
                    if (ta) this.lastSaved.set(mappedTextareaId, this._norm(ta.value));
                  }
                }
  
                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
              }
  
              this.applyingRemote = false;
            }
          }
        } catch (e) {
          console.warn("poll error", e);
        } finally {
          if (touchedState) renderFromState();
  
          if (!this.enabled || !this.recordId) return;
          if (!this.tabActive) return;
  
          const idleFor = Date.now() - (this.lastActivityAt || 0);
          const nextMs = (idleFor >= cfg.idleAfter)
            ? cfg.idle
            : ((this.othersOnline === true) ? cfg.active : cfg.probe);
  
          this.pollTimer = setTimeout(tick, nextMs);
        }
  };
  
      this._tickFn = tick;
      this.pollTimer = setTimeout(tick, immediate ? 0 : (cfg.active || 3000));
    }
  };

  // ---------- UI actions ----------
  async function onShareClick() {
    let id = getParam("id");
    if (!id) id = genId6();

    const shareLink = setUrlParams({ id, i: null });
    __CURRENT_SHARE_LINK__ = shareLink;

    try { await navigator.clipboard.writeText(shareLink); } catch (_) {}

    await __SYNC.enable(id, { showSharedMsg: true });
  }

  if (btnShare) btnShare.addEventListener("click", onShareClick);

  // ---------- Auto-enable when opened from shared link ----------
  const id = getParam("id");
  const i = getParam("i");
  if (id) {
    if (i !== null && i !== undefined) setUrlParams({ i: null });
    __SYNC.enable(id, { showSharedMsg: false });
  } else {
    setNotice("", false);
  }
})();

