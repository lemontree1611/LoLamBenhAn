// ====== CONFIG ======
const GOOGLE_CLIENT_ID =
  "809932517901-53dirqapfjqbroadjilk8oeqtj0qugfj.apps.googleusercontent.com";

// Backend WebSocket đã deploy (bạn đang dùng onrender)
const WS_URL = "wss://lolambenhan.onrender.com/ws-hoichan";

// ====== DOM ======
const $ = (id) => document.getElementById(id);
const loginScreen = $("loginScreen");
const chatScreen = $("chatScreen");
const meLabel = $("meLabel");
const messagesEl = $("messages");
const inputEl = $("msgInput");
const fileInputEl = $("fileInput");
const fileBtnEl = $("fileBtn");
const cooldownToastEl = $("cooldownToast");

let ws = null;
let token = localStorage.getItem("hoichan_google_token") || "";
let my = { name: "", sub: "", email: "", isAdmin: false };
let lastSendAt = 0;

const SEND_COOLDOWN_MS = 5000;
let cooldownTimer = null;

const ADMIN_EMAIL = "minhtri16112002@gmail.com";

function stripAdSuffix(name) {
  return String(name || "").replace(/\s*\(ad\)\s*$/i, "");
}
// ====== Helpers ======
// FIX: atob() không decode UTF-8 -> chữ có dấu bị hỏng (TrÃ­ LÃª)
function base64UrlToUint8Array(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function withBsPrefix(name) {
  const n = String(name || "").trim();
  if (!n) return "Bs. ";
  if (/^bs\.\s*/i.test(n)) return n;
  return `Bs. ${n}`;
}

function decodeJwt(jwt) {
  try {
    const payloadPart = jwt.split(".")[1];
    const bytes = base64UrlToUint8Array(payloadPart);
    const jsonText = new TextDecoder("utf-8").decode(bytes);
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function fmtTime(ms) {
  const d = new Date(Number(ms) || Date.now());
  const date = d.toLocaleDateString("vi-VN");
  const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  return `${date} • ${time}`;
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function isImageMime(mime) {
  return /^image\//i.test(mime || "");
}

function showChat() {
  loginScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
}
function showLogin() {
  chatScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderMessage(m) {
  const mine = (m.sub && my.sub) ? (m.sub === my.sub) : (m.name === my.name);

  const row = document.createElement("div");
  row.className = `row ${mine ? "rowMine" : "rowOther"}`;
  if (m.id) row.dataset.id = m.id;

  // Meta: name + time (hiện cho cả mine và other theo yêu cầu)
  const meta = document.createElement("div");
  meta.className = "meta";

  const who = document.createElement("span");
  who.className = "who";
  const rawName = withBsPrefix(m.name || my.name || "Unknown");
  who.textContent = stripAdSuffix(rawName);

  const time = document.createElement("span");
  time.className = "time";
  time.textContent = fmtTime(m.at);

  meta.appendChild(who);
  meta.appendChild(time);

  if (my.isAdmin && m.id) {
    const del = document.createElement("button");
    del.className = "delBtn";
    del.type = "button";
    del.textContent = "Xóa";
    del.addEventListener("click", () => {
      if (!confirm("Xóa tin nhắn này?")) return;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "delete", id: m.id }));
    });
    meta.appendChild(del);
  }


  row.appendChild(meta);

  const bubble = document.createElement("div");
  bubble.className = `bubble ${mine ? "mine" : "other"}`;
  const fileUrl = m.file_url || m.file_data || "";
  if (fileUrl) {
    const wrap = document.createElement("div");
    wrap.className = "fileWrap";

    const mime = m.file_mime || "application/octet-stream";
    const name = m.file_name || "file";
    const size = m.file_size || 0;

    if (isImageMime(mime)) {
      const img = document.createElement("img");
      img.className = "fileImg";
      img.src = fileUrl;
      img.alt = name;
      wrap.appendChild(img);
    }

    const info = document.createElement("div");
    info.className = "fileInfo";

    const nameEl = document.createElement("div");
    nameEl.className = "fileName";
    nameEl.textContent = name;

    const metaEl = document.createElement("div");
    metaEl.className = "fileMeta";
    metaEl.textContent = formatBytes(size);

    info.appendChild(nameEl);
    info.appendChild(metaEl);
    wrap.appendChild(info);

    const link = document.createElement("a");
    link.className = "fileLink";
    link.href = fileUrl;
    link.download = name;
    link.textContent = "Tải xuống";
    wrap.appendChild(link);

    bubble.appendChild(wrap);
  } else {
    bubble.textContent = m.text || "";
  }
  row.appendChild(bubble);

  if (m.id) {
    const heartWrap = document.createElement("div");
    heartWrap.className = "heartWrap";

    const heartBtn = document.createElement("button");
    heartBtn.className = "heartBtn";
    heartBtn.type = "button";
    heartBtn.setAttribute("aria-pressed", "false");
    heartBtn.textContent = "❤";
    heartBtn.disabled = mine;
    heartBtn.addEventListener("click", () => {
      if (heartBtn.disabled) return;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "heart", id: m.id }));
    });

    const heartCount = document.createElement("span");
    heartCount.className = "heartCount";
    heartCount.textContent = String(Number(m.heart_count || 0));

    heartWrap.appendChild(heartBtn);
    heartWrap.appendChild(heartCount);
    row.appendChild(heartWrap);
  }

  messagesEl.appendChild(row);
  scrollToBottom();
}

