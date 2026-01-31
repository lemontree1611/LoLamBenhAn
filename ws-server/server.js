// ws-server/server.js
// WebSocket + HTTP API (Gemini) + Comments API (Postgres)
// Chạy tốt trên Render

const http = require("http");
const WebSocket = require("ws");
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { Pool } = require("pg");

const PORT = process.env.PORT || 10000;

// ================== EXPRESS (HTTP API) ==================
const app = express();

// ====== CORS ======
// Nếu muốn chặt hơn: set CORS_ORIGINS="https://xxx.github.io,https://domain.com"
// Mặc định cho phép Vercel production domain của bạn (để tránh lỗi 500 khi deploy Vercel).
const defaultCorsOrigins = ["https://lolambenhan.vercel.app"];

const corsOrigins = Array.from(
  new Set(
    defaultCorsOrigins.concat(
      (process.env.CORS_ORIGINS || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)
    )
  )
);

app.use(
  cors({
    origin: function (origin, cb) {
      // allow curl/no-origin
      if (!origin) return cb(null, true);
      if (corsOrigins.length === 0) return cb(null, true); // mở nếu chưa cấu hình
      return corsOrigins.includes(origin)
        ? cb(null, true)
        : cb(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

app.use(express.json({ limit: "1mb" }));

// Trả về 403 JSON thay vì 500 HTML khi bị chặn CORS (giúp debug dễ hơn)
app.use((err, req, res, next) => {
  if (err && String(err.message || "").includes("Not allowed by CORS")) {
    return res.status(403).json({ error: "CORS blocked", origin: req.headers.origin || null });
  }
  return next(err);
});


app.get("/", (req, res) => {
  res.send("WS + Gemini API server is running.");
});

app.get("/healthz", (req, res) => res.send("ok"));

// ================== POSTGRES (COMMENTS) ==================
const DATABASE_URL = process.env.DATABASE_URL || "";
let pool = null;

if (DATABASE_URL) {
  pool = new Pool({ connectionString: DATABASE_URL });
} else {
  console.warn("Missing DATABASE_URL - comments APIs will not work until set.");
}

// ====== ADMIN (simple token) ======
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || "";

function makeToken() {
  const raw = crypto.randomBytes(24).toString("hex");
  const sig = crypto.createHmac("sha256", ADMIN_TOKEN_SECRET).update(raw).digest("hex");
  return `${raw}.${sig}`;
}

function verifyToken(token) {
  if (!token || !ADMIN_TOKEN_SECRET) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [raw, sig] = parts;
  const expected = crypto.createHmac("sha256", ADMIN_TOKEN_SECRET).update(raw).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1] : "";
  if (!verifyToken(token)) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// ====== COMMENTS API ======
app.get("/comments", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DB not configured" });

  try {
    // ✅ FIX timezone hiển thị: ép về Asia/Ho_Chi_Minh (+07)
    const { rows } = await pool.query(
      `select id, username, text, heart,
              to_char(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI:SS') as date
       from comments
       order by id desc
       limit 200`
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB error" });
  }
});

app.post("/comments", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DB not configured" });

  try {
    const username = String(req.body?.username || "").trim();
    const text = String(req.body?.text || "").trim();

    if (!username) return res.status(400).json({ error: "Vui lòng nhập nickname" });
    if (!text) return res.status(400).json({ error: "Vui lòng nhập nội dung góp ý" });

    // ✅ FIX timezone hiển thị: ép về Asia/Ho_Chi_Minh (+07) cho returning date
    const { rows } = await pool.query(
      `insert into comments (username, text)
       values ($1, $2)
       returning id, username, text, heart,
                 to_char(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI:SS') as date`,
      [username.slice(0, 50), text.slice(0, 1000)]
    );

    res.json({ ok: true, item: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB error" });
  }
});

// Admin login: trả token
app.post("/admin/login", (req, res) => {
  const password = String(req.body?.password || "");

  if (!ADMIN_PASSWORD || !ADMIN_TOKEN_SECRET) {
    return res.status(500).json({ error: "Admin not configured" });
  }
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Sai mật khẩu" });
  }
  const token = makeToken();
  res.json({ ok: true, token });
});

// Toggle heart (admin only)
app.post("/comments/:id/toggle-heart", requireAdmin, async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DB not configured" });

  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

    const { rows } = await pool.query(
      `update comments
       set heart = not heart
       where id = $1
       returning id, heart`,
      [id]
    );

    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, item: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB error" });
  }
});

// ================== CHAT PROTECTION + FALLBACK HELPERS ==================

// --- Simple in-memory rate limit (per IP, per minute) ---
const chatRate = new Map(); // ip -> { windowStart, count }
function rateLimitChat(ip) {
  const RPM = Number(process.env.CHAT_MAX_RPM || 20);
  const now = Date.now();
  const WINDOW = 60_000;

  const cur = chatRate.get(ip) || { windowStart: now, count: 0 };
  if (now - cur.windowStart >= WINDOW) {
    cur.windowStart = now;
    cur.count = 0;
  }
  cur.count += 1;
  chatRate.set(ip, cur);

  if (cur.count > RPM) {
    return {
      ok: false,
      retryAfterSec: Math.ceil((WINDOW - (now - cur.windowStart)) / 1000)
    };
  }
  return { ok: true };
}

// --- Queue + concurrency (per IP) ---
const ipActive = new Map(); // ip -> number active
const chatQueue = [];       // { ip, fn, resolve, reject, enqueuedAt }

function runNextFromQueue() {
  if (chatQueue.length === 0) return;

  const MAX_PER_IP = Number(process.env.CHAT_MAX_CONCURRENT_PER_IP || 1);

  for (let i = 0; i < chatQueue.length; i++) {
    const job = chatQueue[i];
    const active = ipActive.get(job.ip) || 0;

    if (active < MAX_PER_IP) {
      chatQueue.splice(i, 1);
      ipActive.set(job.ip, active + 1);

      Promise.resolve()
        .then(job.fn)
        .then(job.resolve)
        .catch(job.reject)
        .finally(() => {
          const a = (ipActive.get(job.ip) || 1) - 1;
          if (a <= 0) ipActive.delete(job.ip);
          else ipActive.set(job.ip, a);
          runNextFromQueue();
        });

      return;
    }
  }
}

function withChatQueue(ip, fn) {
  const MAX_QUEUE = Number(process.env.CHAT_QUEUE_MAX || 50);
  if (chatQueue.length >= MAX_QUEUE) {
    const e = new Error("Server is busy. Queue is full.");
    e.status = 503;
    throw e;
  }

  return new Promise((resolve, reject) => {
    chatQueue.push({ ip, fn, resolve, reject, enqueuedAt: Date.now() });
    runNextFromQueue();
  });
}

// --- Circuit breaker / cooldown on 429 ---
const cooldownUntil = new Map(); // key -> timestamp(ms)
function inCooldown(key) {
  return Date.now() < (cooldownUntil.get(key) || 0);
}
function setCooldown(key) {
  const minMs = Number(process.env.COOLDOWN_MIN_MS || 30000);
  const maxMs = Number(process.env.COOLDOWN_MAX_MS || 60000);
  const dur = minMs + Math.floor(Math.random() * Math.max(1, (maxMs - minMs)));
  cooldownUntil.set(key, Date.now() + dur);
  return dur;
}

function safeJson(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function isRateLimitOrQuota(status, rawText) {
  if (status === 429) return true;
  const j = safeJson(rawText);
  const msg = String(rawText || "").toLowerCase();

  if (j?.error?.status === "RESOURCE_EXHAUSTED") return true;
  if (j?.error?.code === 429) return true;
  if (msg.includes("resource_exhausted")) return true;
  if (msg.includes("rate limit")) return true;
  if (msg.includes("quota")) return true;

  return false;
}

// --- Reduce history / "summarize" without extra API calls ---
// Snippet length is fixed at 180 chars (no env toggle).
function condenseMessages(messages) {
  const keepLast = Number(process.env.CHAT_KEEP_LAST || 10);
  const snippetLen = 180;

  if (messages.length <= keepLast) return messages;

  const head = messages.slice(0, Math.max(0, messages.length - keepLast));
  const tail = messages.slice(-keepLast);

  const summaryLines = head.map((m, idx) => {
    const role = m.role || "user";
    const text = String(m.content || "").replace(/\s+/g, " ").trim();
    const snip = text.length > snippetLen ? text.slice(0, snippetLen) + "…" : text;
    return `${idx + 1}. ${role}: ${snip}`;
  });

  const summaryMsg = {
    role: "system",
    content:
      "TÓM TẮT NGỮ CẢNH TRƯỚC ĐÓ (rút gọn tự động):\n" +
      summaryLines.join("\n")
  };

  return [summaryMsg, ...tail];
}

// --- Provider calls ---
async function callGemini({ apiKey, messages }) {
  const key = "gemini:gemini-2.5-flash";
  if (inCooldown(key)) {
    return { ok: false, status: 429, raw: "Gemini in cooldown" };
  }

  const contents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" +
    `?key=${apiKey}`;

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents })
  });

  const raw = await r.text();

  if (!r.ok && isRateLimitOrQuota(r.status, raw)) {
    setCooldown(key);
  }

  return { ok: r.ok, status: r.status, raw };
}

