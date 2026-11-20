import express from "express";
import { createServer } from "node:http";
import { randomInt, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import {
  COLORS,
  room,
  player,
  configure,
  beginRound,
  move,
  action,
  tick,
} from "./game.js";

export async function createGameServer({ dev = false } = {}) {
  const app = express(),
    http = createServer(app),
    io = new Server(http, { maxHttpBufferSize: 10000 });
  const rooms = new Map(),
    sessions = new Map();
  app.get("/health", (_, res) => res.json({ ok: true }));
  let vite;
  if (dev) {
    const { createServer } = await import("vite");
    vite = await createServer({
      server: { middlewareMode: true, hmr: { server: http } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else app.use(express.static(resolve("dist")));
  const send = (r) => io.to(r.code).emit("state", r);
  function host(r) {
    if (!r.players.some((p) => p.id === r.host && p.connected && !p.bot))
      r.host = r.players.find((p) => p.connected && !p.bot)?.id ?? "";
  }
  function lobby(r) {
    r.phase = "lobby";
    r.round = 0;
    r.results = [];
    r.tiles = [];
    r.players = r.players.filter((p) => p.connected);
    for (const p of r.players)
      Object.assign(p, {
        score: 0,
        wins: 0,
        alive: false,
        ready: p.id === r.host || p.bot,
      });
    host(r);
  }
  function leave(s) {
    const r = rooms.get(s.code),
      p = r?.players.find((p) => p.id === s.id);
    if (r && p) {
      p.connected = false;
      p.dx = 0;
      p.dy = 0;
      if (r.phase === "lobby") r.players = r.players.filter((q) => q !== p);
      else if (p.alive) {
        p.alive = false;
        p.dead = Date.now();
      }
      host(r);
      if (!r.players.some((q) => !q.bot && sessions.has(q.id) && q !== p))
        rooms.delete(r.code);
      else send(r);
    }
    sessions.delete(s.id);
  }
  io.on("connection", (socket) => {
    let session;
    const reject = (message) => socket.emit("notice", message);
    function attach(r, p, s) {
      session = s;
      s.socket = socket.id;
      s.expiry = 0;
      sessions.set(p.id, s);
      p.connected = true;
      socket.join(r.code);
      if (!r.host) {
        r.host = p.id;
        p.ready = true;
      }
      socket.emit("joined", { id: p.id, token: s.token, code: r.code });
      send(r);
    }
    socket.on("resume", (data) => {
      if (session) return;
      const s = sessions.get(data?.id),
        r = rooms.get(s?.code),
        p = r?.players.find((p) => p.id === s.id);
      if (
        !p ||
        !s ||
        data.token !== s.token ||
        s.socket ||
        s.expiry < Date.now()
      ) {
        socket.emit("expired");
        return;
      }
      attach(r, p, s);
    });
    socket.on("enter", (data) => {
      if (session || !data || typeof data !== "object") return;
      const name =
        typeof data.name === "string" ? data.name.trim().slice(0, 12) : "";
      if (!name) return reject("닉네임을 입력해 주세요.");
      const mode = data.mode;
      let r, p;
      if (mode === "join") {
        r = rooms.get(String(data.code).trim().toUpperCase());
        if (!r) return reject("해당 코드의 방을 찾을 수 없어요.");
        if (r.phase !== "lobby" || r.practice)
          return reject("이미 게임이 진행 중인 방이에요.");
        if (r.players.length >= r.settings.maxPlayers)
          return reject("방이 가득 찼어요.");
      } else if (mode !== "create" && mode !== "practice") return;
      const free = COLORS.filter((c) => !r?.players.some((p) => p.color === c));
      p = player(
        randomUUID(),
        name,
        free.includes(data.color) ? data.color : free[0],
      );
      if (!r) {
        let code;
        do {
          code = String(randomInt(100000, 1000000));
        } while (rooms.has(code));
        r = room(code, p);
        p.ready = true;
        rooms.set(code, r);
      } else r.players.push(p);
      if (mode === "practice") {
        r.practice = true;
        r.settings.rounds = 3;
        ["픽셀", "젤리", "모찌", "포포"].forEach((n, i) =>
          r.players.push(
            player(randomUUID(), n, free.filter((c) => c !== p.color)[i], true),
          ),
        );
        beginRound(r, Date.now());
      }
      attach(r, p, { id: p.id, code: r.code, token: randomUUID() });
    });
    socket.on("command", (data) => {
      if (!session || !data) return;
      const r = rooms.get(session.code),
        p = r?.players.find((p) => p.id === session.id);
      if (!r || !p) return;
      const type = data.type,
        owner = r.host === p.id;
      if (type === "leave") {
        socket.leave(r.code);
        leave(session);
        session = undefined;
        socket.emit("left");
        return;
      }
      if (type === "move") {
        move(r, p, data.x, data.y, Date.now());
        return;
      }
      if (["jump", "dash", "item"].includes(type)) {
        action(r, p, type, Date.now());
        return;
      }
      if (type === "ready" && r.phase === "lobby" && !owner) p.ready = !p.ready;
      else if (type === "settings" && owner && r.phase === "lobby") {
        if (!configure(r, data.value))
          return reject("현재 참가 인원과 설정값을 확인해 주세요.");
      } else if (
        type === "color" &&
        r.phase === "lobby" &&
        COLORS.includes(data.value) &&
        !r.players.some((q) => q !== p && q.color === data.value)
      )
        p.color = data.value;
      else if (type === "start" && owner && r.phase === "lobby") {
        if (
          r.players.length < 2 ||
          r.players.some((q) => !q.connected || (!q.ready && q.id !== r.host))
        )
          return reject("두 명 이상 입장하고 모두 준비해야 시작할 수 있어요.");
        beginRound(r, Date.now());
      } else if (type === "next" && owner && r.phase === "result")
        beginRound(r, Date.now());
      else if (type === "lobby" && owner && r.phase === "final") lobby(r);
      else if (type === "replay" && owner && r.phase === "final") {
        lobby(r);
        if (r.players.length >= 2) beginRound(r, Date.now());
      } else return;
      send(r);
    });
    socket.on("disconnect", () => {
      if (!session || session.socket !== socket.id) return;
      session.socket = null;
      session.expiry = Date.now() + 5000;
      const r = rooms.get(session.code),
        p = r?.players.find((p) => p.id === session.id);
      if (p) {
        p.connected = false;
        p.dx = 0;
        p.dy = 0;
        send(r);
      }
    });
  });
  let frame = 0;
  const timer = setInterval(() => {
    const now = Date.now();
    frame++;
    for (const s of sessions.values())
      if (!s.socket && s.expiry <= now) leave(s);
    for (const r of rooms.values()) {
      if (r.phase === "lobby" || r.phase === "final") continue;
      const prev = r.phase;
      tick(r, now, 1 / 30);
      if (frame % 2 === 0 || r.phase !== prev) send(r);
    }
  }, 1000 / 30);
  return {
    http,
    io,
    rooms,
    close: async () => {
      clearInterval(timer);
      await vite?.close();
      await new Promise((resolve) => io.close(resolve));
    },
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { http } = await createGameServer({
    dev: process.argv.includes("--dev"),
  });
  const port = Number(process.env.PORT) || 3000;
  http.listen(port, "0.0.0.0", () =>
    console.log("Falling Floor  http://localhost:" + port),
  );
}
