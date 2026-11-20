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
  startMatch,
  resetReady,
  move,
  action,
  tick,
} from "./game.ts";

const clock = () => performance.timeOrigin + performance.now();
export async function createGameServer({ dev = false, nowMs = clock } = {}) {
  const app = express(),
    http = createServer(app),
    io = new Server(http, {
      maxHttpBufferSize: 10000,
      ...(process.env.CLIENT_ORIGINS
        ? {
            cors: {
              origin: process.env.CLIENT_ORIGINS.split(",").map((v) =>
                v.trim(),
              ),
            },
          }
        : {}),
    });
  const rooms = new Map(),
    sessions = new Map();
  app.get("/health", (_, res) =>
    res.json({ ok: true, game: "mini-game-party", version: 2 }),
  );
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
    r.players = r.players.filter((p) => !p.forfeited);
    r.matchId = null;
    r.schedule = [];
    r.history = [];
    r.game = "falling-floor";
    for (const p of r.players)
      Object.assign(p, { score: 0, wins: 0, alive: false });
    resetReady(r);
    host(r);
  }
  function leave(s) {
    const r = rooms.get(s.code),
      p = r?.players.find((p) => p.id === s.id);
    if (r && p) {
      p.connected = false;
      p.dx = 0;
      p.dy = 0;
      if (r.phase === "lobby") {
        r.players = r.players.filter((q) => q !== p);
        resetReady(r);
      } else {
        if (r.phase !== "final") p.forfeited = true;
        if (p.alive) {
          p.alive = false;
          p.dead = nowMs();
        }
        if (
          r.phase !== "final" &&
          r.players.filter((q) => !q.forfeited).length < 2
        ) {
          lobby(r);
          io.to(r.code).emit(
            "notice",
            "참가자가 두 명 미만이 되어 대기실로 돌아왔어요.",
          );
        }
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
    let reply;
    const reject = (message) => {
      reply?.({ ok: false, message });
      socket.emit("notice", message);
    };
    let windowStart = 0,
      count = 0,
      violations = 0;
    function acceptInput(r, p, data, type, now) {
      if (
        r.phase !== "playing" ||
        p.forfeited ||
        !p.alive ||
        data.matchId !== r.matchId ||
        data.roundIndex !== r.round
      )
        return false;
      if (now - windowStart >= 1000) {
        windowStart = now;
        count = 0;
        violations = Math.max(0, violations - 1);
      }
      if (++count > 30) {
        if (++violations > 100) socket.disconnect(true);
        return false;
      }
      const stream = type === "move" ? "moveSeq" : "actionSeq";
      if (
        type === "move" &&
        ![data.x, data.y].every((v) => Number.isFinite(v) && Math.abs(v) <= 1)
      )
        return false;
      if (!Number.isSafeInteger(data.seq) || data.seq <= p[stream])
        return false;
      p[stream] = data.seq;
      return true;
    }
    function attach(r, p, s) {
      session = s;
      s.socket = socket.id;
      s.expiry = 0;
      sessions.set(p.id, s);
      p.connected = true;
      p.moveSeq = -1;
      p.actionSeq = -1;
      socket.join(r.code);
      if (!r.host) {
        r.host = p.id;
        p.ready = p.bot;
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
        s.expiry < nowMs()
      ) {
        socket.emit("expired");
        return;
      }
      attach(r, p, s);
    });
    socket.on("enter", (data, ack) => {
      reply = typeof ack === "function" ? ack : undefined;
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
        if (r.players.some((q) => q.name === name))
          return reject(
            "이미 사용 중인 닉네임이에요. 다른 닉네임을 선택해 주세요.",
          );
        if (data.color && r.players.some((q) => q.color === data.color))
          return reject(
            "이미 선택된 캐릭터 색상이에요. 다른 색상을 선택해 주세요.",
          );
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
        p.ready = p.bot;
        rooms.set(code, r);
      } else r.players.push(p);
      resetReady(r);
      if (mode === "practice") {
        r.practice = true;
        r.settings.rounds = 3;
        ["픽셀", "젤리", "모찌", "포포", "귤이"].forEach((n, i) =>
          r.players.push(
            player(
              randomUUID(),
              n === p.name ? n + " 봇" : n,
              free.filter((c) => c !== p.color)[i],
              true,
            ),
          ),
        );
        p.ready = true;
        r.settings.mode = "single";
        r.settings.singleGame =
          data.practiceGame === "push-out" ? "push-out" : "falling-floor";
        startMatch(r, nowMs());
      }
      attach(r, p, { id: p.id, code: r.code, token: randomUUID() });
      reply?.({ ok: true, code: r.code });
    });
    socket.on("command", (data, ack) => {
      reply = typeof ack === "function" ? ack : undefined;
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
        reply?.({ ok: true });
        return;
      }
      const now = nowMs();
      if (["move", "jump", "dash", "push", "guard"].includes(type)) {
        if (!acceptInput(r, p, data, type, now)) return;
        if (type === "move") move(r, p, data.x, data.y, now);
        else action(r, p, type, now);
        return;
      }
      if (type === "ready" && r.phase === "lobby")
        p.ready = typeof data.value === "boolean" ? data.value : !p.ready;
      else if (type === "settings" && owner && r.phase === "lobby") {
        if (!configure(r, data.value))
          return reject("설정값과 현재 인원을 확인해 주세요.");
      } else if (type === "color" && r.phase === "lobby") {
        if (
          !COLORS.includes(data.value) ||
          r.players.some((q) => q !== p && q.color === data.value)
        )
          return reject("다른 색상을 선택해 주세요.");
        if (p.color !== data.value) {
          p.color = data.value;
          resetReady(r);
        }
      } else if (type === "start" && owner && r.phase === "lobby") {
        if (!startMatch(r, now))
          return reject(
            "방장을 포함해 두 명 이상 모두 준비해야 시작할 수 있어요.",
          );
      } else if (
        (type === "lobby" || type === "replay") &&
        owner &&
        r.phase === "final"
      ) {
        r.players = r.players.filter((q) => q.connected || sessions.has(q.id));
        lobby(r);
      } else return reject("현재 상태 또는 권한으로 실행할 수 없어요.");
      reply?.({ ok: true });
      send(r);
    });
    socket.on("disconnect", () => {
      if (!session || session.socket !== socket.id) return;
      session.socket = null;
      session.expiry = nowMs() + 10000;
      const r = rooms.get(session.code),
        p = r?.players.find((p) => p.id === session.id);
      if (p) {
        if (r.phase === "lobby") {
          leave(session);
          return;
        }
        p.connected = false;
        p.dx = 0;
        p.dy = 0;
        send(r);
      }
    });
  });
  let frame = 0;
  const timer = setInterval(() => {
    const now = nowMs();
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
    console.log("Mini Game Party  http://localhost:" + port),
  );
}
