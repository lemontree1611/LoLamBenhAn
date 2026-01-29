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

  // Kích hoạt lại các logic phụ thuộc (tóm tắt/BMI/preview...)
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(new Event("change", { bubbles: true }));

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
  const gioitinh = (document.getElementById("gioitinh")?.value || "").toLowerCase();
  const tuoi = (document.getElementById("tuoi")?.textContent || "").toLowerCase();
  const lydo = (document.getElementById("lydo")?.value || "").toLowerCase();

  const text = `Bệnh nhân ${gioitinh} ${tuoi} tuổi vào viện vì ${lydo}. Qua hỏi bệnh, khám bệnh ghi nhận:`;
  const el = document.getElementById("tomtat");
  if (el) el.value = text;
}

["gioitinh", "lydo"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", updateTomtat);
});


// ===============================
//  SHARE ONLINE (WebSocket - Render)
// ===============================
const WS_URL = "wss://lolambenhan.onrender.com"; // <-- Render domain (wss)
const __SHARE__ = {
  ws: null,
  room: null,
  isApplyingRemote: false,
  sendTimer: 0,
  isConnected: false,
};

function __getRoomFromURL() {
  try {
    const u = new URL(window.location.href);
    const room = u.searchParams.get("room");
    return room && room.trim() ? room.trim() : null;
  } catch (_) {
    return null;
  }
}

function __setRoomInURL(room) {
  const u = new URL(window.location.href);
  u.searchParams.set("room", room);
  // giữ path hiện tại, chỉ thay query
  window.history.replaceState({}, "", u.toString());
}

function __randomRoom() {
  // room ngắn, dễ share
  const s = Math.random().toString(36).slice(2, 8);
  const t = Date.now().toString(36).slice(-4);
  return (s + t).toLowerCase();
}

function __showShareNotice(html, isError = false) {
  const el = document.getElementById("share-notice");
  if (!el) return;
  el.style.display = "block";
  el.style.padding = "10px 12px";
  el.style.borderRadius = "12px";
  el.style.margin = "10px 0 0 0";
  el.style.fontSize = "14px";
  el.style.lineHeight = "1.35";
  el.style.background = isError ? "rgba(255,0,0,0.08)" : "rgba(0,0,0,0.05)";
  el.style.border = isError ? "1px solid rgba(255,0,0,0.2)" : "1px solid rgba(0,0,0,0.08)";
  el.innerHTML = html;
}

function __hideShareNotice() {
  const el = document.getElementById("share-notice");
  if (!el) return;
  el.style.display = "none";
  el.innerHTML = "";
}

function __serializeFormState() {
  const form = document.getElementById("benhanForm");
  if (!form) return {};
  const state = {};
  const fields = form.querySelectorAll("input, select, textarea");
  fields.forEach((el) => {
    if (!el.id) return;
    if (el.type === "checkbox") state[el.id] = !!el.checked;
    else if (el.type === "radio") {
      if (el.checked) state[el.id] = el.value ?? "";
    } else {
      state[el.id] = el.value ?? "";
    }
  });

  // computed spans (để đồng bộ hiển thị ngay, dù vẫn có thể tự tính lại)
  state.__computed = {
    tuoi: document.getElementById("tuoi")?.textContent || "-",
    bmi: document.getElementById("bmi")?.textContent || "-",
    phanloai: document.getElementById("phanloai")?.textContent || "-",
  };

  return state;
}

