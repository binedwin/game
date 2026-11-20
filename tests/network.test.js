import test from "node:test";
import assert from "node:assert/strict";
import { io } from "socket.io-client";
import { createGameServer } from "../server/index.js";
function event(client, name, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const done = (v) => {
      if (predicate(v)) {
        clearTimeout(timer);
        client.off(name, done);
        resolve(v);
      }
    };
    const timer = setTimeout(() => {
      client.off(name, done);
      reject(Error("Timed out waiting for " + name));
    }, 8000);
    client.on(name, done);
  });
}
test("five clients share a match, enforce readiness, resume, score three rounds and replay", async () => {
  const server = await createGameServer();
  await new Promise((resolve) => server.http.listen(0, "127.0.0.1", resolve));
  const url = "http://127.0.0.1:" + server.http.address().port;
  const clients = [];
  async function connect() {
    const s = io(url, {
      forceNew: true,
      autoConnect: false,
      reconnection: false,
    });
    clients.push(s);
    const ready = event(s, "connect");
    s.connect();
    await ready;
    return s;
  }
  try {
    const host = await connect(),
      joined = event(host, "joined");
    host.emit("enter", { mode: "create", name: "방장", color: "coral" });
    const session = await joined;
    const r = server.rooms.get(session.code);
    const info = [session];
    for (let i = 1; i < 5; i++) {
      const s = await connect(),
        joined = event(s, "joined");
      s.emit("enter", { mode: "join", name: "친구" + i, code: session.code });
      info.push(await joined);
    }
    const full = await connect();
    const denied = event(full, "notice");
    full.emit("enter", { mode: "join", name: "추가", code: session.code });
    assert.match(await denied, /가득/);
    const wait = event(host, "notice");
    host.emit("command", { type: "start" });
    assert.match(await wait, /준비/);
    const sync = event(
      host,
      "state",
      (r) => r.players.every((p) => p.ready) && r.settings.rounds === 3,
    );
    host.emit("command", { type: "settings", value: { rounds: 3 } });
    clients.slice(1, 5).forEach((s) => s.emit("command", { type: "ready" }));
    await sync;
    clients[2].disconnect();
    await event(host, "state", (s) => !s.players[2].connected);
    const restored = await connect(),
      resumed = event(restored, "joined");
    restored.emit("resume", info[2]);
    assert.equal((await resumed).id, info[2].id);
    const active = [host, clients[1], restored, clients[3], clients[4]];
    for (let round = 1; round <= 3; round++) {
      const countdown = Promise.all(
        active.map((s) =>
          event(
            s,
            "state",
            (r) => r.phase === "countdown" && r.round === round,
          ),
        ),
      );
      host.emit("command", { type: round === 1 ? "start" : "next" });
      const states = await countdown;
      for (const s of states) assert.deepEqual(s.tiles, states[0].tiles);
      // Advance only deadlines in this isolated server. Movement and scoring use the ordinary game loop.
      const playing = event(host, "state", (s) => s.phase === "playing");
      r.start = Date.now() - 1;
      await playing;
      const end = Promise.all(
        active.map((s) =>
          event(
            s,
            "state",
            (v) => v.phase === (round < 3 ? "result" : "final"),
          ),
        ),
      );
      r.tiles = r.tiles.map((v) => (v > 0 ? Date.now() - 1 : v));
      const result = await end;
      for (const s of result)
        assert.ok(s.players.every((p) => p.score === 3 * round));
    }
    const replay = event(
      host,
      "state",
      (r) => r.phase === "countdown" && r.round === 1,
    );
    host.emit("command", { type: "replay" });
    assert.ok((await replay).players.every((p) => p.score === 0));
    const transfer = event(active[1], "state", (s) => s.host === info[1].id);
    host.emit("command", { type: "leave" });
    await transfer;
  } finally {
    for (const s of clients) s.disconnect();
    await server.close();
  }
});