function resetChatUI() {
  messagesEl.innerHTML = "";
  inputEl.value = "";
  if (fileInputEl) fileInputEl.value = "";
}

function connectWS() {
  if (!token) return;

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    // auth first
    ws.send(JSON.stringify({ type: "auth", token }));
  };

  ws.onmessage = (ev) => {
    let data;
    try { data = JSON.parse(ev.data); } catch { return; }

    if (data.type === "history") {
      resetChatUI();
      (data.items || []).forEach(renderMessage);
      return;
    }

    if (data.type === "message") {
      renderMessage(data);
      return;
    }

    if (data.type === "heart") {
      updateHeart(data.id, data.heart_count);
      return;
    }

    if (data.type === "delete") {
      removeMessageById(data.id);
      return;
    }

    if (data.type === "error") {
      alert(data.message || "Có lỗi");
      logout();
      return;
    }
  };

  ws.onerror = () => {
    console.log("WS error");
  };

  ws.onclose = () => {
    if (token) setTimeout(connectWS, 900);
  };
}

function sendMessage() {
  const text = inputEl.value.trim();
  if (!text) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (Date.now() - lastSendAt < SEND_COOLDOWN_MS) {
    showCooldownToast();
    return;
  }

  ws.send(JSON.stringify({ type: "send", text }));
  inputEl.value = "";
  lastSendAt = Date.now();
}

function updateHeart(id, count) {
  if (!id) return;
  const el = messagesEl.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (!el) return;
  const countEl = el.querySelector(".heartCount");
  if (!countEl) return;
  countEl.textContent = String(Number(count || 0));
}

function removeMessageById(id) {
  if (!id) return;
  const el = messagesEl.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (el) el.remove();
}

function sendFile(file) {
  if (!file) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (Date.now() - lastSendAt < SEND_COOLDOWN_MS) {
    showCooldownToast();
    return;
  }

  const MAX_BYTES = 5 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    alert("File quá lớn. Vui lòng chọn file dưới 5MB.");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result || "");
    if (!dataUrl.startsWith("data:")) {
      alert("Không đọc được file.");
      return;
    }
    ws.send(JSON.stringify({
      type: "send_file",
      name: file.name,
      mime: file.type || "application/octet-stream",
      size: file.size,
      data: dataUrl
    }));
    lastSendAt = Date.now();
  };
  reader.onerror = () => alert("Không đọc được file.");
  reader.readAsDataURL(file);
}

function showCooldownToast() {
  if (!cooldownToastEl) return;
  if (cooldownTimer) clearInterval(cooldownTimer);

  const render = () => {
    const left = Math.max(0, SEND_COOLDOWN_MS - (Date.now() - lastSendAt));
    const sec = Math.ceil(left / 1000);
    cooldownToastEl.textContent = `Vui lòng chờ ${sec}s để gửi tiếp`;
    cooldownToastEl.classList.remove("hidden");
    if (left <= 0) {
      cooldownToastEl.classList.add("hidden");
      clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
  };

  render();
  cooldownTimer = setInterval(render, 200);
}

function setAuthed(credential) {
  token = credential;
  localStorage.setItem("hoichan_google_token", token);

  const p = decodeJwt(token);
  my.name = stripAdSuffix(withBsPrefix(p?.name || "Bạn"));
  my.sub = p?.sub || "";
  my.email = String(p?.email || "").toLowerCase();
  my.isAdmin = my.email === ADMIN_EMAIL;

  meLabel.textContent = `Xin chào, ${my.name}`;

  showChat();
  connectWS();
}

function logout() {
  token = "";
  my = { name: "", sub: "", email: "", isAdmin: false };
  localStorage.removeItem("hoichan_google_token");

  try { ws?.close(); } catch {}
  ws = null;

  resetChatUI();
  showLogin();

  if (window.google?.accounts?.id) {
    window.google.accounts.id.disableAutoSelect();
  }
}

// ====== Events ======
$("sendBtn").addEventListener("click", sendMessage);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});
$("logoutBtn").addEventListener("click", logout);
if (fileBtnEl && fileInputEl) {
  fileBtnEl.addEventListener("click", () => fileInputEl.click());
  fileInputEl.addEventListener("change", (e) => {
    const file = e.target?.files?.[0];
    if (file) sendFile(file);
    fileInputEl.value = "";
  });
}

// ====== Google Login init ======
window.onload = () => {
  if (!window.google?.accounts?.id) {
    alert("Không tải được Google Login. Kiểm tra mạng/CSP.");
    return;
  }

  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (res) => {
      if (res?.credential) setAuthed(res.credential);
      else alert("Đăng nhập thất bại, thử lại.");
    }
  });

  window.google.accounts.id.renderButton($("googleBtn"), {
    theme: "outline",
    size: "large",
    text: "continue_with",
    shape: "pill"
  });

  // Auto resume if token exists
  if (token) {
    const p = decodeJwt(token);
    if (p?.name) setAuthed(token);
    else logout();
  }
};
