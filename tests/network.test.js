import { test } from "vitest";
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
test("six clients select games, reset readiness, resume, reject stale input, finish and rematch", async () => {
  let clock = 1000;
  const server = await createGameServer({ nowMs: () => clock });
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
    for (let i = 1; i < 6; i++) {
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
    const call = (s, type, body = {}) =>
      s.timeout(2500).emitWithAck("command", { type, ...body });
    assert.equal(
      (await call(clients[1], "settings", { value: { rounds: 3 } })).ok,
      false,
    );
    await call(host, "ready", { value: true });
    await call(host, "settings", {
      value: {
        rounds: 3,
        mode: "alternate",
        enabledGames: ["falling-floor", "push-out"],
      },
    });
    assert.ok(r.players.every((p) => !p.ready));
    for (const s of clients.slice(0, 6))
      await call(s, "ready", { value: true });
    await call(host, "start");
    assert.equal(r.phase, "intro");
    const offline = event(host, "state", (s) => !s.players[2].connected);
    clients[2].disconnect();
    await offline;
    clock += 100;
    const restored = await connect(),
      resumed = event(restored, "joined");
    restored.emit("resume", info[2]);
    assert.equal((await resumed).id, info[2].id);
    const active = [host, clients[1], restored, ...clients.slice(3, 6)];
    for (let round = 1; round <= 3; round++) {
      const all = Promise.all(
        active.map((s) =>
          event(s, "state", (v) => v.phase === "playing" && v.round === round),
        ),
      );
      clock = r.start;
      await all;
      const packet = {
        matchId: r.matchId,
        roundIndex: r.round,
        seq: 0,
        x: 1,
        y: 0,
      };
      host.emit("command", { type: "move", ...packet });
      host.emit("command", { type: "move", ...packet, x: -1 });
      host.emit("command", {
        type: "move",
        ...packet,
        roundIndex: 0,
        seq: 8,
        x: -1,
      });
      await event(host, "state", (v) => v.players[0].moveSeq === 0);
      assert.equal(r.players[0].dx, 1);
      const end = Promise.all(
        active.map((s) =>
          event(s, "state", (v) => v.phase === "result" && v.round === round),
        ),
      );
      if (r.game === "push-out")
        r.players.forEach((p, i) => {
          p.x = Math.cos(i) * 1.2;
          p.y = Math.sin(i) * 1.2;
        });
      clock = r.game === "push-out" ? r.start + 90000 : r.start + 1200;
      const snapshots = await end;
      for (const state of snapshots)
        assert.deepEqual(state.results, snapshots[0].results);
      const next = event(
        host,
        "state",
        (v) => v.phase === (round === 3 ? "final" : "intro"),
      );
      clock = r.nextRound;
      await next;
    }
    assert.equal(r.history.length, 3);
    await call(host, "replay");
    assert.equal(r.phase, "lobby");
    assert.ok(r.players.every((p) => !p.ready && p.score === 0));
    await call(host, "settings", {
      value: { mode: "single", singleGame: "push-out" },
    });
    for (const c of active) await call(c, "ready", { value: true });
    await call(host, "start");
    assert.ok(r.schedule.every((g) => g === "push-out"));
    const transfer = event(active[1], "state", (v) => v.host === info[1].id);
    host.emit("command", { type: "leave" });
    await transfer;
    assert.equal(r.players[0].forfeited, true);
    const gone = event(active[1], "state", (v) => !v.players[2].connected);
    restored.disconnect();
    await gone;
    const expired = event(active[1], "state", (v) => v.players[2].forfeited);
    clock += 10001;
    await expired;
    const late = await connect(),
      deniedResume = event(late, "expired");
    late.emit("resume", info[2]);
    await deniedResume;
    for (const c of active.slice(3)) {
      c.emit("command", { type: "leave" });
    }
    await event(
      active[1],
      "state",
      (v) => v.phase === "lobby" && v.players.length === 1,
    );
  } finally {
    for (const s of clients) s.disconnect();
    await server.close();
  }
});
