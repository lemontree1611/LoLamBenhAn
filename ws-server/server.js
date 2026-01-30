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
const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

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

// ====== CHAT API (Gemini) ======
app.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body || {};

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "messages must be an array" });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    // Chuyển messages -> format Gemini
    const contents = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" +
      `?key=${GEMINI_API_KEY}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents })
    });

    const raw = await r.text();

    if (!r.ok) {
      return res.status(r.status).json({
        error: "Gemini API error",
        detail: raw
      });
    }

    const data = JSON.parse(raw);

    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================== HTTP SERVER ==================
const server = http.createServer(app);

// ================== WEBSOCKET ==================
const wss = new WebSocket.Server({ server });

// roomId -> { clients:Set<ws>, lastState:Object|null, locks:Map<string,{by:string,at:number}> }|// roomId -> { clients:Set<ws>, lastState:Object|null, locks:Map<string,{by:string,at:number}> }
const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { clients: new Set(), lastState: // roomId -> { clients:Set<ws>, lastState:Object|null, locks:Map<string,{by:string,at:number}> });
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
