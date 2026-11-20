import { test } from "vitest";
import assert from "node:assert/strict";
import {
  room,
  player,
  beginRound,
  startMatch,
  schedule,
  move,
  tick,
  action,
  configure,
  settle,
} from "../server/game.ts";
function match(count = 2, game = "falling-floor") {
  const ps = Array.from({ length: count }, (_, i) =>
    player("id" + i, "플레이어" + i, "coral"),
  );
  const r = room("123456", ps[0]);
  r.players = ps;
  configure(r, { mode: "single", singleGame: game });
  r.players.forEach((p) => (p.ready = true));
  startMatch(r, -2000);
  return r;
}
const cell = (r, p) => Math.floor(p.y) * r.size + Math.floor(p.x);
test("countdown locks movement and revisiting a tile preserves its first deadline", () => {
  const r = match(),
    p = r.players[0],
    x = p.x,
    i = cell(r, p);
  move(r, p, 1, 0, 2200);
  tick(r, 2500, 1 / 30);
  assert.equal(p.x, x);
  assert.equal(r.tiles[i], 0);
  tick(r, 4000, 1 / 30);
  assert.equal(r.tiles[i], 5000);
  tick(r, 4750, 1 / 30);
  assert.equal(r.tiles[i], 5000);
  tick(r, 5000, 1 / 30);
  assert.equal(r.tiles[i], -1);
  assert.equal(p.alive, false);
});
test("simultaneous eliminations average occupied rank points and settle only once", () => {
  const r = match(5);
  tick(r, 4000, 0);
  r.players.forEach((p, i) => {
    p.dead = [null, 6000, 6000, 5000, 5000][i];
    p.alive = i === 0;
  });
  settle(r, 6500);
  assert.deepEqual(
    r.results.map((q) => q.points),
    [5, 3.5, 3.5, 1.5, 1.5],
  );
  settle(r, 6501);
  assert.equal(r.players[0].score, 5);
  beginRound(r, 10000);
  assert.equal(r.players[0].score, 5);
  assert.equal(r.players[0].jumpReady, 0);
  assert.ok(r.players.every((p) => p.alive));
  assert.ok(r.tiles.every((v) => v === 0));
});
test("diagonal speed normalized and both jump and dash enforce server cooldowns", () => {
  const r = match(),
    p = r.players[0];
  tick(r, 4000, 0);
  move(r, p, 1, 1, 4001);
  const x = p.x,
    y = p.y;
  tick(r, 4000 + 1000 / 30, 1 / 30);
  assert.ok(Math.abs(Math.hypot(p.x - x, p.y - y) - 4 / 30) < 1e-9);
  action(r, p, "jump", 4034);
  action(r, p, "dash", 4035);
  assert.equal(p.dashUntil, 0);
  action(r, p, "jump", 4500);
  assert.equal(p.jumpUntil, 4434);
  action(r, p, "dash", 4500);
  action(r, p, "dash", 4800);
  assert.equal(p.dashReady, 8500);
});
test("jump crosses a missing tile, dash falls, and a missing landing tile eliminates", () => {
  for (const [type, badLanding, alive] of [
    ["jump", false, true],
    ["jump", true, false],
    ["dash", false, false],
  ]) {
    const r = match(),
      p = r.players[0];
    tick(r, 4000, 0);
    p.fx = 1;
    p.fy = 0;
    const i = cell(r, p);
    r.tiles[i + 1] = -1;
    if (badLanding) r.tiles[i + 2] = -1;
    action(r, p, type, 4001);
    for (let k = 1; k <= 15; k++) tick(r, 4000 + (k * 1000) / 30, 1 / 30);
    assert.equal(p.alive, alive);
  }
});

