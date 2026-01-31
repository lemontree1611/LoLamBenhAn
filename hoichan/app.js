// === TẠM THỜI: test UI offline trước ===
// Khi bạn có backend, mình sẽ thay bằng socket + Google verify.
let canSendAt = 0;

const $ = (id) => document.getElementById(id);
const show = (el, yes) => el.classList.toggle("hidden", !yes);

// 1) Login overlay: tạm cho bạn bấm "fake login" bằng cách ẩn overlay
// Khi làm thật: Google callback sẽ gọi hide overlay và set username
window.onGoogleCredential = () => {}; // placeholder để tránh lỗi nếu chưa cấu hình

const GOOGLE_CLIENT_ID = "809932517901-53dirqapfjqbroadjilk8oeqtj0qugfj.apps.googleusercontent.com";

const $ = (id) => document.getElementById(id);
const show = (el, yes) => el.classList.toggle("hidden", !yes);

function hideLoginOverlay() {
  const ov = $("loginOverlay");
  if (!ov) return;
  ov.classList.add("hidden");        // cách 1
  ov.style.display = "none";         // cách 2 (ăn chắc)
}

function onLoginSuccess(payload) {
  // payload.name, payload.email, payload.picture
  const meEl = $("me");
  const statusEl = $("status");
  if (meEl) meEl.textContent = payload.name || "User";
  if (statusEl) statusEl.textContent = "Đã đăng nhập";

  hideLoginOverlay();
  const sendBtn = $("send");
  if (sendBtn) sendBtn.disabled = false;
}

// Render Google button full width theo đúng card
function renderGoogleButtonFullWidth() {
  const btnHost = $("gBtn");
  const card = document.querySelector(".loginCard");
  if (!btnHost || !card) return;

  btnHost.innerHTML = ""; // clear để render lại khi resize
  const width = Math.min(card.clientWidth, 420); // giới hạn đẹp

  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (resp) => {
      // resp.credential là ID token (JWT)
      // Frontend demo: decode lấy name để ẩn overlay
      // (Sau này có backend thì gửi token về server verify)
      const payload = JSON.parse(atob(resp.credential.split(".")[1]));
      onLoginSuccess(payload);
    },
  });

  google.accounts.id.renderButton(btnHost, {
    theme: "outline",
    size: "large",
    text: "signin_with",
    shape: "pill",
    width, // ✅ full width theo card
  });

  // Không tự bật prompt nổi
  // google.accounts.id.prompt();
}

// Đợi GIS load xong rồi render
window.addEventListener("load", () => {
  // GIS script async nên đôi khi cần đợi google xuất hiện
  const t = setInterval(() => {
    if (window.google?.accounts?.id) {
      clearInterval(t);
      renderGoogleButtonFullWidth();
      window.addEventListener("resize", renderGoogleButtonFullWidth);
    }
  }, 100);
});


function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function renderLocalMessage({ userName, text, imageUrl }) {
  const msg = {
    id: crypto.randomUUID(),
    userName,
    text,
    imageUrl,
    createdAt: new Date().toISOString(),
    hearts: 0
  };

  const wrap = document.createElement("div");
  wrap.className = "msg";
  wrap.innerHTML = `
    <div class="bubble">
      <div class="meta">
        <span class="name">${escapeHtml(msg.userName)}</span>
        <span class="time">${new Date(msg.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
      </div>
      ${msg.text ? `<div class="text">${escapeHtml(msg.text)}</div>` : ""}
      ${msg.imageUrl ? `<img class="img" src="${msg.imageUrl}" alt="image" />` : ""}
      <button class="heart" data-id="${msg.id}">❤️ <span>${msg.hearts}</span></button>
    </div>
  `;

  const heartBtn = wrap.querySelector(".heart");
  heartBtn.onclick = () => {
    msg.hearts += 1;
    heartBtn.querySelector("span").textContent = msg.hearts;
  };

  $("messages").appendChild(wrap);
  $("messages").scrollTop = $("messages").scrollHeight;
}

let cooldownTimer = null;
function startCooldown(ms) {
  clearInterval(cooldownTimer);
  show($("cooldown"), true);
  $("send").disabled = true;

  const end = Date.now() + ms;
  cooldownTimer = setInterval(() => {
    const left = Math.max(0, end - Date.now());
    $("cooldown").textContent = `Chờ ${Math.ceil(left / 1000)}s để gửi tiếp…`;
    if (left <= 0) {
      clearInterval(cooldownTimer);
      show($("cooldown"), false);
      $("send").disabled = false;
    }
  }, 200);
}

function sendTextLocal() {
  const now = Date.now();
  if (now < canSendAt) {
    startCooldown(canSendAt - now);
    return;
  }

  const text = $("input").value.trim();
  if (!text) return;

  renderLocalMessage({ userName: "Bạn", text });
  $("input").value = "";

  canSendAt = Date.now() + 5000;
  startCooldown(5000);
}

$("send").disabled = false;
$("send").onclick = sendTextLocal;
$("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendTextLocal();
});

// Upload ảnh: tạm dùng file local preview (không cần Cloudinary để test UI)
$("btnImg").onclick = async () => {
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "image/*";
  picker.onchange = () => {
    const file = picker.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    renderLocalMessage({ userName: "Bạn", imageUrl: url });
  };
  picker.click();
};