function __applyFormState(state) {
  const form = document.getElementById("benhanForm");
  if (!form || !state) return;

  __SHARE__.isApplyingRemote = true;

  try {
    const fields = form.querySelectorAll("input, select, textarea");
    fields.forEach((el) => {
      if (!el.id) return;
      if (!(el.id in state)) return;

      const v = state[el.id];

      if (el.type === "checkbox") el.checked = !!v;
      else if (el.type === "radio") el.checked = (String(v) === String(el.value));
      else el.value = (v ?? "");

      // kích hoạt các logic phụ thuộc
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // cập nhật computed nếu có
    if (state.__computed) {
      const c = state.__computed;
      const tuoiEl = document.getElementById("tuoi");
      const bmiEl = document.getElementById("bmi");
      const plEl = document.getElementById("phanloai");
      if (tuoiEl) tuoiEl.textContent = c.tuoi ?? tuoiEl.textContent;
      if (bmiEl) bmiEl.textContent = c.bmi ?? bmiEl.textContent;
      if (plEl) plEl.textContent = c.phanloai ?? plEl.textContent;
    }

    // gọi lại các hàm tự động tính (an toàn)
    try { tinhBMI(); } catch (_) {}
    try { updateTomtat(); } catch (_) {}
  } finally {
    __SHARE__.isApplyingRemote = false;
  }
}

function __wsConnectIfNeeded() {
  const room = __getRoomFromURL();
  __SHARE__.room = room;

  // Không có room: không hiển thị notice, chỉ tạo khi bấm Chia sẻ
  if (!room) {
    __hideShareNotice();
    return;
  }

  if (!WS_URL) {
    __showShareNotice("⚠️ Chưa cấu hình WS_URL.", true);
    return;
  }

  // nếu đã có ws và đang mở/đang kết nối thì thôi
  if (__SHARE__.ws && (__SHARE__.ws.readyState === 0 || __SHARE__.ws.readyState === 1)) return;

  const ws = new WebSocket(WS_URL);
  __SHARE__.ws = ws;

  __showShareNotice(`🟠 Đang kết nối phòng <b>${room}</b>...`, false);

  ws.onopen = () => {
    __SHARE__.isConnected = true;
    ws.send(JSON.stringify({ type: "join", room }));
    __showShareNotice(`🟢 Đã kết nối phòng <b>${room}</b>. Dùng nút <b>Chia sẻ</b> để copy link.`, false);

    // gửi state hiện tại để đồng bộ cho người vào sau (nhẹ nhàng)
    try {
      const st = __serializeFormState();
      ws.send(JSON.stringify({ type: "state", payload: st }));
    } catch (_) {}
  };

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (_) { return; }
    if (!msg || !msg.type) return;

    if (msg.type === "state") {
      __applyFormState(msg.payload || {});
      return;
    }

    if (msg.type === "clear") {
      // reset local, không confirm, không broadcast lại
      __resetFormLocalOnly();
      return;
    }
  };

  ws.onclose = () => {
    __SHARE__.isConnected = false;
    __showShareNotice(`🟠 Mất kết nối. Đang tự kết nối lại...`, false);
    // reconnect nhẹ sau 1.2s
    setTimeout(() => __wsConnectIfNeeded(), 1200);
  };

  ws.onerror = () => {
    __showShareNotice(`🔴 Lỗi kết nối WebSocket.`, true);
  };
}

function __wsSend(type, payload) {
  const ws = __SHARE__.ws;
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type, ...(payload !== undefined ? { payload } : {}) }));
}

function __debouncedSendState() {
  if (__SHARE__.isApplyingRemote) return;
  if (!__SHARE__.room) return; // chưa share
  clearTimeout(__SHARE__.sendTimer);
  __SHARE__.sendTimer = setTimeout(() => {
    try {
      __wsSend("state", __serializeFormState());
    } catch (_) {}
  }, 450);
}

function __resetFormLocalOnly() {
  document.getElementById('benhanForm')?.reset();
  document.getElementById('tuoi') && (document.getElementById('tuoi').textContent = '-');
  document.getElementById('bmi') && (document.getElementById('bmi').textContent = '-');
  document.getElementById('phanloai') && (document.getElementById('phanloai').textContent = '-');
  closePreview?.();
  try { updateTomtat(); } catch (_) {}
}

function __broadcastClear() {
  if (!__SHARE__.room) return;
  __wsSend("clear");
}


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

