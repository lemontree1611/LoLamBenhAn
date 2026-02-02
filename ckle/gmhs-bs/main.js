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
//  HELPERS
// ===============================
function getField(id) {
  return (document.getElementById(id)?.value || "").trim();
}

function getRadioValue(name) {
  if (!name) return "";
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return (el?.value || "").trim();
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

function formatDate(val) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return escapeHtml(val);
  const dd = String(d.getDate()).padStart(2, '0');
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${MM}/${yyyy}`;
}

// ===============================
//  DYNAMIC TABLES (Diễn tiến / Huyết học / Sinh hóa)
//  - Lưu về hidden JSON (#dientien_json, #hem_json, #bio_json) để export + share
// ===============================
const DEFAULT_HEM = ["WBC", "NEU", "RBC", "HGB", "HCT", "PLT", "PT", "INR", "aPTT", "Nhóm máu"];
const DEFAULT_BIO = ["Glucose", "Creatinin", "eGFR", "AST", "ALT", "Na+", "K+", "Cl-"];

function _ensureArray(x) {
  return Array.isArray(x) ? x : [];
}

function _safeParseJson(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function _setHiddenJson(id, arr) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = JSON.stringify(_ensureArray(arr));
  // trigger share sync
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function _getHiddenJson(id) {
  const el = document.getElementById(id);
  if (!el) return [];
  const v = (el.value || "").trim();
  if (!v) return [];
  const parsed = _safeParseJson(v);
  return _ensureArray(parsed);
}

// ---- Diễn tiến table
function addDienTienRow(row = { time: "", dien_tien: "", xu_tri: "" }) {
  const tb = document.getElementById("dientienTableBody");
  if (!tb) return;

  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="text" class="dt-time" placeholder="VD: 08:00 / 01-02-2026" value="${escapeHtml(row.time || "")}"/></td>
    <td><textarea class="dt-dien" rows="2" placeholder="Diễn tiến...">${escapeHtml(row.dien_tien || "")}</textarea></td>
    <td><textarea class="dt-xutri" rows="2" placeholder="Xử trí...">${escapeHtml(row.xu_tri || "")}</textarea></td>
    <td style="text-align:right;">
      <button type="button" class="tb-btn btn-del-row" title="Xóa hàng">- Xóa</button>
    </td>
  `;
  tb.appendChild(tr);

  tr.querySelector(".btn-del-row")?.addEventListener("click", () => {
    tr.remove();
    syncDienTienJsonFromTable();
  });

  tr.querySelectorAll("input,textarea").forEach(el => {
    el.addEventListener("input", syncDienTienJsonFromTable);
    el.addEventListener("change", syncDienTienJsonFromTable);
  });

  syncDienTienJsonFromTable();
}

function syncDienTienJsonFromTable() {
  const tb = document.getElementById("dientienTableBody");
  if (!tb) return;
  const rows = Array.from(tb.querySelectorAll("tr")).map(tr => ({
    time: tr.querySelector(".dt-time")?.value || "",
    dien_tien: tr.querySelector(".dt-dien")?.value || "",
    xu_tri: tr.querySelector(".dt-xutri")?.value || "",
  }));
  _setHiddenJson("dientien_json", rows);
}

function loadDienTienFromHidden() {
  const rows = _getHiddenJson("dientien_json");
  const tb = document.getElementById("dientienTableBody");
  if (!tb) return;
  tb.innerHTML = "";
  if (rows.length) rows.forEach(r => addDienTienRow(r));
  else addDienTienRow(); // 1 hàng mặc định
}

