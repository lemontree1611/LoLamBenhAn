// ws-server/server.js
// WebSocket + HTTP API (Gemini)
// Chạy tốt trên Render

const http = require("http");
const WebSocket = require("ws");
const express = require("express");
const cors = require("cors");

const PORT = process.env.PORT || 10000;

// ================== EXPRESS (HTTP API) ==================
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.send("WS + Gemini API server is running.");
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
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent" +
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

    const answer =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================== HTTP SERVER ==================
const server = http.createServer(app);

// ================== WEBSOCKET ==================
const wss = new WebSocket.Server({ server });

// roomId -> { clients:Set<ws>, lastState:Object|null }
const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { clients: new Set(), lastState: null });
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

  ws.on("message", (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }

    const { type, room: roomId, clientId } = msg || {};
    if (!type || !roomId) return;

    if (type === "join") {
      const room = getRoom(roomId);
      room.clients.add(ws);
      ws._roomId = roomId;

      if (room.lastState) {
        safeSend(ws, {
          type: "state",
          room: roomId,
          clientId: "server",
          payload: room.lastState
        });
      }

      safeSend(ws, { type: "joined", room: roomId });
      notifyPresence(roomId);
      return;
    }

    if (ws._roomId !== roomId) {
      const room = getRoom(roomId);
      room.clients.add(ws);
      ws._roomId = roomId;
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
      broadcast(roomId, { type: "clear", room: roomId, clientId }, ws);
    }
  });

  ws.on("close", () => {
    const roomId = ws._roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

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
  console.log("WS + Gemini API server listening on port", PORT);
});
