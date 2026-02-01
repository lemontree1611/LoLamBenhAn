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
const wsLabel = $("wsLabel");
const messagesEl = $("messages");
const inputEl = $("msgInput");

wsLabel.textContent = WS_URL;

let ws = null;
let token = localStorage.getItem("hoichan_google_token") || "";
let my = { name: "", sub: "" };

// ====== Helpers ======
function decodeJwt(jwt) {
  try {
    const payload = jwt.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return json;
  } catch {
    return null;
  }
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

  if (!mine) {
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = m.name || "Unknown";
    row.appendChild(name);
  }

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
    // thường do CSP/URL sai/WS server down
    console.log("WS error");
  };

  ws.onclose = () => {
    // auto reconnect nhẹ nếu vẫn còn token
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
  my.name = p?.name || "You";
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

  // (optional) disable auto select
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
