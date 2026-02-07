// ws-server/server.js
// WebSocket + HTTP API (Gemini) + Comments API (Postgres) + HOI CHAN CHAT
// Chạy tốt trên Render

const http = require("http");
const WebSocket = require("ws");
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { Pool } = require("pg");
const { OAuth2Client } = require("google-auth-library");
const { v2: cloudinary } = require("cloudinary");

const PORT = process.env.PORT || 10000;

// ====== GOOGLE (Hoichan) ======
const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  "809932517901-53dirqapfjqbroadjilk8oeqtj0qugfj.apps.googleusercontent.com";

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const HOICHAN_ADMIN_EMAIL = "minhtri16112002@gmail.com";

function isHoichanAdminEmail(email) {
  return String(email || "").toLowerCase() === HOICHAN_ADMIN_EMAIL;
}

// ====== CLOUDINARY (Hoichan uploads) ======
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "";
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "";
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "";
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "hoichan";

const cloudinaryEnabled =
  !!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);

if (cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET
  });
} else {
  console.warn("[hoichan] Cloudinary not configured. File uploads will fail.");
}

// ================== EXPRESS (HTTP API) ==================
const app = express();
app.set("trust proxy", true);

// ====== CORS ======
const defaultCorsOrigins = ["https://lolambenhan.vercel.app"];

