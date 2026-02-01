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

let ws = null;
let token = localStorage.getItem("hoichan_google_token") || "";
let my = { name: "", sub: "" };

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
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
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

  // Meta: name + time (hiện cho cả mine và other theo yêu cầu)
  const meta = document.createElement("div");
  meta.className = "meta";

  const who = document.createElement("span");
  who.className = "who";
  who.textContent = mine
  ? (my.name || "Bs.")
  : withBsPrefix(m.name || "Unknown");

  const time = document.createElement("span");
  time.className = "time";
  time.textContent = fmtTime(m.at);

  meta.appendChild(who);
  meta.appendChild(time);
  row.appendChild(meta);

  const bubble = document.createElement("div");
  bubble.className = `bubble ${mine ? "mine" : "other"}`;
  bubble.textContent = m.text || "";
  row.appendChild(bubble);

  messagesEl.appendChild(row);
  scrollToBottom();
}

function resetChatUI() {
  messagesEl.innerHTML = "";
  inputEl.value = "";
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

  ws.send(JSON.stringify({ type: "send", text }));
  inputEl.value = "";
}

function setAuthed(credential) {
  token = credential;
  localStorage.setItem("hoichan_google_token", token);

  const p = decodeJwt(token);
  my.name = withBsPrefix(p?.name || "Bạn");
  my.sub = p?.sub || "";

  meLabel.textContent = `Bạn: ${my.name}`;

  showChat();
  connectWS();
}

function logout() {
  token = "";
  my = { name: "", sub: "" };
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