async function callOpenAIChat({ apiKey, messages }) {
  const key = "openai:gpt-3.5-turbo";
  if (inCooldown(key)) {
    return { ok: false, status: 429, raw: "OpenAI in cooldown" };
  }

  const payload = {
    model: "gpt-3.5-turbo",
    messages: messages.map(m => ({
      role: m.role === "model" ? "assistant" : m.role,
      content: String(m.content ?? "")
    })),
    temperature: 0.7
  };

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  const raw = await r.text();

  if (!r.ok && isRateLimitOrQuota(r.status, raw)) {
    setCooldown(key);
  }

  return { ok: r.ok, status: r.status, raw };
}


// ====== CHAT API (Gemini -> fallback OpenAI) ======
app.post("/chat", async (req, res) => {
  try {
    const ip =
      (req.headers["x-forwarded-for"] ? String(req.headers["x-forwarded-for"]).split(",")[0].trim() : "") ||
      req.socket?.remoteAddress ||
      "unknown";

    // Rate limit per IP (requests per minute)
    const rl = rateLimitChat(ip);
    if (!rl.ok) {
      return res.status(429).json({
        error: "Rate limited",
        retry_after_sec: rl.retryAfterSec
      });
    }

    // Queue + per-IP concurrency cap
    const result = await withChatQueue(ip, async () => {
      const { messages } = req.body || {};

      if (!Array.isArray(messages)) {
        const e = new Error("messages must be an array");
        e.status = 400;
        throw e;
      }

      const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
      if (!GEMINI_API_KEY) {
        const e = new Error("Missing GEMINI_API_KEY");
        e.status = 500;
        throw e;
      }

      // Reduce history / create a lightweight summary message
      const compact = condenseMessages(messages);

      // 1) Try Gemini first
      const g = await callGemini({ apiKey: GEMINI_API_KEY, messages: compact });

      if (g.ok) {
        const data = safeJson(g.raw) || {};
        const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        return { answer, provider_used: "gemini", model_used: "gemini-2.5-flash" };
      }

      // If Gemini failed for reasons other than rate/quota -> stop
      if (!isRateLimitOrQuota(g.status, g.raw)) {
        const e = new Error("Gemini API error");
        e.status = g.status || 500;
        e.detail = g.raw;
        throw e;
      }

      // 2) Fallback to OpenAI when Gemini is rate-limited/quota
      const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
      if (!OPENAI_API_KEY) {
        const e = new Error("Gemini rate-limited, and Missing OPENAI_API_KEY for fallback");
        e.status = 429;
        e.detail = g.raw;
        throw e;
      }

      const o = await callOpenAIChat({ apiKey: OPENAI_API_KEY, messages: compact });

      if (o.ok) {
        const data = safeJson(o.raw) || {};
        const answer = data?.choices?.[0]?.message?.content || "";
        return { answer, provider_used: "openai", model_used: "gpt-3.5-turbo" };
      }

      const status = o.status || 500;
      const payload = {
        error: "Fallback provider error",
        gemini_status: g.status,
        openai_status: o.status,
        detail: safeJson(o.raw) ? safeJson(o.raw) : o.raw
      };

      return { __error: true, __status: status, __payload: payload };
    });

    if (result && result.__error) {
      return res.status(result.__status).json(result.__payload);
    }

    return res.json(result);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || "Server error",
      detail: err.detail || null
    });
  }
});


