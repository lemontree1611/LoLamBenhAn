// ====== CONFIG ======
const GOOGLE_CLIENT_ID =
  "809932517901-53dirqapfjqbroadjilk8oeqtj0qugfj.apps.googleusercontent.com";

// Backend WebSocket đã deploy (bạn đang dùng onrender)
const WS_URL = "wss://lolambenhan-0be9.onrender.com/ws-hoichan";

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
const INPUT_MAX_HEIGHT = 140;

const ADMIN_EMAIL = "minhtri16112002@gmail.com";
const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const linkPreviewCache = new Map();

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

function normalizeUrl(rawUrl) {
  const cleaned = String(rawUrl || "").trim().replace(/[),.;!?]+$/g, "");
  if (!cleaned) return "";

  const candidate = /^https?:\/\//i.test(cleaned)
    ? cleaned
    : cleaned.startsWith("//")
      ? `https:${cleaned}`
      : `https://${cleaned}`;
  try {
    const url = new URL(candidate);
    if (!/^https?:$/i.test(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function extractUrls(text) {
  const found = String(text || "").match(URL_REGEX) || [];
  const unique = new Set();
  found.forEach((rawUrl) => {
    const normalized = normalizeUrl(rawUrl);
    if (normalized) unique.add(normalized);
  });
  return [...unique];
}

function getDisplayUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.host + (parsed.pathname === "/" ? "" : parsed.pathname);
  } catch {
    return url;
  }
}

function getUrlHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

function getFaviconUrl(url) {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`;
  } catch {
    return "";
  }
}

function looksLikeImageUrl(url) {
  try {
    const { pathname } = new URL(url);
    return /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(pathname);
  } catch {
    return false;
  }
}

function firstUsableUrl(...values) {
  for (const value of values) {
    const normalized = normalizeUrl(value);
    if (normalized) return normalized;
  }
  return "";
}

function cleanPreviewText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function appendRichText(container, text) {
  const rawText = String(text || "");
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  let match;

  URL_REGEX.lastIndex = 0;
  while ((match = URL_REGEX.exec(rawText)) !== null) {
    const [rawUrl] = match;
    const start = match.index;
    const normalized = normalizeUrl(rawUrl);

    if (start > lastIndex) {
      fragment.appendChild(document.createTextNode(rawText.slice(lastIndex, start)));
    }

    if (normalized) {
      const link = document.createElement("a");
      link.className = "messageLink";
      link.href = normalized;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = rawUrl;
      fragment.appendChild(link);
    } else {
      fragment.appendChild(document.createTextNode(rawUrl));
    }

    lastIndex = start + rawUrl.length;
  }

  if (lastIndex < rawText.length) {
    fragment.appendChild(document.createTextNode(rawText.slice(lastIndex)));
  }

  const lines = [];
  fragment.childNodes.forEach((node) => lines.push(node));
  container.textContent = "";
  lines.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const parts = String(node.textContent || "").split("\n");
      parts.forEach((part, index) => {
        if (part) container.appendChild(document.createTextNode(part));
        if (index < parts.length - 1) container.appendChild(document.createElement("br"));
      });
      return;
    }
    container.appendChild(node);
  });
}

function getYouTubeEmbedUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    let videoId = "";

    if (host === "youtu.be") {
      videoId = parsed.pathname.slice(1).split("/")[0];
    } else if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        videoId = parsed.searchParams.get("v") || "";
      } else if (parsed.pathname.startsWith("/shorts/") || parsed.pathname.startsWith("/embed/")) {
        videoId = parsed.pathname.split("/")[2] || "";
      }
    }

    if (!videoId) return "";
    return `https://www.youtube.com/embed/${videoId}`;
  } catch {
    return "";
  }
}

function extractIframeSrc(html) {
  if (!html) return "";
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const iframe = doc.querySelector("iframe[src]");
    const src = iframe?.getAttribute("src") || "";
    return normalizeUrl(src);
  } catch {
    return "";
  }
}