// ---- Lab tables (2 cột)
function _addLabRow(tbodyId, syncFn, row = { name: "", value: "" }, opts = { readonlyName: false }) {
  const tb = document.getElementById(tbodyId);
  if (!tb) return;

  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>
      <input type="text" class="lab-name" value="${escapeHtml(row.name || "")}" ${opts.readonlyName ? "readonly" : ""} />
    </td>
    <td>
      <input type="text" class="lab-value" value="${escapeHtml(row.value || "")}" placeholder="Nhập kết quả..." />
    </td>
    <td style="text-align:right;">
      <button type="button" class="tb-btn btn-del-row" title="Xóa hàng">- Xóa</button>
    </td>
  `;
  tb.appendChild(tr);

  tr.querySelector(".btn-del-row")?.addEventListener("click", () => {
    tr.remove();
    syncFn();
  });

  tr.querySelectorAll("input").forEach(el => {
    el.addEventListener("input", syncFn);
    el.addEventListener("change", syncFn);
  });

  syncFn();
}

function syncHemJsonFromTable() {
  const tb = document.getElementById("hemTableBody");
  if (!tb) return;
  const rows = Array.from(tb.querySelectorAll("tr")).map(tr => ({
    name: tr.querySelector(".lab-name")?.value || "",
    value: tr.querySelector(".lab-value")?.value || "",
  }));
  _setHiddenJson("hem_json", rows);
}

function syncBioJsonFromTable() {
  const tb = document.getElementById("bioTableBody");
  if (!tb) return;
  const rows = Array.from(tb.querySelectorAll("tr")).map(tr => ({
    name: tr.querySelector(".lab-name")?.value || "",
    value: tr.querySelector(".lab-value")?.value || "",
  }));
  _setHiddenJson("bio_json", rows);
}

function loadHemFromHidden() {
  const rows = _getHiddenJson("hem_json");
  const tb = document.getElementById("hemTableBody");
  if (!tb) return;
  tb.innerHTML = "";

  if (rows.length) {
    rows.forEach(r => _addLabRow("hemTableBody", syncHemJsonFromTable, r, { readonlyName: false }));
  } else {
    DEFAULT_HEM.forEach(name => _addLabRow("hemTableBody", syncHemJsonFromTable, { name, value: "" }, { readonlyName: true }));
  }
}

function loadBioFromHidden() {
  const rows = _getHiddenJson("bio_json");
  const tb = document.getElementById("bioTableBody");
  if (!tb) return;
  tb.innerHTML = "";

  if (rows.length) {
    rows.forEach(r => _addLabRow("bioTableBody", syncBioJsonFromTable, r, { readonlyName: false }));
  } else {
    DEFAULT_BIO.forEach(name => _addLabRow("bioTableBody", syncBioJsonFromTable, { name, value: "" }, { readonlyName: true }));
  }
}

// Buttons add row
document.getElementById("btn-add-dientien")?.addEventListener("click", () => addDienTienRow());
document.getElementById("btn-add-hem")?.addEventListener("click", () => _addLabRow("hemTableBody", syncHemJsonFromTable, { name: "", value: "" }, { readonlyName: false }));
document.getElementById("btn-add-bio")?.addEventListener("click", () => _addLabRow("bioTableBody", syncBioJsonFromTable, { name: "", value: "" }, { readonlyName: false }));

// Init tables on load
document.addEventListener("DOMContentLoaded", () => {
  loadDienTienFromHidden();
  loadHemFromHidden();
  loadBioFromHidden();
  try { tinhBMI(); } catch (_) {}
});

// ===============================
//  tách data ra riêng để dùng cho docx + preview
// ===============================
function getFormData() {
  return {
    // I
    hoten: getField('hoten'),
    namsinh: getField('namsinh'),
    tuoi: document.getElementById('tuoi')?.textContent || '-',
    chandoan: getField('chandoan'),
    pp_phauthuat: getField('pp_phauthuat'),
    ngay_phauthuat: getField('ngay_phauthuat'),
    pp_vocam: getField('pp_vocam'),
    tg_phauthuat: getField('tg_phauthuat'),
    tg_gayme: getField('tg_gayme'),

    // II-III
    tiensu: getField('tiensu'),
    benhsu: getField('benhsu'),

    // IV
    dientien_rows: _getHiddenJson("dientien_json"),

    // V
    hem_rows: _getHiddenJson("hem_json"),
    bio_rows: _getHiddenJson("bio_json"),
    ecg: getField('ecg'),
    xquang: getField('xquang'),
    canlamsang_khac: getField('canlamsang_khac'),

    // VI
    mach: getField('mach'),
    nhietdo: getField('nhietdo'),
    ha_tren: getField('ha_tren'),
    ha_duoi: getField('ha_duoi'),
    nhiptho: getField('nhiptho'),
    chieucao: getField('chieucao'),
    cannang: getField('cannang'),
    bmi: document.getElementById('bmi')?.textContent || '-',
    phanloai: document.getElementById('phanloai')?.textContent || '-',
    asa: getRadioValue('asa'),
    mallampati: getRadioValue('mallampati'),
    kham_tienme: getField('kham_tienme'),

    // VII-XII
    nguyco: getField('nguyco'),
    vande_luuy: getField('vande_luuy'),
    tinhtrang_phongmo: getField('tinhtrang_phongmo'),
    kehoach_truocgayme: getField('kehoach_truocgayme'),
    tuongtrinh_phauthuat: getField('tuongtrinh_phauthuat'),
    hoisuc: getField('hoisuc'),
  };
}

// ===============================
//  BUILD HTML (for Preview iframe)
// ===============================
function buildHTMLDoc() {
  const data = getFormData();
  const dateNow = new Date().toLocaleString('vi-VN');

  const dientienHtml = (data.dientien_rows || []).map((r, i) => `
    <tr>
      <td>${escapeHtml(r.time || "")}</td>
      <td>${nl2br(r.dien_tien || "")}</td>
      <td>${nl2br(r.xu_tri || "")}</td>
    </tr>
  `).join("");

  const hemHtml = (data.hem_rows || []).map(r => `
    <tr><td>${escapeHtml(r.name || "")}</td><td>${escapeHtml(r.value || "")}</td></tr>
  `).join("");

  const bioHtml = (data.bio_rows || []).map(r => `
    <tr><td>${escapeHtml(r.name || "")}</td><td>${escapeHtml(r.value || "")}</td></tr>
  `).join("");

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>BỆNH ÁN - ${escapeHtml(data.hoten)}</title>
<style>
  @page { size: A4; margin: 2cm; }
  body { font-family: "Times New Roman", serif; font-size: 14pt; line-height: 1.5; padding: 2cm; margin: 0; box-sizing: border-box; }
  p { margin: 0; }
  b { font-weight: 700; }
  .center { text-align: center; }
  table { width:100%; border-collapse: collapse; margin-top:6px; }
  th, td { border: 1px solid #000; padding: 6px; vertical-align: top; }
  @media (max-width: 768px) { body { padding: 1cm; } }
</style>
</head>
<body>
  <h1 class="center" style="margin:0 0 8px 0;font-size:20pt;"><b>BỆNH ÁN GÂY MÊ HỒI SỨC</b></h1>
  <p><em>Ngày làm bệnh án: ${escapeHtml(dateNow)}</em></p>

  <p style="margin-top:12px;"><b>I. HÀNH CHÍNH</b></p>
  <p><b>1. Họ và tên:</b> ${escapeHtml(data.hoten)}</p>
  <p><b>2. Năm sinh:</b> ${escapeHtml(data.namsinh)} <span>(${escapeHtml(data.tuoi)} tuổi)</span></p>
  <p><b>3. Chẩn đoán:</b> ${escapeHtml(data.chandoan)}</p>
  <p><b>4. Phương pháp phẫu thuật:</b> ${escapeHtml(data.pp_phauthuat)}</p>
  <p><b>5. Ngày phẫu thuật:</b> ${formatDate(data.ngay_phauthuat)}</p>
  <p><b>6. Phương pháp vô cảm:</b> ${escapeHtml(data.pp_vocam)}</p>
  <p><b>7. Thời gian phẫu thuật:</b> ${escapeHtml(data.tg_phauthuat)}</p>
  <p><b>8. Thời gian gây mê:</b> ${escapeHtml(data.tg_gayme)}</p>

  <p style="margin-top:12px;"><b>II. TIỀN SỬ</b></p>
  <p>${nl2br(data.tiensu)}</p>

  <p style="margin-top:12px;"><b>III. BỆNH SỬ</b></p>
  <p>${nl2br(data.benhsu)}</p>

  <p style="margin-top:12px;"><b>IV. DIỄN TIẾN TRƯỚC PHẪU THUẬT</b></p>
  <table>
    <thead><tr><th style="width:18%;">Thời gian</th><th>Diễn tiến</th><th>Xử trí</th></tr></thead>
    <tbody>${dientienHtml || ""}</tbody>
  </table>

  <p style="margin-top:12px;"><b>V. CẬN LÂM SÀNG</b></p>
  <p>1. Huyết học</p>
  <table>
    <thead><tr><th style="width:40%;">Chỉ số</th><th>Kết quả</th></tr></thead>
    <tbody>${hemHtml || ""}</tbody>
  </table>

  <p style="margin-top:10px;">2. Sinh hóa máu</p>
  <table>
    <thead><tr><th style="width:40%;">Chỉ số</th><th>Kết quả</th></tr></thead>
    <tbody>${bioHtml || ""}</tbody>
  </table>

  <p style="margin-top:10px;">3. ECG:<br/>${nl2br(data.ecg)}</p>
  <p style="margin-top:6px;">4. Xquang ngực thẳng:<br/>${nl2br(data.xquang)}</p>
  <p style="margin-top:6px;">${nl2br(data.canlamsang_khac)}</p>

  <p style="margin-top:12px;"><b>VI. KHÁM LÂM SÀNG</b></p>
  <p>- Sinh hiệu: Mạch ${escapeHtml(data.mach)} lần/phút, nhiệt độ ${escapeHtml(data.nhietdo)} °C,
    HA ${escapeHtml(data.ha_tren)}/${escapeHtml(data.ha_duoi)} mmHg, nhịp thở ${escapeHtml(data.nhiptho)} lần/phút</p>
  <p>- Chiều cao ${escapeHtml(data.chieucao)} cm, cân nặng ${escapeHtml(data.cannang)} kg,
    BMI ${escapeHtml(data.bmi)} kg/m² (Phân loại ${escapeHtml(data.phanloai)} theo WHO Asia)</p>
  <p style="margin-top:8px;"><b>Khám tiền mê:</b> ASA ${escapeHtml(data.asa)}; Mallampati ${escapeHtml(data.mallampati)}</p>
  <p>${nl2br(data.kham_tienme)}</p>

  <p style="margin-top:12px;"><b>VII. NGUY CƠ</b></p>
  <p>${nl2br(data.nguyco)}</p>

  <p style="margin-top:12px;"><b>VIII. VẤN ĐỀ CẦN LƯU Ý</b></p>
  <p>${nl2br(data.vande_luuy)}</p>

  <p style="margin-top:12px;"><b>IX. TÌNH TRẠNG NGƯỜI BỆNH LÚC NHẬN TẠI PHÒNG MỔ</b></p>
  <p>${nl2br(data.tinhtrang_phongmo)}</p>

  <p style="margin-top:12px;"><b>X. CHUẨN BỊ KẾ HOẠCH TRƯỚC GÂY MÊ</b></p>
  <p>${nl2br(data.kehoach_truocgayme)}</p>

  <p style="margin-top:12px;"><b>XI. TƯỜNG TRÌNH PHẪU THUẬT</b></p>
  <p>${nl2br(data.tuongtrinh_phauthuat)}</p>

  <p style="margin-top:12px;"><b>XII. HỒI SỨC</b></p>
  <p>${nl2br(data.hoisuc)}</p>
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

    function paraHeading(text, opts = {}) {
      return new docx.Paragraph({
        ...basePara,
        ...opts,
        children: [ new docx.TextRun({ text: text || "", bold: true, ...runBase }) ],
      });
    }

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

    function textToParagraphs(text) {
      if (!text) return [para("")];
      return String(text).split(/\r?\n/).map(line => para(line));
    }

    function buildLinesFromRows(rows, formatter) {
      const arr = Array.isArray(rows) ? rows : [];
      if (!arr.length) return [para("")];
      return arr.map((r, idx) => para(formatter(r, idx)));
    }

    function fmtDateDDMMYYYY(val) {
      if (!val) return "";
      const d = new Date(val);
      if (isNaN(d.getTime())) return String(val);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
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
          new docx.Paragraph({
            alignment: docx.AlignmentType.CENTER,
            spacing: { after: 200, line: LINE_15, lineRule: docx.LineRuleType.AUTO },
            children: [
              new docx.TextRun({
                text: "BỆNH ÁN GÂY MÊ HỒI SỨC",
                bold: true,
                font: "Times New Roman",
                size: TITLE_SIZE,
              }),
            ],
          }),
          new docx.Paragraph({
            ...basePara,
            spacing: { ...basePara.spacing, after: 200 },
            children: [
              new docx.TextRun({ text: `Xuất: ${dateNow}`, italics: true, bold: false, ...runBase }),
            ],
          }),

          // I
          paraHeading("I. HÀNH CHÍNH", { spacing: { ...basePara.spacing, before: 120, after: 60 } }),
          paraLabelValue("1. Họ và tên: ", data.hoten),
          new docx.Paragraph({
            ...basePara,
            children: [
              new docx.TextRun({ text: "2. Năm sinh: ", bold: true, ...runBase }),
              new docx.TextRun({ text: `${data.namsinh} `, bold: false, ...runBase }),
              new docx.TextRun({ text: `(${data.tuoi} tuổi)`, bold: false, ...runBase }),
            ],
          }),
          paraLabelValue("3. Chẩn đoán: ", data.chandoan),
          paraLabelValue("4. Phương pháp phẫu thuật: ", data.pp_phauthuat),
          paraLabelValue("5. Ngày phẫu thuật: ", fmtDateDDMMYYYY(data.ngay_phauthuat)),
          paraLabelValue("6. Phương pháp vô cảm: ", data.pp_vocam),
          paraLabelValue("7. Thời gian phẫu thuật: ", data.tg_phauthuat),
          paraLabelValue("8. Thời gian gây mê: ", data.tg_gayme),

          // II
          paraHeading("II. TIỀN SỬ", { spacing: { ...basePara.spacing, before: 160, after: 40 } }),
          ...textToParagraphs(data.tiensu),

          // III
          paraHeading("III. BỆNH SỬ", { spacing: { ...basePara.spacing, before: 160, after: 40 } }),
          ...textToParagraphs(data.benhsu),

          // IV
          paraHeading("IV. DIỄN TIẾN TRƯỚC PHẪU THUẬT", { spacing: { ...basePara.spacing, before: 160, after: 40 } }),
          ...buildLinesFromRows(data.dientien_rows, (r, i) => {
            const t = (r?.time || "").trim();
            const d = (r?.dien_tien || "").trim().replace(/\s+/g, " ");
            const x = (r?.xu_tri || "").trim().replace(/\s+/g, " ");
            return `- ${t ? (t + ": ") : ""}${d}${x ? (" | Xử trí: " + x) : ""}`;
          }),

          // V
          paraHeading("V. CẬN LÂM SÀNG", { spacing: { ...basePara.spacing, before: 160, after: 40 } }),
          para("1. Huyết học", { spacing: { ...basePara.spacing, before: 80, after: 20 } }),
          ...buildLinesFromRows(data.hem_rows, (r) => `${(r?.name || "").trim()}: ${(r?.value || "").trim()}`),

          para("2. Sinh hóa máu", { spacing: { ...basePara.spacing, before: 120, after: 20 } }),
          ...buildLinesFromRows(data.bio_rows, (r) => `${(r?.name || "").trim()}: ${(r?.value || "").trim()}`),

          para("3. ECG", { spacing: { ...basePara.spacing, before: 120, after: 20 } }),
          ...textToParagraphs(data.ecg),

          para("4. Xquang ngực thẳng", { spacing: { ...basePara.spacing, before: 120, after: 20 } }),
          ...textToParagraphs(data.xquang),

          ...textToParagraphs(data.canlamsang_khac),

          // VI
          paraHeading("VI. KHÁM LÂM SÀNG", { spacing: { ...basePara.spacing, before: 160, after: 40 } }),
          para(`- Sinh hiệu: Mạch ${data.mach} lần/phút, nhiệt độ ${data.nhietdo} °C, HA ${data.ha_tren}/${data.ha_duoi} mmHg, nhịp thở ${data.nhiptho} lần/phút`),
          para(`- Chiều cao ${data.chieucao} cm, cân nặng ${data.cannang} kg, BMI ${data.bmi} kg/m² (Phân loại ${data.phanloai} theo WHO Asia)`),
          para(`- Khám tiền mê: ASA ${data.asa}; Mallampati ${data.mallampati}`),
          ...textToParagraphs(data.kham_tienme),

          // VII-XII
          paraHeading("VII. NGUY CƠ", { spacing: { ...basePara.spacing, before: 160, after: 40 } }),
          ...textToParagraphs(data.nguyco),

          paraHeading("VIII. VẤN ĐỀ CẦN LƯU Ý", { spacing: { ...basePara.spacing, before: 160, after: 40 } }),
          ...textToParagraphs(data.vande_luuy),

          paraHeading("IX. TÌNH TRẠNG NGƯỜI BỆNH LÚC NHẬN TẠI PHÒNG MỔ", { spacing: { ...basePara.spacing, before: 160, after: 40 } }),
          ...textToParagraphs(data.tinhtrang_phongmo),

          paraHeading("X. CHUẨN BỊ KẾ HOẠCH TRƯỚC GÂY MÊ", { spacing: { ...basePara.spacing, before: 160, after: 40 } }),
          ...textToParagraphs(data.kehoach_truocgayme),

          paraHeading("XI. TƯỜNG TRÌNH PHẪU THUẬT", { spacing: { ...basePara.spacing, before: 160, after: 40 } }),
          ...textToParagraphs(data.tuongtrinh_phauthuat),

          paraHeading("XII. HỒI SỨC", { spacing: { ...basePara.spacing, before: 160, after: 40 } }),
          ...textToParagraphs(data.hoisuc),
        ],
      }],
    });

    const blob = await docx.Packer.toBlob(doc);
    saveAs(blob, `${data.hoten || 'benhan_gmhs'}.docx`);
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

    document.getElementById('benhanForm')?.reset();
    document.getElementById('tuoi').textContent = '-';
    document.getElementById('bmi').textContent = '-';
    document.getElementById('phanloai').textContent = '-';

    // reset tables về mặc định
    document.getElementById("dientien_json").value = "[]";
    document.getElementById("hem_json").value = "";
    document.getElementById("bio_json").value = "";
    loadDienTienFromHidden();
    loadHemFromHidden();
    loadBioFromHidden();

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
//  CHAT (giữ nguyên, chỉ đổi context lấy từ form mới)
// ===============================
const chatToggleBtn = document.getElementById("btn-chat");
const chatBox = document.getElementById("chat-panel");
const chatClose = document.getElementById("chat-close");
const chatSend = document.getElementById("chat-send");
const chatInput = document.getElementById("chat-text");
const chatMessages = document.getElementById("chat-messages");

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

const SYSTEM_PROMPT = `
Bạn tên là LÒ. Bạn là người máy hỗ trợ hoàn thành bệnh án.
Mình có thể tìm lý thuyết bệnh học, hỗ trợ biện luận và đưa ra ý kiến để giúp bạn hoàn thành bệnh án tốt nhất.
`;

let CHAT_MEMORY_MODE = 1;
const CHAT_STORAGE_KEY = "lo_chat_history_v1";

function getStorageByMode(mode) {
  if (mode === 2) return window.sessionStorage;
  if (mode === 3) return window.localStorage;
  return null;
}

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

  const MAX_MSG = 30;
  const trimmed = chatHistory.slice(-MAX_MSG);

  if (trimmed[0]?.role !== "system") {
    trimmed.unshift({ role: "system", content: SYSTEM_PROMPT });
  }

  chatHistory.length = 0;
  chatHistory.push(...trimmed);

  try {
    store.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatHistory));
  } catch (_) {}
}

function buildFormContextForBot() {
  const chandoan = (document.getElementById("chandoan")?.value || "").trim();
  const benhsu = (document.getElementById("benhsu")?.value || "").trim();

  if (!chandoan && !benhsu) return "";

  return `
DỮ LIỆU TỪ FORM (tham khảo khi trả lời):
- Chẩn đoán: ${chandoan || "(chưa có)"}
- Bệnh sử: ${benhsu || "(chưa có)"}
`.trim();
}

async function sendMessage() {
  if (!chatInput || !chatMessages || !chatSend) return;

  const text = chatInput.value.trim();
  if (!text) return;

  chatMessages.innerHTML += `<div class="msg user">${escapeHtml(text)}</div>`;
  chatInput.value = "";
  chatMessages.scrollTop = chatMessages.scrollHeight;

  chatInput.disabled = true;
  chatSend.disabled = true;

  const loadingEl = document.createElement("div");
  loadingEl.className = "msg loading";
  loadingEl.innerHTML = `
    <span class="loading-text">Đang soạn tin</span>
    <span class="typing-dots"><span></span><span></span><span></span></span>
  `;
  chatMessages.appendChild(loadingEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  const timeoutId = setTimeout(() => {
    const textEl = loadingEl.querySelector(".loading-text");
    if (textEl) textEl.textContent = "Bạn đợi xíu nhe";
  }, 10000);

  try {
    const formContext = buildFormContextForBot();
    const userContent = formContext ? (formContext + "\n\nCâu hỏi: " + text) : text;

    chatHistory.push({ role: "user", content: userContent });
    saveChatHistory();

    const response = await fetch(CHAT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chatHistory })
    });

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

    const reply = (data && typeof data.answer === "string" && data.answer.trim())
      ? data.answer.trim()
      : "Bot không trả lời.";

    clearTimeout(timeoutId);
    loadingEl.remove();

    chatHistory.push({ role: "assistant", content: reply });
    saveChatHistory();

    const html = marked.parse(reply);
    chatMessages.innerHTML += `
      <div class="msg bot markdown-body">
        ${html}
      </div>
    `;
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
//  - Giữ nguyên logic share/lock hiện có
//  - NOTE: dynamic rows sync qua hidden JSON fields
// ===============================
(function initShareWebSocket() {
  const WS_URL = "wss://lolambenhan.onrender.com";

  const noticeEl = document.getElementById("share-notice");
  const btnShare = document.getElementById("btn-share");
  const formEl = document.getElementById("benhanForm");

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

    const inRoom = !!state.room;

    if (!inRoom) {
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
    clientId: (crypto?.randomUUID?.() || ("c_" + Math.random().toString(36).slice(2))),
    locks: {},
    onlineCount: null,
  };

  function setNotice(html, show = true) {
    if (!noticeEl) return;
    noticeEl.innerHTML = html || "";
    noticeEl.style.display = show ? "block" : "none";
  }

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

  function getLockerLabel(by) {
    return by ? by.slice(0, 6) : "người khác";
  }

  function sendLock(fieldId) {
    if (!state.connected || !fieldId) return;
    wsSend({ type: "lock", fieldId, by: state.clientId, at: Date.now() });
  }

  function sendUnlock(fieldId) {
    if (!state.connected || !fieldId) return;
    wsSend({ type: "unlock", fieldId, by: state.clientId, at: Date.now() });
  }

  function setFieldLockedUI(fieldId, locked, byWho) {
    const el = document.getElementById(fieldId);
    if (!el) return;

    if (document.activeElement === el) return;

    if (locked) {
      el.disabled = true;
      el.classList.add("is-locked");
      el.setAttribute("data-locked-by", byWho || "");

      const oldPh = el.getAttribute("data-old-placeholder");
      if (oldPh === null) el.setAttribute("data-old-placeholder", el.placeholder || "");

      const who = getLockerLabel(byWho);
      el.placeholder = `Đang được sửa bởi ${who}`;
    } else {
      el.disabled = false;
      el.classList.remove("is-locked");
      el.removeAttribute("data-locked-by");

      const old = el.getAttribute("data-old-placeholder");
      if (old !== null) el.placeholder = old;
      el.removeAttribute("data-old-placeholder");
    }
  }

  function applyLocks(locksObj) {
    if (!locksObj || typeof locksObj !== "object") return;
    state.locks = { ...locksObj };
    for (const [fieldId, meta] of Object.entries(state.locks)) {
      if (!meta || meta.by === state.clientId) continue;
      setFieldLockedUI(fieldId, true, meta.by);
    }
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
        if (document.activeElement === el) continue;

        const v = dataObj[el.id];

        if (el.type === "checkbox") {
          el.checked = !!v;
        } else if (el.type === "radio") {
          el.checked = (String(v) === String(el.value));
        } else {
          el.value = (v ?? "");
        }

        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }

      // computed
      try { tinhBMI(); } catch (_) {}

      // dynamic tables: khi hidden JSON đổi thì reload lại UI
      try { loadDienTienFromHidden(); } catch (_) {}
      try { loadHemFromHidden(); } catch (_) {}
      try { loadBioFromHidden(); } catch (_) {}

    } finally {
      state.applyingRemote = false;
    }
  }

  function wsSend(obj) {
    if (!state.ws || state.ws.readyState !== 1) return;

    if (state.room && !obj.room) obj.room = state.room;
    if (!obj.clientId) obj.clientId = state.clientId;

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

    formEl.addEventListener("focusin", (e) => {
      const el = e.target;
      if (!el || !el.id) return;

      const cur = state.locks?.[el.id];
      if (cur && cur.by && cur.by !== state.clientId) {
        try { el.blur(); } catch (_) {}
        return;
      }
      sendLock(el.id);
    });

    formEl.addEventListener("focusout", (e) => {
      const el = e.target;
      if (!el || !el.id) return;
      sendUnlock(el.id);
    });
  }

  function connect(room, { showNotice } = { showNotice: false }) {
    if (!WS_URL) return;

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
      setShareStatus("connecting", state.onlineCount);

      bindFormEvents();

      if (showNotice) {
        renderSharedNotice(window.location.href);
        bindNoticeCopyButton();
      } else {
        renderConnectedNotice(room);
        bindNoticeCopyButton();
      }

      scheduleSendState(true);
    };

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }

      if (msg.type === "joined") {
        setShareStatus("online", state.onlineCount);
        return;
      }

      if (msg.type === "presence") {
        if (typeof msg.count === "number") state.onlineCount = msg.count;
        setShareStatus(state.connected ? "online" : "connecting", state.onlineCount);
        return;
      }

      if (msg.type === "locks") {
        applyLocks(msg.payload || {});
        return;
      }

      if (msg.type === "lock") {
        const fid = msg.fieldId;
        const by = msg.by || msg.clientId;
        if (fid && by && by !== state.clientId) {
          state.locks[fid] = { by, at: msg.at || Date.now() };
          setFieldLockedUI(fid, true, by);
        }
        return;
      }

      if (msg.type === "unlock") {
        const fid = msg.fieldId;
        const by = msg.by || msg.clientId;

        const cur = state.locks?.[fid];
        if (fid && cur && (!by || cur.by === by)) {
          delete state.locks[fid];
          setFieldLockedUI(fid, false);
        }
        return;
      }

      if (msg.type === "lock-denied") {
        const fid = msg.fieldId;
        const by = msg.by;
        if (fid && by && by !== state.clientId) {
          state.locks[fid] = { by, at: msg.at || Date.now() };
          setFieldLockedUI(fid, true, by);
        }
        return;
      }

      if (msg.type === "state") {
        applyData(msg.payload || {});
        return;
      }
      if (msg.type === "clear") {
        __resetFormUIOnly();
        return;
      }
    };

    ws.onclose = () => {
      state.connected = false;
      if (state.room) setShareStatus("offline", state.onlineCount);
      if (state.room) {
        setTimeout(() => {
          const cur = getRoomFromURL();
          if (cur && cur === state.room) connect(state.room, { showNotice: showNotice || false });
        }, 1200);
      }
    };

    ws.onerror = () => {
      if (state.room) setShareStatus("offline", state.onlineCount);
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

  function __resetFormUIOnly() {
    document.getElementById('benhanForm')?.reset();
    const tuoi = document.getElementById('tuoi'); if (tuoi) tuoi.textContent = '-';
    const bmi = document.getElementById('bmi'); if (bmi) bmi.textContent = '-';
    const pl = document.getElementById('phanloai'); if (pl) pl.textContent = '-';

    // reset dynamic tables
    const dj = document.getElementById("dientien_json"); if (dj) dj.value = "[]";
    const hj = document.getElementById("hem_json"); if (hj) hj.value = "";
    const bj = document.getElementById("bio_json"); if (bj) bj.value = "";

    try { loadDienTienFromHidden(); } catch (_) {}
    try { loadHemFromHidden(); } catch (_) {}
    try { loadBioFromHidden(); } catch (_) {}
    try { closePreview(); } catch (_) {}
  }

  window.__SHARE_SYNC__ = window.__SHARE_SYNC__ || {};
  window.__SHARE_SYNC__.enabled = false;
  window.__SHARE_SYNC__.saveFieldNow = () => scheduleSendState(false);
  window.__SHARE_SYNC__.clearAllNow = () => {
    if (!state.connected) return;
    wsSend({ type: "clear" });
  };

  async function onShareClick() {
    let room = getRoomFromURL();
    if (!room) {
      room = randomRoom();
      setRoomToURL(room);
    }
    const link = window.location.href;

    try { await navigator.clipboard.writeText(link); } catch (_) {}

    state.room = room;
    setShareStatus("connecting");

    connect(room, { showNotice: true });
    window.__SHARE_SYNC__.enabled = true;

    renderSharedNotice(link);
    bindNoticeCopyButton();
  }

  if (btnShare) btnShare.addEventListener("click", onShareClick);

  const roomFromUrl = getRoomFromURL();
  if (roomFromUrl) {
    state.room = roomFromUrl;
    setShareStatus("connecting");
    connect(roomFromUrl, { showNotice: false });
    window.__SHARE_SYNC__.enabled = true;
    renderConnectedNotice(roomFromUrl);
    bindNoticeCopyButton();
  }

})();
