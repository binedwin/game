import { test, expect } from "vitest";
import {
  room,
  player,
  startMatch,
  configure,
  beginRound,
  schedule,
  tick,
} from "../server/game.ts";
import { currentLiar } from "../server/games/liar/round.ts";
let serial = 0;
function match(n = 6) {
  const ps = Array.from({ length: n }, (_, i) =>
    player("p" + i, "탐정" + i, "blue"),
  );
  const r = room("123456", ps[0]);
  r.players = ps;
  configure(r, { mode: "single", singleGame: "liar-game" });
  ps.forEach((p) => (p.ready = true));
  expect(startMatch(r, 0)).toBe(true);
  tick(r, r.start, 0);
  return r;
}
function data(r, extra = {}) {
  return {
    matchId: r.matchId,
    roundIndex: r.round,
    phaseVersion: r.liar.version,
    turnId: r.liar.turnId,
    voteRound: r.liar.voteRound,
    requestId: "r" + ++serial,
    ...extra,
  };
}
function submit(r, id, type, payload, now = r.now) {
  return currentLiar(r).submit(
    r.players.find((p) => p.id === id),
    type,
    payload,
    now,
  );
}
function timeout(r) {
  tick(r, r.liar.deadline, 0);
}
function voting(r) {
  while (!["vote", "finished"].includes(r.liar.stage)) timeout(r);
}
function votes(r, t) {
  for (const id of r.liar.order) {
    expect(
      submit(
        r,
        id,
        "vote",
        data(r, { targetId: id === t ? r.liar.order.find((s) => s !== t) : t }),
      ).ok,
    ).toBe(true);
  }
}
test("alternating games carry scores and clear private roles between rounds", () => {
  const host = player("p0", "호스트", "blue");
  const r = room("123456", host);
  r.players.push(player("p1", "하나", "red"), player("p2", "둘", "green"));
  configure(r, { mode: "alternate", rounds: 5 });
  r.players.forEach((p) => (p.ready = true));
  expect(startMatch(r, 0)).toBe(true);
  for (const game of [
    "falling-floor",
    "push-out",
    "liar-game",
    "falling-floor",
    "push-out",
  ]) {
    expect(r.game).toBe(game);
    tick(r, r.start, 0);
    if (game === "liar-game") {
      voting(r);
      timeout(r);
    } else {
      expect(currentLiar(r)).toBeUndefined();
      expect(r.liarResult).toBeUndefined();
      tick(r, r.start + 90000, 0);
    }
    expect(r.phase).toBe("result");
    expect(r.players.reduce((sum, p) => sum + p.score, 0)).toBe(r.round * 6);
    tick(r, r.nextRound, 0);
  }
  expect(r.phase).toBe("final");
  expect(r.history).toHaveLength(5);
});
test("private role snapshots, room isolation and exact clue transitions", () => {
  const r = match(),
    g = currentLiar(r),
    second = match(3),
    liar = g.liarId;
  expect(currentLiar(second)).not.toBe(g);
  expect(g.personal(liar).word).toBe(null);
  expect(
    r.players.filter((p) => g.personal(p.id).role === "citizen"),
  ).toHaveLength(5);
  expect(JSON.stringify(r)).not.toContain(g.word.answer);
  expect(r.liarResult).toBeUndefined();
  timeout(r);
  const id = r.liar.order[0],
    other = r.liar.order[1],
    payload = data(r, { text: "<b>단서</b>" });
  expect(submit(r, other, "clue", payload).ok).toBe(false);
  for (const text of [" ", "가".repeat(81), "둘\n셋"])
    expect(submit(r, id, "clue", data(r, { text })).ok).toBe(false);
  const ack = submit(r, id, "clue", payload);
  expect(ack.ok).toBe(true);
  expect(submit(r, id, "clue", payload)).toEqual(ack);
  expect(submit(r, id, "clue", { ...payload, text: "다른 입력" }).ok).toBe(
    false,
  );
  expect(r.liar.clues).toHaveLength(1);
  expect(second.liar.clues).toHaveLength(0);
  expect(
    submit(r, other, "clue", data(r, { text: "늦은 설명" }), r.liar.deadline)
      .ok,
  ).toBe(false);
  timeout(r);
  expect(r.liar.clues[1].status).toBe("timeout");
  expect(
    submit(r, r.liar.order[2], "clue", data(r, { text: g.word.answer })).ok,
  ).toBe(true);
});
test.each([3, 4, 5, 6])(
  "citizen and liar scores for %i participants, one-time settlement",
  (n) => {
    for (const correct of [false, true]) {
      const r = match(n),
        g = currentLiar(r);
      voting(r);
      votes(r, g.liarId);
      expect(r.liar.stage).toBe("guess");
      const citizen = r.players.find((p) => p.id !== g.liarId);
      expect(
        submit(r, citizen.id, "guess", data(r, { text: g.word.answer })).ok,
      ).toBe(false);
      expect(
        submit(
          r,
          g.liarId,
          "guess",
          data(r, {
            text: correct
              ? [...g.word.answer.normalize("NFD")].join(" ")
              : "다른답",
          }),
        ).ok,
      ).toBe(true);
      tick(r, r.now, 0);
      tick(r, r.now + 1, 0);
      expect(r.history).toHaveLength(1);
      expect(r.results.reduce((a, b) => a + b.points, 0)).toBe(
        (n * (n + 1)) / 2,
      );
      expect(citizen.score).toBe(correct ? n / 2 : (n + 2) / 2);
      expect(r.players.find((p) => p.id === g.liarId).score).toBe(
        correct ? n : 1,
      );
      expect(r.liarResult.outcome).toBe(
        correct ? "LIAR_GUESSED" : "CITIZENS_CAUGHT",
      );
      const old = data(r, { text: "오래된 설명" });
      beginRound(r, r.now + 6000);
      expect(currentLiar(r).word.answer).not.toBe(g.word.answer);
      expect(submit(r, citizen.id, "clue", old).code).toBe("STALE_ROUND");
    }
  },
);
test("runoff only allows tied candidates; voter identities and targets stay private", () => {
  const r = match(4);
  voting(r);
  const [a, b, c, d] = r.liar.order;
  expect(submit(r, a, "vote", data(r, { targetId: a })).ok).toBe(false);
  for (const [id, targetId] of [
    [a, b],
    [b, a],
    [c, a],
    [d, b],
  ]) {
    expect(submit(r, id, "vote", data(r, { targetId })).ok).toBe(true);
    if (id === a) {
      expect(submit(r, id, "vote", data(r, { targetId: c })).ok).toBe(false);
      expect(currentLiar(r).personal(a).myVote).toBe(b);
    }
  }
  expect(r.liar.stage).toBe("runoff");
  expect(new Set(r.liar.candidates)).toEqual(new Set([a, b]));
  expect(r.liar.voteCount).toBe(0);
  expect(submit(r, b, "vote", data(r, { targetId: c })).ok).toBe(false);
  expect(r.liarResult).toBeUndefined();
  expect(JSON.stringify(r.liar)).not.toContain("ballots");
  for (const [id, targetId] of [
    [a, b],
    [b, a],
    [c, a],
    [d, b],
  ])
    submit(r, id, "vote", data(r, { targetId }));
  tick(r, r.now, 0);
  expect(r.liarResult.outcome).toBe("LIAR_UNRESOLVED");
  expect(r.liarResult.ballots).toHaveLength(8);
});
test("abstentions, a wrong nomination and a guess timeout produce distinct outcomes", () => {
  for (const ending of ["abstain", "wrong", "guess"]) {
    const r = match(3),
      g = currentLiar(r);
    voting(r);
    if (ending === "abstain") timeout(r);
    else {
      votes(
        r,
        ending === "guess"
          ? g.liarId
          : r.players.find((p) => p.id !== g.liarId).id,
      );
      if (ending === "guess") timeout(r);
    }
    tick(r, r.now, 0);
    expect(r.liarResult.outcome).toBe(
      {
        abstain: "LIAR_UNRESOLVED",
        wrong: "LIAR_ESCAPED",
        guess: "CITIZENS_CAUGHT",
      }[ending],
    );
  }
});
test("forfeited liar takes priority, insufficient players void the round or replace future games", () => {
  for (const liarLeaves of [true, false]) {
    const r = match(3),
      g = currentLiar(r);
    const quitter = r.players.find((p) => (p.id === g.liarId) === liarLeaves);
    quitter.forfeited = true;
    tick(r, r.now + 20, 0);
    expect(r.liarResult.outcome).toBe(liarLeaves ? "LIAR_FORFEIT" : "VOID");
    expect(quitter.score).toBe(0);
    if (!liarLeaves)
      expect(r.results.every((row) => row.points === 0)).toBe(true);
    tick(r, r.nextRound, 0);
    expect(r.game).toBe("falling-floor");
    expect(r.liar).toBeUndefined();
  }
  const r = match(3);
  r.settings.enabledGames = ["liar-game"];
  r.players[0].forfeited = true;
  tick(r, r.now + 10, 0);
  tick(r, r.nextRound, 0);
  expect(r.liarResult.outcome).toBe("VOID");
  expect(r.results.every((row) => row.points === 0)).toBe(true);
  expect(schedule({ ...r.settings, mode: "random" }, 2)).toEqual([]);
  expect(
    schedule(
      {
        ...r.settings,
        enabledGames: ["liar-game", "push-out"],
        mode: "random",
      },
      2,
    ),
  ).toEqual(Array(5).fill("push-out"));
});
