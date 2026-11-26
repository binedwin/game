import { test, expect } from "vitest";
import { io } from "socket.io-client";
import { createGameServer } from "../server/index.js";
const once = (s, event, filter = () => true) =>
  new Promise((resolve, reject) => {
    const fn = (v) => {
      if (filter(v)) {
        clearTimeout(timer);
        s.off(event, fn);
        resolve(v);
      }
    };
    const timer = setTimeout(() => {
      s.off(event, fn);
      reject(Error("Timeout: " + event));
    }, 3000);
    s.on(event, fn);
  });
test("room packets hide secrets, authenticated reconnect restores only own role and ballot", async () => {
  let clock = 1000;
  const server = await createGameServer({ nowMs: () => clock });
  const clients = [],
    sessions = [],
    privateFrames = new Map(),
    publicFrames = [];
  let hostState;
  await new Promise((ok) => server.http.listen(0, "127.0.0.1", ok));
  async function connect() {
    const s = io("http://127.0.0.1:" + server.http.address().port, {
      forceNew: true,
      autoConnect: false,
      reconnection: false,
    });
    clients.push(s);
    s.on("state", (v) => {
      publicFrames.push(v);
      if (s === clients[0]) hostState = v;
    });
    s.on("liar:private", (v) => privateFrames.set(s, v));
    const online = once(s, "connect");
    s.connect();
    await online;
    return s;
  }
  const call = (s, event, data) => s.timeout(2500).emitWithAck(event, data);
  try {
    for (let i = 0; i < 3; i++) {
      const s = await connect(),
        joined = once(s, "joined");
      await call(s, "enter", {
        mode: i ? "join" : "create",
        name: "참가" + i,
        code: sessions[0]?.code,
      });
      sessions.push(await joined);
    }
    const host = clients[0];
    await call(host, "command", {
      type: "settings",
      value: { mode: "single", singleGame: "liar-game" },
    });
    for (const s of clients) await call(s, "command", { type: "ready" });
    const privateReady = Promise.all(
      clients.map((s) => once(s, "liar:private")),
    );
    await call(host, "command", { type: "start" });
    clock += 6000;
    const roles = await privateReady;
    const liar = roles.findIndex((p) => p.role === "liar"),
      answer = roles.find((p) => p.role === "citizen").word;
    expect(roles[liar].word).toBeNull();
    expect(roles.filter((p) => p.word === answer)).toHaveLength(2);
    const state = () => hostState;
    async function deadline(stage) {
      const next = once(host, "state", (v) => v.liar?.stage === stage);
      clock = state().liar.deadline;
      return next;
    }
    await deadline("clue");
    for (let i = 0; i < 3; i++) {
      const v = state(),
        turn = v.liar,
        idx = sessions.findIndex((p) => p.id === turn.order[turn.turnIndex]);
      const data = {
        matchId: v.matchId,
        roundIndex: v.round,
        phaseVersion: turn.version,
        requestId: "clue-" + i,
        turnId: turn.turnId,
        text: "단서" + i,
      };
      const advance = once(host, "state", (v) => v.liar.clues.length === i + 1);
      const both = await Promise.all([
        call(clients[idx], "liar:clue:submit", data),
        call(clients[idx], "liar:clue:submit", data),
      ]);
      expect(both[0]).toEqual(both[1]);
      expect(both[0].ok).toBe(true);
      await advance;
    }
    await deadline("vote");
    const v = state(),
      target = sessions[(liar + 1) % 3].id;
    const vote = {
      matchId: v.matchId,
      roundIndex: v.round,
      phaseVersion: v.liar.version,
      requestId: "my-vote",
      voteRound: 1,
      targetId: target,
    };
    expect((await call(clients[liar], "liar:vote:submit", vote)).ok).toBe(true);
    const witness = clients[(liar + 1) % 3],
      offline = once(witness, "state", (v) => !v.players[liar].connected);
    clients[liar].disconnect();
    await offline;
    const restored = await connect(),
      updated = once(restored, "liar:private");
    restored.emit("resume", sessions[liar]);
    const recovered = await updated;
    expect(recovered.role).toBe("liar");
    expect(recovered.word).toBeNull();
    expect(recovered.myVote).toBe(target);
    expect(privateFrames.get(witness).myVote).toBeNull();
    for (const frame of publicFrames) {
      expect(JSON.stringify(frame)).not.toContain('"' + answer + '"');
      expect(frame.liarResult).toBeUndefined();
      expect(frame.liar ?? {}).not.toHaveProperty("ballots");
      expect(frame.liar ?? {}).not.toHaveProperty("liarId");
    }
    for (let i = 0; i < 3; i++)
      if (i !== liar)
        await call(clients[i], "liar:vote:submit", {
          ...vote,
          requestId: "other" + i,
          targetId: sessions[liar].id,
        });
    await expect.poll(() => privateFrames.get(restored).canGuess).toBe(true);
    const result = once(restored, "state", (v) => v.phase === "result");
    expect(
      (
        await call(restored, "liar:guess:submit", {
          matchId: v.matchId,
          roundIndex: v.round,
          requestId: "guess",
          phaseVersion: privateFrames.get(restored).version,
          text: answer,
        })
      ).ok,
    ).toBe(true);
    expect((await result).liarResult.outcome).toBe("LIAR_GUESSED");
  } finally {
    for (const s of clients) s.disconnect();
    await server.close();
  }
});