// tách data ra riêng để dùng cho docx + preview
function getFormData() {
  return {
    hoten: getField('hoten'),
    gioitinh: getField('gioitinh'),
    namsinh: getField('namsinh'),
    tuoi: document.getElementById('tuoi')?.textContent || '-',
    dantoc: getField('dantoc'),
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
    bmi: document.getElementById('bmi')?.textContent || '-',
    phanloai: document.getElementById('phanloai')?.textContent || '-',
    tongtrang: getField('tongtrang'),
    benhngoai: getField('benhngoai'),
    timmach: getField('timmach'),
    hopho: getField('hopho'),
    tieuhoa: getField('tieuhoa'),
    than: getField('than'),
    thankinh: getField('thankinh'),
    cokhop: getField('cokhop'),
    coquankhac: getField('coquankhac'),
    cls_dalam: getField('cls_dalam'),
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
  <title>BỆNH ÁN TIỀN PHẪU - ${escapeHtml(data.hoten)}</title>
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
  <h1 class="center" style="margin:0 0 8px 0;font-size:20pt;"><b>BỆNH ÁN TIỀN PHẪU</b></h1>
  <p><em>Ngày làm bệnh án: ${escapeHtml(dateNow)}</em></p>

  <p style="margin-top:12px;"><b>A. PHẦN HÀNH CHÁNH</b></p>
  <p><b>1. Họ và tên:</b> ${escapeHtml(data.hoten)}</p>
  <p><b>2. Giới tính:</b> ${escapeHtml(data.gioitinh)}</p>
  <p><b>3. Năm sinh:</b> ${escapeHtml(data.namsinh)} <span>(${escapeHtml(data.tuoi)} tuổi)</span></p>
  <p><b>4. Dân tộc:</b> ${escapeHtml(data.dantoc)}</p>
  <p><b>5. Nghề nghiệp:</b> ${escapeHtml(data.nghenghiep)}</p>
  <p><b>6. Địa chỉ:</b> ${escapeHtml(data.diachi)}</p>
  <p><b>7. Ngày giờ vào viện:</b> ${formatNgayGio(data.ngaygio)}</p>

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
      BMI = ${escapeHtml(data.bmi)} kg/m² => Phân loại ${escapeHtml(data.phanloai)} theo WHO Asia<br/>
    ${nl2br(data.tongtrang)}
  </p>

  <p style="margin-top:6px;"><b>2. Bệnh ngoại khoa:</b><br/>${nl2br(data.benhngoai)}</p>

  <p style="margin-top:6px;"><b>3. Các cơ quan:</b></p>
  <p><b>a) Tuần hoàn:</b><br/>${nl2br(data.timmach)}</p>
  <p><b>b) Hô hấp:</b><br/>${nl2br(data.hopho)}</p>
  <p><b>c) Tiêu hoá:</b><br/>${nl2br(data.tieuhoa)}</p>
  <p><b>d) Thận - tiết niệu:</b><br/>${nl2br(data.than)}</p>
  <p><b>e) Thần kinh:</b><br/>${nl2br(data.thankinh)}</p>
  <p><b>f) Cơ - Xương - Khớp:</b><br/>${nl2br(data.cokhop)}</p>
  <p><b>g) Các cơ quan khác:</b> ${nl2br(data.coquankhac)}</p>

  <p><b>4. Các cận lâm sàng đã làm:</b><br/>${nl2br(data.cls_dalam)}</p>

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

    // Dòng "3. Năm sinh: xxxx (xx tuổi)" -> (xx tuổi) KHÔNG đậm
    function paraNamSinhRow() {
      return new docx.Paragraph({
        ...basePara,
        children: [
          new docx.TextRun({ text: "3. Năm sinh: ", bold: true, ...runBase }),
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
                text: "BỆNH ÁN TIỀN PHẪU",
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
          paraNamSinhRow(),
          paraLabelValue("4. Dân tộc: ", data.dantoc),
          paraLabelValue("5. Nghề nghiệp: ", data.nghenghiep),
          paraLabelValue("6. Địa chỉ: ", data.diachi),
          paraLabelValue("7. Ngày giờ vào viện: ", formatNgayGio(data.ngaygio), { spacing: { ...basePara.spacing, after: 120 } }),

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
          para(`- Chiều cao: ${data.chieucao} cm, cân nặng: ${data.cannang} kg, BMI = ${data.bmi} kg/m² => Phân loại ${data.phanloai} theo WHO Asia`),
          ...textToParagraphs(data.tongtrang),

          paraHeading("2. ", "Bệnh ngoại khoa:", { spacing: { ...basePara.spacing, before: 120, after: 0 } }),
          ...textToParagraphs(data.benhngoai),

          paraHeading("3. ", "Các cơ quan:", { spacing: { ...basePara.spacing, before: 120, after: 20 } }),
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

          // 4. CLS đã làm
          ...paraLabelValueMultiline("4. Các cận lâm sàng đã làm: ", data.cls_dalam, { spacing: { ...basePara.spacing, before: 40, after: 0 } }),

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
    saveAs(blob, `${data.hoten || 'benhan_tienphau'}.docx`);
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
  const ok = confirm('Xoá hết dữ liệu trong form?');
  if (!ok) return;

  // reset local
  __resetFormLocalOnly();

  // nếu đang share room thì broadcast clear để máy khác reset theo
  __broadcastClear();
}

// ===============================
//  TOPBAR ACTIONS (Export / Preview / Reset)
// ===============================
document.getElementById("btn-export")?.addEventListener("click", generateDocx);
document.getElementById("btn-preview")?.addEventListener("click", openPreview);
document.getElementById("btn-reset")?.addEventListener("click", resetForm);

// ===============================
//  SHARE BUTTON + FORM SYNC HOOKS
// ===============================
document.getElementById("btn-share")?.addEventListener("click", async () => {
  let room = __getRoomFromURL();
  if (!room) {
    room = __randomRoom();
    __setRoomInURL(room);
    __SHARE__.room = room;
  }

  // connect if not connected
  __wsConnectIfNeeded();

  // copy link
  const shareLink = window.location.href;
  try {
    await navigator.clipboard.writeText(shareLink);
    __showShareNotice(`✅ Đã copy link chia sẻ:<br/><code style="user-select:all">${escapeHtml(shareLink)}</code><br/>Mở link này ở máy khác để đồng bộ.`, false);
  } catch (_) {
    __showShareNotice(`🔗 Link chia sẻ:<br/><code style="user-select:all">${escapeHtml(shareLink)}</code><br/>(Không copy được tự động, bạn copy thủ công nhé)`, false);
  }
});

// hook: bất cứ thay đổi nào trong form sẽ gửi state (debounce)
document.getElementById("benhanForm")?.addEventListener("input", __debouncedSendState, { capture: true });
document.getElementById("benhanForm")?.addEventListener("change", __debouncedSendState, { capture: true });

__hideShareNotice();

// auto connect nếu mở bằng link có ?room=
__wsConnectIfNeeded();

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

    const response = await fetch("https://lolambenhan.gt.tc/source/apikey.php", {
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