test("floor shrink starts at 28s with removal at 30s and preserves the final 3×3", () => {
  const r = match();
  tick(r, 4000, 0);
  for (let sec = 28; sec <= 89; sec++) {
    r.tiles = r.tiles.map((v) => (v > 0 ? 0 : v));
    r.players.forEach((p, i) => {
      p.x = 10 + i * 0.05;
      p.y = 10;
    });
    tick(r, 4000 + sec * 1000, 0);
    if (sec === 28) {
      assert.equal(r.ringWarning, 34000);
      assert.equal(r.tiles[0], 0);
    }
    if (sec === 30) assert.equal(r.tiles[0], -1);
  }
  assert.equal(r.ring, 9);
  assert.equal(r.nextRing, 0);
});
test("six spawns are unique, random bags balanced, fixed / alternate selections honored", () => {
  const r = match(6);
  assert.equal(new Set(r.players.map((p) => cell(r, p))).size, 6);
  for (let i = 0; i < 100; i++) {
    const seq = schedule({ ...r.settings, mode: "random", rounds: 10 });
    assert.equal(seq.filter((id) => id === "push-out").length, 5);
    assert.ok(seq.every((v, k) => k === 0 || seq[k - 1] !== v));
  }
  assert.deepEqual(schedule({ ...r.settings, mode: "alternate", rounds: 3 }), [
    "falling-floor",
    "push-out",
    "falling-floor",
  ]);
  assert.deepEqual(
    schedule({ ...r.settings, singleGame: "push-out", rounds: 3 }),
    Array(3).fill("push-out"),
  );
  assert.equal(configure(r, { rounds: 10 }), false);
});
test("six-player tied ranks, forfeits, timeout and final result delay", () => {
  const r = match(6, "push-out");
  tick(r, 4000, 0);
  r.players.forEach((p, i) => {
    p.dead = [null, 8500, 8500, 7000, 6000, 5000][i];
    p.alive = i === 0;
  });
  settle(r, 9000);
  assert.deepEqual(
    r.results.map((a) => a.points),
    [6, 4.5, 4.5, 3, 2, 1],
  );
  r.players[3].forfeited = true;
  beginRound(r, 10000);
  tick(r, 16000, 0);
  r.players.forEach((p, i) => {
    p.x = Math.cos((i * Math.PI) / 3);
    p.y = Math.sin((i * Math.PI) / 3);
  });
  tick(r, 106000, 0);
  assert.equal(r.results.at(-1).points, 0);
  assert.equal(r.results.filter((a) => a.rank === 1).length, 5);
});
function duel() {
  const r = match(2, "push-out");
  tick(r, 4000, 0);
  const [a, b] = r.players;
  Object.assign(a, { x: 0, y: 0, fx: 1, fy: 0 });
  Object.assign(b, { x: 1, y: 0, fx: -1, fy: 0 });
  return { r, a, b };
}
test("push cone and distance, misses consume cooldown, both simultaneous hits count", () => {
  for (const [x, y, hit] of [
    [1, 0, true],
    [-1, 0, false],
    [2, 0, false],
    [0.2, 1, false],
  ]) {
    const { r, a, b } = duel();
    b.x = x;
    b.y = y;
    action(r, a, "push", 4001);
    tick(r, 4033, 0);
    assert.equal(b.vx !== 0, hit);
    assert.equal(a.pushReady, 6001);
  }
  const { r, a, b } = duel();
  action(r, a, "push", 4010);
  action(r, b, "push", 4010);
  tick(r, 4033, 0);
  assert.equal(a.vx, -7);
  assert.equal(b.vx, 7);
});
test("guard reduces impulse, blocks other actions and offers no edge protection", () => {
  const { r, a, b } = duel();
  action(r, b, "guard", 4001);
  action(r, b, "dash", 4002);
  action(r, b, "push", 4003);
  action(r, a, "push", 4004);
  tick(r, 4033, 0);
  assert.ok(Math.abs(b.vx - 2.1) < 1e-9);
  assert.equal(b.dashUntil, 0);
  assert.equal(b.pushReady, 0);
  b.x = 8.1;
  tick(r, 4050, 0);
  assert.equal(b.alive, false);
});
test("dash contact hits once, static overlap separates without repeated acceleration", () => {
  const { r, a, b } = duel();
  b.x = 0.72;
  action(r, a, "dash", 4000);
  tick(r, 4010, 0);
  assert.equal(b.vx, 5.5);
  b.x = a.x + 0.7;
  tick(r, 4020, 0);
  assert.equal(b.vx, 5.5);
  assert.deepEqual(a.dashHits, [b.id]);
  const f = duel();
  f.b.x = 0.5;
  tick(f.r, 4010, 0);
  assert.ok(Math.abs(f.b.x - f.a.x - 0.76) < 1e-9);
  assert.equal(f.b.vx, 0);
});
test("ring telegraph, shrink and maximum time", () => {
  const { r, a, b } = duel();
  a.x = -0.5;
  b.x = 0.5;
  tick(r, 16000, 0);
  assert.equal(r.radius, 8);
  assert.equal(r.nextRadius, 7);
  assert.equal(r.ringWarning, 19000);
  tick(r, 19000, 0);
  assert.equal(r.radius, 7);
  assert.equal(r.ringWarning, 0);
  tick(r, 94000, 0);
  assert.equal(r.phase, "result");
  assert.deepEqual(
    r.results.map((row) => row.points),
    [1.5, 1.5],
  );
});
