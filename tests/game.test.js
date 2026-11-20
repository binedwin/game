import test from "node:test";
import assert from "node:assert/strict";
import {
  room,
  player,
  beginRound,
  move,
  tick,
  action,
  configure,
  settle,
} from "../server/game.js";
function match(count = 2) {
  const ps = Array.from({ length: count }, (_, i) =>
    player("id" + i, "플레이어" + i, "coral"),
  );
  const r = room("123456", ps[0]);
  r.players = ps;
  beginRound(r, 1000);
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
  tick(r, 4033, 1 / 30);
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
test("outer ring warns before removal and cannot be recovered by repair", () => {
  const r = match();
  tick(r, 4000, 0);
  r.players.forEach((p) => (r.tiles[cell(r, p)] = 0));
  tick(r, 34000, 0);
  assert.ok(r.ringWarning);
  assert.equal(r.tiles[0], 0);
  tick(r, 35200, 0);
  assert.equal(r.ring, 1);
  assert.equal(r.tiles[0], -1);
  assert.equal(r.ringWarning, 0);
});
test("all maps obtain five separate interior spawn tiles at each difficulty", () => {
  for (const map of ["square", "cross", "donut", "island"])
    for (const difficulty of ["easy", "normal", "hard"]) {
      const r = match(5);
      configure(r, { map, difficulty, special: true, items: true });
      beginRound(r, 2000);
      assert.equal(new Set(r.players.map((p) => cell(r, p))).size, 5);
      for (const p of r.players)
        for (const d of [0, 1, -1, r.size, -r.size])
          assert.equal(r.tiles[cell(r, p) + d], 0);
    }
});
test("invalid settings leave the previous configuration intact", () => {
  const r = match(3),
    prev = { ...r.settings };
  assert.equal(configure(r, { map: "cross", maxPlayers: 2 }), false);
  assert.deepEqual(r.settings, prev);
  assert.equal(configure(r, { collapseMs: 555 }), false);
  assert.equal(configure(r, { rounds: 10, collapseMs: 500 }), true);
});
test("item pickup grants one item, shield rescues once, freezing can be dodged", () => {
  const r = match(),
    [p, q] = r.players;
  tick(r, 4000, 0);
  p.x += 1;
  r.loot[cell(r, p)] = "shield";
  tick(r, 4033, 0);
  assert.equal(p.item, "shield");
  action(r, p, "item", 4034);
  assert.equal(p.shield, true);
  r.tiles[cell(r, p)] = -1;
  tick(r, 4066, 0);
  assert.equal(p.alive, true);
  assert.equal(p.shield, false);
  assert.ok(r.tiles[cell(r, p)] > 0);
  q.x = p.x + 1;
  q.y = p.y;
  p.item = "freeze";
  action(r, p, "item", 4080);
  q.x += 2;
  tick(r, 4581, 0);
  assert.equal(q.frozen, 0);
});