// ================== HTTP SERVER ==================
const server = http.createServer(app);

// ================== WEBSOCKET ==================
const wss = new WebSocket.Server({ server });

// roomId -> { clients:Set<ws>, lastState:Object|null, locks:Map<string,{by:string,at:number}> }
const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { clients: new Set(), lastState: null, locks: new Map() });
  }
  return rooms.get(roomId);
}

function safeSend(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function broadcast(roomId, obj, exceptWs = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const client of room.clients) {
    if (client !== exceptWs && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(obj));
    }
  }
}

function notifyPresence(roomId) {
  const room = rooms.get(roomId);
  const count = room ? room.clients.size : 0;
  broadcast(roomId, { type: "presence", room: roomId, count });
}

wss.on("connection", (ws) => {
  ws._roomId = null;
  ws._clientId = null;

  ws.on("message", (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }

    const { type, room: roomId, clientId } = msg || {};

    const by = msg.by || clientId || ws._clientId || null;
    if (clientId && !ws._clientId) ws._clientId = clientId;
    if (msg.by && !ws._clientId) ws._clientId = msg.by;

    if (!type || !roomId) return;

    if (type === "join") {
      const room = getRoom(roomId);
      room.clients.add(ws);
      ws._roomId = roomId;
      if (by && !ws._clientId) ws._clientId = by;

      if (room.lastState) {
        safeSend(ws, {
          type: "state",
          room: roomId,
          clientId: "server",
          payload: room.lastState
        });
      }

      safeSend(ws, { type: "locks", room: roomId, payload: Object.fromEntries(room.locks) });

      safeSend(ws, { type: "joined", room: roomId });
      notifyPresence(roomId);
      return;
    }

    if (ws._roomId !== roomId) {
      const room = getRoom(roomId);
      room.clients.add(ws);
      ws._roomId = roomId;
      if (by && !ws._clientId) ws._clientId = by;
    }

    
    if (type === "lock") {
      const room = getRoom(roomId);
      const fieldId = String(msg.fieldId || "").trim();
      const locker = by;

      if (!fieldId || !locker) return;

      const cur = room.locks.get(fieldId);
      if (cur && cur.by && cur.by !== locker) {
        // đã có người khác lock => báo lại cho requester
        safeSend(ws, { type: "lock-denied", room: roomId, fieldId, by: cur.by, at: cur.at || Date.now() });
        return;
      }

      room.locks.set(fieldId, { by: locker, at: msg.at || Date.now() });
      broadcast(roomId, { type: "lock", room: roomId, fieldId, by: locker, at: msg.at || Date.now() }, ws);
      return;
    }

    if (type === "unlock") {
      const room = getRoom(roomId);
      const fieldId = String(msg.fieldId || "").trim();
      const locker = by;

      if (!fieldId || !locker) return;

      const cur = room.locks.get(fieldId);
      if (cur && cur.by === locker) {
        room.locks.delete(fieldId);
        broadcast(roomId, { type: "unlock", room: roomId, fieldId, by: locker, at: msg.at || Date.now() }, ws);
      }
      return;
    }

if (type === "state") {
      const room = getRoom(roomId);
      if (msg.payload && typeof msg.payload === "object") {
        room.lastState = msg.payload;
      }
      broadcast(
        roomId,
        { type: "state", room: roomId, clientId, payload: msg.payload },
        ws
      );
      return;
    }

    if (type === "clear") {
      const room = getRoom(roomId);
      room.lastState = null;

      // clear lock luôn để tránh kẹt ô sau khi reset
      room.locks.clear();
      broadcast(roomId, { type: "locks", room: roomId, payload: {} }, null);

      broadcast(roomId, { type: "clear", room: roomId, clientId }, ws);
    }
  });

  ws.on("close", () => {
    const roomId = ws._roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    // cleanup locks do client này giữ
    const cid = ws._clientId;
    if (cid) {
      const toUnlock = [];
      for (const [fieldId, meta] of room.locks.entries()) {
        if (meta && meta.by === cid) toUnlock.push(fieldId);
      }
      if (toUnlock.length) {
        for (const fieldId of toUnlock) room.locks.delete(fieldId);
        // broadcast unlock từng field để client cập nhật UI
        for (const fieldId of toUnlock) {
          broadcast(roomId, { type: "unlock", room: roomId, fieldId, by: cid, at: Date.now() }, null);
        }
        // và gửi snapshot locks để client mới join sync đúng
        broadcast(roomId, { type: "locks", room: roomId, payload: Object.fromEntries(room.locks) }, null);
      }
    }

    room.clients.delete(ws);
    if (room.clients.size === 0) {
      rooms.delete(roomId);
    } else {
      notifyPresence(roomId);
    }
  });
});

// ================== START SERVER ==================
server.listen(PORT, () => {
  console.log("Server listening on port", PORT);
});