async function getLinkPreviewData(url) {
  if (linkPreviewCache.has(url)) return linkPreviewCache.get(url);

  const task = (async () => {
    if (looksLikeImageUrl(url)) {
      return {
        type: "card",
        url,
        title: getDisplayUrl(url),
        provider: getUrlHostname(url),
        thumbnail: url,
        description: "",
        iconUrl: getFaviconUrl(url)
      };
    }

    const youtubeEmbed = getYouTubeEmbedUrl(url);
    if (youtubeEmbed) {
        return {
          type: "embed",
          url,
          title: "YouTube",
          provider: "YouTube",
          embedUrl: youtubeEmbed,
          description: "",
          iconUrl: getFaviconUrl(url)
        };
      }

    try {
      const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const iframeSrc = extractIframeSrc(data.html);
      const thumbnail = firstUsableUrl(
        data.thumbnail_url,
        data.thumbnailUrl,
        data.image,
        data.image_url
      );

      if (iframeSrc) {
        return {
          type: "embed",
          url,
          title: cleanPreviewText(data.title, getDisplayUrl(url)),
          provider: cleanPreviewText(data.provider_name, getUrlHostname(url)),
          thumbnail,
          embedUrl: iframeSrc,
          description: cleanPreviewText(data.author_name || data.description),
          iconUrl: getFaviconUrl(url)
        };
      }

      if (thumbnail || data.title || data.provider_name) {
        return {
          type: "card",
          url,
          title: cleanPreviewText(data.title, getDisplayUrl(url)),
          provider: cleanPreviewText(data.provider_name, getUrlHostname(url)),
          thumbnail,
          description: cleanPreviewText(data.author_name || data.description),
          iconUrl: getFaviconUrl(url)
        };
      }
    } catch {}

    try {
      const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&audio=false&video=false`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      const data = payload?.data || {};
      const thumbnail = firstUsableUrl(
        data.image?.url,
        data.image?.secureUrl,
        data.screenshot?.url,
        data.logo?.url
      );
      const iconUrl = firstUsableUrl(
        data.logo?.icon,
        data.logo?.url,
        getFaviconUrl(url)
      );

      return {
        type: "card",
        url,
        title: cleanPreviewText(data.title, getDisplayUrl(url)),
        provider: cleanPreviewText(data.publisher || data.author, getUrlHostname(url)),
        thumbnail,
        description: cleanPreviewText(data.description),
        iconUrl
      };
    } catch {
      return {
        type: "card",
        url,
        title: getDisplayUrl(url),
        provider: getUrlHostname(url),
        thumbnail: "",
        description: "",
        iconUrl: getFaviconUrl(url)
      };
    }
  })();

  linkPreviewCache.set(url, task);
  return task;
}

function createPreviewCard(data) {
  const link = document.createElement("a");
  link.className = "linkPreviewCard";
  link.href = data.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  if (data.thumbnail) {
    const img = document.createElement("img");
    img.className = "linkPreviewThumb";
    img.src = data.thumbnail;
    img.alt = data.title || "Link preview";
    img.loading = "lazy";
    link.appendChild(img);
  }

  const body = document.createElement("div");
  body.className = "linkPreviewBody";

  const provider = document.createElement("div");
  provider.className = "linkPreviewProvider";
  if (data.iconUrl) {
    const providerIcon = document.createElement("img");
    providerIcon.className = "linkPreviewProviderIcon";
    providerIcon.src = data.iconUrl;
    providerIcon.alt = "";
    providerIcon.loading = "lazy";
    providerIcon.referrerPolicy = "no-referrer";
    provider.appendChild(providerIcon);
  }

  const providerText = document.createElement("span");
  providerText.textContent = data.provider || getUrlHostname(data.url);
  provider.appendChild(providerText);

  const title = document.createElement("div");
  title.className = "linkPreviewTitle";
  title.textContent = data.title || getDisplayUrl(data.url);

  const description = document.createElement("div");
  description.className = "linkPreviewDescription";
  description.textContent = data.description || "";

  body.appendChild(provider);
  body.appendChild(title);
  if (data.description) body.appendChild(description);
  link.appendChild(body);

  return link;
}

function createPreviewEmbed(data) {
  const wrap = document.createElement("div");
  wrap.className = "linkPreviewEmbed";

  const iframe = document.createElement("iframe");
  iframe.className = "linkPreviewFrame";
  iframe.src = data.embedUrl;
  iframe.loading = "lazy";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.allow =
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.allowFullscreen = true;
  iframe.title = data.title || "Link preview";
  wrap.appendChild(iframe);

  wrap.appendChild(createPreviewCard(data));
  return wrap;
}

function appendLinkPreviews(container, text) {
  const urls = extractUrls(text).slice(0, 3);
  if (!urls.length) return;

  const list = document.createElement("div");
  list.className = "linkPreviewList";
  container.appendChild(list);

  urls.forEach((url) => {
    const slot = document.createElement("div");
    slot.className = "linkPreviewSlot";
    list.appendChild(slot);

    getLinkPreviewData(url)
      .then((data) => {
        slot.replaceChildren(
          data.type === "embed" ? createPreviewEmbed(data) : createPreviewCard(data)
        );
        scrollToBottom();
      })
      .catch(() => {
        slot.replaceChildren(createPreviewCard({
          type: "card",
          url,
          title: getDisplayUrl(url),
          provider: getUrlHostname(url),
          thumbnail: "",
          description: "",
          iconUrl: getFaviconUrl(url)
        }));
      });
  });
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

function autoResizeInput() {
  if (!inputEl) return;
  inputEl.style.height = "auto";
  const nextHeight = Math.min(inputEl.scrollHeight, INPUT_MAX_HEIGHT);
  inputEl.style.height = `${Math.max(nextHeight, 44)}px`;
  inputEl.style.overflowY = inputEl.scrollHeight > INPUT_MAX_HEIGHT ? "auto" : "hidden";
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
    appendRichText(bubble, m.text || "");
    appendLinkPreviews(bubble, m.text || "");
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

function renderMessageCompact(m) {
  const mine = (m.sub && my.sub) ? (m.sub === my.sub) : (m.name === my.name);

  const row = document.createElement("div");
  row.className = `row ${mine ? "rowMine" : "rowOther"}`;
  if (m.id) row.dataset.id = m.id;

  const bubble = document.createElement("div");
  bubble.className = `bubble ${mine ? "mine" : "other"}`;

  const bubbleHeader = document.createElement("div");
  bubbleHeader.className = "bubbleHeader";

  const who = document.createElement("div");
  who.className = "who";
  who.textContent = stripAdSuffix(withBsPrefix(m.name || my.name || "Unknown"));
  bubbleHeader.appendChild(who);
  bubble.appendChild(bubbleHeader);

  const content = document.createElement("div");
  content.className = "bubbleContent";

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

    content.appendChild(wrap);
  } else {
    appendRichText(content, m.text || "");
    appendLinkPreviews(content, m.text || "");
  }

  bubble.appendChild(content);

  const footer = document.createElement("div");
  footer.className = "bubbleFooter";

  let heartWrap = null;
  if (m.id) {
    heartWrap = document.createElement("div");
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
  }

  if (!mine && heartWrap) footer.appendChild(heartWrap);

  const time = document.createElement("span");
  time.className = "time";
  time.textContent = fmtTime(m.at);
  footer.appendChild(time);

  if (mine && heartWrap) footer.appendChild(heartWrap);

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
    footer.appendChild(del);
  }

  bubble.appendChild(footer);

  row.appendChild(bubble);
  messagesEl.appendChild(row);
  scrollToBottom();
}

function resetChatUI() {
  messagesEl.innerHTML = "";
  inputEl.value = "";
  autoResizeInput();
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
      (data.items || []).forEach(renderMessageCompact);
      return;
    }

    if (data.type === "message") {
      renderMessageCompact(data);
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
  autoResizeInput();
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
inputEl.addEventListener("input", autoResizeInput);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
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
function getGoogleButtonTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  return currentTheme === "dark" ? "filled_black" : "outline";
}

function renderGoogleLoginButton() {
  const mountNode = $("googleBtn");
  if (!mountNode || !window.google?.accounts?.id) return;

  mountNode.innerHTML = "";
  window.google.accounts.id.renderButton(mountNode, {
    type: "standard",
    theme: getGoogleButtonTheme(),
    size: "large",
    text: "signin_with",
    shape: "pill"
  });
}

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

  renderGoogleLoginButton();

  const themeObserver = new MutationObserver(() => {
    renderGoogleLoginButton();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"]
  });

  // Auto resume if token exists
  if (token) {
    const p = decodeJwt(token);
    if (p?.name) setAuthed(token);
    else logout();
  }

  autoResizeInput();
};
