// ws-server/server.js
// WebSocket server (ws thuần) cho tính năng chia sẻ realtime
// Rooms được lưu trong RAM (phục vụ demo/test). Restart sẽ mất state.

const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("WS server is running.\n");
});

const wss = new WebSocket.Server({ server });

// roomId -> { clients:Set<ws>, lastState:Object|null }
const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, { clients: new Set(), lastState: null });
  return rooms.get(roomId);
}

function safeSend(ws, obj) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(obj));
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
      // join room
      const room = getRoom(roomId);
      room.clients.add(ws);
      ws._roomId = roomId;

      // gửi state gần nhất cho người mới vào (nếu có)
      if (room.lastState) {
        safeSend(ws, { type: "state", room: roomId, clientId: "server", payload: room.lastState });
      }

      // xác nhận join + cập nhật presence cho cả phòng
      safeSend(ws, { type: "joined", room: roomId });
      notifyPresence(roomId);
      return;
    }

    // các message khác yêu cầu đã join
    if (ws._roomId !== roomId) {
      // auto-join (đỡ lỗi client)
      const room = getRoom(roomId);
      room.clients.add(ws);
      ws._roomId = roomId;
    }

    if (type === "state") {
      const room = getRoom(roomId);
      if (msg.payload && typeof msg.payload === "object") {
        room.lastState = msg.payload;
      }
      broadcast(roomId, { type: "state", room: roomId, clientId, payload: msg.payload }, ws);
      return;
    }

    if (type === "clear") {
      const room = getRoom(roomId);
      room.lastState = null;
      broadcast(roomId, { type: "clear", room: roomId, clientId }, ws);
      return;
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

server.listen(PORT, () => {
  console.log("WS server listening on port", PORT);
});