const corsOrigins = Array.from(
  new Set(
    defaultCorsOrigins.concat(
      (process.env.CORS_ORIGINS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    )
  )
);

app.use(
  cors({
    origin: function (origin, cb) {
      if (!origin) return cb(null, true);
      if (corsOrigins.length === 0) return cb(null, true);
      return corsOrigins.includes(origin)
        ? cb(null, true)
        : cb(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

app.use(express.json({ limit: "1mb" }));

// ====== IP BLOCKLIST ======
function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (xf) return String(xf).split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function parseBlockedIps() {
  return String(process.env.BLOCKED_IPS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isBlockedIp(ip) {
  const list = parseBlockedIps();
  if (!list.length) return false;
  return list.includes(ip);
}

app.use((req, res, next) => {
  const ip = getClientIp(req);
  if (isBlockedIp(ip)) {
    return res.status(403).json({ error: "IP blocked" });
  }
  return next();
});

app.use((err, req, res, next) => {
  if (err && String(err.message || "").includes("Not allowed by CORS")) {
    return res
      .status(403)
      .json({ error: "CORS blocked", origin: req.headers.origin || null });
  }
  return next(err);
});

app.get("/", (req, res) => {
  res.send("WS + Gemini API server is running.");
});

app.get("/healthz", (req, res) => res.send("ok"));

// ================== POSTGRES (COMMENTS + HOICHAN) ==================
const DATABASE_URL = process.env.DATABASE_URL || "";
let pool = null;

if (DATABASE_URL) {
  // Supabase/Render/Neon đều yêu cầu SSL cho kết nối public
  const needsSSL =
    process.env.NODE_ENV === "production" ||
    /render\.com|supabase\.co|neon\.tech/i.test(DATABASE_URL) ||
    DATABASE_URL.includes("sslmode=require");

  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: needsSSL ? { rejectUnauthorized: false } : false
  });
} else {
  console.warn("Missing DATABASE_URL - comments APIs will not work until set.");
}

// ====== ADMIN (simple token) ======
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || "";

function makeToken() {
  const raw = crypto.randomBytes(24).toString("hex");
  const sig = crypto
    .createHmac("sha256", ADMIN_TOKEN_SECRET)
    .update(raw)
    .digest("hex");
  return `${raw}.${sig}`;
}

function verifyToken(token) {
  if (!token || !ADMIN_TOKEN_SECRET) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [raw, sig] = parts;
  const expected = crypto
    .createHmac("sha256", ADMIN_TOKEN_SECRET)
    .update(raw)
    .digest("hex");
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

// ====== COMMENTS: schema + helpers ======
async function commentsInitTable() {
  if (!pool) return;
  await pool.query(`ALTER TABLE comments ADD COLUMN IF NOT EXISTS ip TEXT;`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_comments_ip_created_at
     ON comments (ip, created_at DESC);`
  );
}

// ====== COMMENTS API ======
app.get("/comments", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DB not configured" });

  try {
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
    const ip = getClientIp(req);

    const LIMIT = 5;
    const WINDOW_DAYS = 7;
    const COOLDOWN_SECONDS = 30;

    if (!username) return res.status(400).json({ error: "Vui lòng nhập nickname" });
    if (!text) return res.status(400).json({ error: "Vui lòng nhập nội dung góp ý" });

    const { rows: countRows } = await pool.query(
      `select count(*)::int as cnt
       from comments
       where ip = $1
         and created_at >= now() - interval '${WINDOW_DAYS} days'`,
      [ip]
    );

    if ((countRows[0]?.cnt || 0) >= LIMIT) {
      return res.status(429).json({
        error:
          "Bạn đã gửi quá 5 góp ý trong 7 ngày qua. Vui lòng thử lại sau."
      });
    }

    const { rows: lastRows } = await pool.query(
      `select created_at
       from comments
       where ip = $1
       order by created_at desc
       limit 1`,
      [ip]
    );

    if (lastRows.length) {
      const lastAt = new Date(lastRows[0].created_at).getTime();
      if (Number.isFinite(lastAt) && Date.now() - lastAt < COOLDOWN_SECONDS * 1000) {
        return res.status(429).json({
          error: "Bạn đang góp ý quá nhanh (spam)"
        });
      }
    }

    const { rows } = await pool.query(
      `insert into comments (username, text, ip)
       values ($1, $2, $3)
       returning id, username, text, heart,
                 to_char(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI:SS') as date`,
      [username.slice(0, 50), text.slice(0, 1000), ip]
    );

    res.json({ ok: true, item: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB error" });
  }
});

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

app.delete("/comments/:id", requireAdmin, async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DB not configured" });

  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

    const { rows } = await pool.query(
      "delete from comments where id = $1 returning id",
      [id]
    );

    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, deleted: true, id: rows[0].id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB error" });
  }
});

app.post("/comments/:id/delete", requireAdmin, async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DB not configured" });

  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

    const { rows } = await pool.query(
      "delete from comments where id = $1 returning id",
      [id]
    );

    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, deleted: true, id: rows[0].id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB error" });
  }
});

// ================== CHAT PROTECTION + FALLBACK HELPERS ==================
// (Giữ nguyên y như file backup của bạn)
const chatRate = new Map();
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

const ipActive = new Map();
const chatQueue = [];

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

const cooldownUntil = new Map();
function inCooldown(key) {
  return Date.now() < (cooldownUntil.get(key) || 0);
}
function setCooldown(key) {
  const minMs = Number(process.env.COOLDOWN_MIN_MS || 30000);
  const maxMs = Number(process.env.COOLDOWN_MAX_MS || 60000);
  const dur = minMs + Math.floor(Math.random() * Math.max(1, maxMs - minMs));
  cooldownUntil.set(key, Date.now() + dur);
  return dur;
}

function safeJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
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
      "TÓM TẮT NGỮ CẢNH TRƯỚC ĐÓ (rút gọn tự động):\n" + summaryLines.join("\n")
  };

  return [summaryMsg, ...tail];
}

async function callGemini({ apiKey, messages }) {
  const key = "gemini:gemini-2.5-flash";
  if (inCooldown(key)) {
    return { ok: false, status: 429, raw: "Gemini in cooldown" };
  }

  const contents = messages.map((m) => ({
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

function getGroqModels() {
  const rawList = String(process.env.GROQ_MODELS || "").trim();
  const rawSingle = String(process.env.GROQ_MODEL || "").trim();
  const pick = rawList || rawSingle;

  if (pick) {
    return pick
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
}

async function callGroqChat({ apiKey, model, messages }) {
  const key = `groq:${model}`;

  if (inCooldown(key)) {
    return { ok: false, status: 429, raw: "Groq in cooldown" };
  }

  const payload = {
    model,
    messages: messages.map((m) => ({
      role: m.role === "model" ? "assistant" : m.role,
      content: String(m.content ?? "")
    })),
    temperature: 0.7
  };

  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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

app.post("/chat", async (req, res) => {
  try {
    const ip =
      (req.headers["x-forwarded-for"]
        ? String(req.headers["x-forwarded-for"]).split(",")[0].trim()
        : "") ||
      req.socket?.remoteAddress ||
      "unknown";

    const rl = rateLimitChat(ip);
    if (!rl.ok) {
      return res.status(429).json({
        error: "Rate limited",
        retry_after_sec: rl.retryAfterSec
      });
    }

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

      const compact = condenseMessages(messages);

      const g = await callGemini({ apiKey: GEMINI_API_KEY, messages: compact });

      if (g.ok) {
        const data = safeJson(g.raw) || {};
        const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        return { answer, provider_used: "gemini", model_used: "gemini-2.5-flash" };
      }

      if (!isRateLimitOrQuota(g.status, g.raw)) {
        const e = new Error("Gemini API error");
        e.status = g.status || 500;
        e.detail = g.raw;
        throw e;
      }

      const GROQ_API_KEY = process.env.GROQ_API_KEY;
      if (!GROQ_API_KEY) {
        const e = new Error(
          "Gemini rate-limited, and Missing GROQ_API_KEY for fallback"
        );
        e.status = 429;
        e.detail = g.raw;
        throw e;
      }

      const groqModels = getGroqModels();
      let lastGroq = null;

      for (const model of groqModels) {
        const o = await callGroqChat({
          apiKey: GROQ_API_KEY,
          model,
          messages: compact
        });
        lastGroq = { model, status: o.status, raw: o.raw };

        if (o.ok) {
          const data = safeJson(o.raw) || {};
          const answer = data?.choices?.[0]?.message?.content || "";
          return { answer, provider_used: "groq", model_used: model };
        }

        if (!isRateLimitOrQuota(o.status, o.raw)) {
          const e = new Error("Groq API error");
          e.status = o.status || 500;
          e.detail = o.raw;
          throw e;
        }
      }

      const status = (lastGroq && lastGroq.status) || 429;
      const payload = {
        error: "All Groq fallback models are rate-limited or unavailable",
        gemini: {
          status: g.status,
          detail: safeJson(g.raw) ? safeJson(g.raw) : g.raw
        },
        groq: {
          tried_models: groqModels,
          last: lastGroq
            ? {
                model: lastGroq.model,
                status: lastGroq.status,
                detail: safeJson(lastGroq.raw)
                  ? safeJson(lastGroq.raw)
                  : lastGroq.raw
              }
            : null
        }
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

// ================== WEBSOCKET (FIX: noServer + route by path) ==================
// WS cũ (bệnh án)
const wss = new WebSocket.Server({ noServer: true });

// WS hội chẩn
const hoichanWss = new WebSocket.Server({ noServer: true });

const HOICHAN_PATH = "/ws-hoichan";

// ---------- HOI CHAN: DB helpers ----------
async function hoichanInitTable() {
  if (!pool) {
    console.warn("[hoichan] Missing DATABASE_URL => history will NOT be stored.");
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hoichan_messages (
      id TEXT PRIMARY KEY,
      sub TEXT NOT NULL,
      name TEXT NOT NULL,
      is_admin BOOLEAN DEFAULT FALSE,
      heart BOOLEAN DEFAULT FALSE,
      heart_count INTEGER DEFAULT 0,
      text TEXT NOT NULL,
      file_name TEXT,
      file_mime TEXT,
      file_size INTEGER,
      file_url TEXT,
      file_public_id TEXT,
      file_resource_type TEXT,
      at BIGINT NOT NULL
    );
  `);
  await pool.query(`ALTER TABLE hoichan_messages ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE hoichan_messages ADD COLUMN IF NOT EXISTS heart BOOLEAN DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE hoichan_messages ADD COLUMN IF NOT EXISTS heart_count INTEGER DEFAULT 0;`);
  await pool.query(`ALTER TABLE hoichan_messages ADD COLUMN IF NOT EXISTS file_name TEXT;`);
  await pool.query(`ALTER TABLE hoichan_messages ADD COLUMN IF NOT EXISTS file_mime TEXT;`);
  await pool.query(`ALTER TABLE hoichan_messages ADD COLUMN IF NOT EXISTS file_size INTEGER;`);
  await pool.query(`ALTER TABLE hoichan_messages ADD COLUMN IF NOT EXISTS file_url TEXT;`);
  await pool.query(`ALTER TABLE hoichan_messages ADD COLUMN IF NOT EXISTS file_public_id TEXT;`);
  await pool.query(`ALTER TABLE hoichan_messages ADD COLUMN IF NOT EXISTS file_resource_type TEXT;`);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_hoichan_messages_at
    ON hoichan_messages(at DESC);
  `);
  console.log("[hoichan] table ready");
}

async function hoichanLoadLatest(limit = 50) {
  if (!pool) return [];
  const n = Math.max(1, Math.min(Number(limit) || 50, 200));
  const { rows } = await pool.query(
    `SELECT id, sub, name, heart, heart_count, text, file_name, file_mime, file_size, file_url, file_public_id, file_resource_type, at
     FROM hoichan_messages
     ORDER BY at DESC
     LIMIT $1`,
    [n]
  );
  return rows.reverse();
}

async function hoichanInsert(m) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO hoichan_messages (id, sub, name, heart, heart_count, text, file_name, file_mime, file_size, file_url, file_public_id, file_resource_type, at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (id) DO NOTHING`,
    [m.id, m.sub, m.name, m.heart, m.heart_count, m.text, m.file_name, m.file_mime, m.file_size, m.file_url, m.file_public_id, m.file_resource_type, m.at]
  );
}

async function verifyGoogleIdToken(idToken) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID
  });
  const p = ticket.getPayload();
  const email = String(p?.email || "");
  const name = p?.name || "Unknown";
  return { name, sub: p?.sub || "", email };
}

function safeSendHC(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function broadcastHC(obj) {
  const data = JSON.stringify(obj);
  for (const client of hoichanWss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}

const MAX_HOICHAN_FILE_BYTES = 5 * 1024 * 1024;

function parseDataUrl(str) {
  const s = String(str || "");
  const m = /^data:([^;]+);base64,(.+)$/i.exec(s);
  if (!m) return null;
  return { mime: m[1], b64: m[2] };
}

function base64Bytes(b64) {
  const clean = String(b64 || "");
  const len = clean.length;
  if (!len) return 0;
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

async function hoichanCleanupOldFiles() {
  if (!pool) return;
  if (!cloudinaryEnabled) return;

  const days = Math.max(1, Number(process.env.HOICHAN_CLEANUP_DAYS || 7));
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const { rows } = await pool.query(
    `SELECT id, file_public_id, file_resource_type
     FROM hoichan_messages
     WHERE file_public_id IS NOT NULL
       AND file_public_id <> ''
       AND at < $1
     LIMIT 200`,
    [cutoff]
  );

  if (rows.length === 0) return;

  const byType = new Map();
  for (const r of rows) {
    const t = r.file_resource_type || "image";
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push(r.file_public_id);
  }

  for (const [resourceType, ids] of byType) {
    try {
      await cloudinary.api.delete_resources(ids, { resource_type: resourceType });
    } catch (e) {
      console.error("[hoichan] cleanup delete_resources error", e);
    }
  }

  const ids = rows.map((r) => r.id);
  await pool.query(
    `UPDATE hoichan_messages
     SET file_url = NULL,
         file_public_id = NULL,
         file_resource_type = NULL,
         text = CASE WHEN text IS NULL OR text = '' THEN '[File đã bị xoá]' ELSE text END
     WHERE id = ANY($1::text[])`,
    [ids]
  );
}

async function hoichanDeleteById(id) {
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT id, file_public_id, file_resource_type
     FROM hoichan_messages
     WHERE id = $1`,
    [id]
  );
  if (rows.length === 0) return null;
  const row = rows[0];

  if (cloudinaryEnabled && row.file_public_id) {
    try {
      await cloudinary.uploader.destroy(row.file_public_id, {
        resource_type: row.file_resource_type || "image"
      });
    } catch (e) {
      console.error("[hoichan] delete file error", e);
    }
  }

  await pool.query("DELETE FROM hoichan_messages WHERE id = $1", [id]);
  return row;
}

async function hoichanAddHeart(id, bySub) {
  if (!pool) return null;
  const { rows } = await pool.query(
    `UPDATE hoichan_messages
     SET heart_count = heart_count + 1
     WHERE id = $1
       AND sub <> $2
     RETURNING id, heart_count`,
    [id, bySub]
  );
  if (rows.length === 0) return null;
  return rows[0];
}

async function uploadToCloudinary(dataUrl, name) {
  if (!cloudinaryEnabled) {
    const e = new Error("Cloudinary not configured");
    e.status = 500;
    throw e;
  }
  const result = await cloudinary.uploader.upload(dataUrl, {
    folder: CLOUDINARY_FOLDER,
    resource_type: "auto",
    public_id: name ? name.replace(/\.[^.]+$/, "") : undefined
  });
  return {
    url: result.secure_url || result.url,
    public_id: result.public_id || "",
    resource_type: result.resource_type || "image"
  };
}

// ---------- HOI CHAN: WS logic ----------
hoichanWss.on("connection", (ws) => {
  ws._hoichanUser = null;

  hoichanLoadLatest(50)
    .then((items) => safeSendHC(ws, { type: "history", items }))
    .catch(() => safeSendHC(ws, { type: "history", items: [] }));

  ws.on("message", async (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }

    if (msg.type === "auth") {
      try {
        const token = String(msg.token || "");
        if (!token) {
          safeSendHC(ws, { type: "error", message: "Missing Google token" });
          ws.close();
          return;
        }
        ws._hoichanUser = await verifyGoogleIdToken(token);
        safeSendHC(ws, {
          type: "auth_ok",
          name: ws._hoichanUser.name,
          sub: ws._hoichanUser.sub
        });
      } catch {
        safeSendHC(ws, { type: "error", message: "Google token không hợp lệ" });
        ws.close();
      }
      return;
    }

    if (!ws._hoichanUser) {
      safeSendHC(ws, { type: "error", message: "Bạn chưa đăng nhập" });
      ws.close();
      return;
    }

    if (msg.type === "send") {
      const text = String(msg.text || "").trim();
      if (!text) return;
      if (text.length > 2000) return;

      const out = {
        type: "message",
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: ws._hoichanUser.name,
        sub: ws._hoichanUser.sub,
        heart: false,
        heart_count: 0,
        text,
        at: Date.now()
      };

      hoichanInsert(out).catch((e) => console.error("[hoichan] insert error", e));
      broadcastHC(out);
    }

    if (msg.type === "send_file") {
      const nameRaw = String(msg.name || "file").trim();
      const name = (nameRaw || "file").slice(0, 200);
      const data = String(msg.data || "");
      const parsed = parseDataUrl(data);
      if (!parsed) return;

      const declaredSize = Number(msg.size || 0);
      const decodedSize = base64Bytes(parsed.b64);
      const size = Number.isFinite(declaredSize) && declaredSize > 0
        ? declaredSize
        : decodedSize;

      if (!size || size > MAX_HOICHAN_FILE_BYTES) return;
      if (decodedSize && decodedSize > MAX_HOICHAN_FILE_BYTES) return;

      const mime = String(parsed.mime || msg.mime || "application/octet-stream")
        .trim()
        .slice(0, 100);

      let uploaded;
      try {
        uploaded = await uploadToCloudinary(data, name);
      } catch (e) {
        safeSendHC(ws, { type: "error", message: "Không upload được file" });
        return;
      }

      const out = {
        type: "message",
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: ws._hoichanUser.name,
        sub: ws._hoichanUser.sub,
        heart: false,
        heart_count: 0,
        text: "",
        file_name: name,
        file_mime: mime,
        file_size: size,
        file_url: uploaded.url,
        file_public_id: uploaded.public_id,
        file_resource_type: uploaded.resource_type,
        at: Date.now()
      };

      hoichanInsert(out).catch((e) => console.error("[hoichan] insert error", e));
      broadcastHC(out);
    }

    if (msg.type === "delete") {
      const id = String(msg.id || "").trim();
      if (!id) return;
      if (!isHoichanAdminEmail(ws._hoichanUser.email)) return;

      const deleted = await hoichanDeleteById(id);
      if (!deleted) return;
      broadcastHC({ type: "delete", id });
    }

    if (msg.type === "heart") {
      const id = String(msg.id || "").trim();
      if (!id) return;
      const updated = await hoichanAddHeart(id, ws._hoichanUser.sub);
      if (!updated) return;
      broadcastHC({ type: "heart", id: updated.id, heart_count: updated.heart_count });
    }
  });
});

// ====== HOI CHAN: weekly cleanup ======
const cleanupEnabled =
  String(process.env.HOICHAN_CLEANUP_ENABLED || "1").toLowerCase() !== "0";
const cleanupIntervalHours = Math.max(
  1,
  Number(process.env.HOICHAN_CLEANUP_INTERVAL_HOURS || 24)
);

if (cleanupEnabled) {
  setTimeout(() => {
    hoichanCleanupOldFiles()
      .catch((e) => console.error("[hoichan] cleanup error", e));
  }, 15_000);

  setInterval(() => {
    hoichanCleanupOldFiles()
      .catch((e) => console.error("[hoichan] cleanup error", e));
  }, cleanupIntervalHours * 60 * 60 * 1000);
}

// ================== WS CŨ (BỆNH ÁN) - GIỮ NGUYÊN ==================
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

      safeSend(ws, {
        type: "locks",
        room: roomId,
        payload: Object.fromEntries(room.locks)
      });

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
        safeSend(ws, {
          type: "lock-denied",
          room: roomId,
          fieldId,
          by: cur.by,
          at: cur.at || Date.now()
        });
        return;
      }

      room.locks.set(fieldId, { by: locker, at: msg.at || Date.now() });
      broadcast(
        roomId,
        { type: "lock", room: roomId, fieldId, by: locker, at: msg.at || Date.now() },
        ws
      );
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
        broadcast(
          roomId,
          { type: "unlock", room: roomId, fieldId, by: locker, at: msg.at || Date.now() },
          ws
        );
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

    const cid = ws._clientId;
    if (cid) {
      const toUnlock = [];
      for (const [fieldId, meta] of room.locks.entries()) {
        if (meta && meta.by === cid) toUnlock.push(fieldId);
      }
      if (toUnlock.length) {
        for (const fieldId of toUnlock) room.locks.delete(fieldId);
        for (const fieldId of toUnlock) {
          broadcast(
            roomId,
            { type: "unlock", room: roomId, fieldId, by: cid, at: Date.now() },
            null
          );
        }
        broadcast(
          roomId,
          { type: "locks", room: roomId, payload: Object.fromEntries(room.locks) },
          null
        );
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

// ================== UPGRADE ROUTER (QUAN TRỌNG) ==================
server.on("upgrade", (req, socket, head) => {
  const pathname = new URL(req.url, "http://localhost").pathname;

  // Route hội chẩn
  if (pathname === HOICHAN_PATH) {
    hoichanWss.handleUpgrade(req, socket, head, (ws) => {
      hoichanWss.emit("connection", ws, req);
    });
    return;
  }

  // Default: WS cũ (bệnh án)
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

// ================== START SERVER ==================
server.listen(PORT, () => {
  console.log("Server listening on port", PORT);

  // init table hội chẩn (nếu pool có)
  hoichanInitTable().catch((e) => console.error("[hoichan] init table error", e));
  commentsInitTable().catch((e) =>
    console.error("[comments] init table error", e)
  );
});
