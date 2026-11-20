import type { Actor, MatchRoom } from "./state";
const SIZE = 21;
const SPAWNS = [
  [4, 4],
  [16, 16],
  [16, 4],
  [4, 16],
  [10, 4],
  [10, 16],
];
export function init(r: MatchRoom) {
  Object.assign(r, {
    size: SIZE,
    tiles: Array(SIZE * SIZE).fill(0),
    ring: 0,
    ringWarning: 0,
    nextRing: r.start + 30000,
  });
  const count = r.players.length;
  r.players.forEach((p, i) => {
    const [x, y] = SPAWNS[(i + r.round - 1) % count];
    const rotate = (r.round - 1) % 4;
    const point = [
      [x, y],
      [SIZE - 1 - y, x],
      [SIZE - 1 - x, SIZE - 1 - y],
      [y, SIZE - 1 - x],
    ][rotate];
    Object.assign(p, {
      x: point[0] + 0.5,
      y: point[1] + 0.5,
      fx: 0,
      fy: -1,
      botThink: 0,
      botTarget: null,
    });
  });
}
function tile(r: MatchRoom, x: number, y: number) {
  return x >= 0 && x < SIZE && y >= 0 && y < SIZE
    ? Math.floor(y) * SIZE + Math.floor(x)
    : -1;
}
function neighbors(r: MatchRoom, i: number) {
  const x = i % SIZE,
    y = Math.floor(i / SIZE);
  return [
    [x, y],
    [x + 1, y],
    [x - 1, y],
    [x, y + 1],
    [x, y - 1],
  ]
    .map(([a, b]) => tile(r, a, b))
    .filter((k) => k >= 0);
}
function botMove(r: MatchRoom, p: Actor, now: number) {
  p.inputAt = now;
  if (p.botTarget !== null) {
    const dx = (p.botTarget % r.size) + 0.5 - p.x;
    const dy = Math.floor(p.botTarget / r.size) + 0.5 - p.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 0.09 && r.tiles[p.botTarget] !== -1) {
      p.dx = dx / distance;
      p.dy = dy / distance;
      return;
    }
    p.dx = p.dy = 0;
    p.botTarget = null;
    // Wait briefly on a fresh tile while leaving time to reach the next one.
    const deadline = r.tiles[tile(r, p.x, p.y)];
    p.botThink = Math.min(deadline - 340, now + 250 + Math.random() * 210);
  }
  if (now < p.botThink) return;
  const opts = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
    .map(([dx, dy]) => {
      const k = tile(r, p.x + dx, p.y + dy);
      const space =
        k < 0 ? 0 : neighbors(r, k).filter((t) => r.tiles[t] === 0).length;
      return {
        dx,
        dy,
        k,
        score:
          (space <= 1 ? -10 : 0) -
          space * 0.4 +
          Math.random() +
          (dx === p.fx && dy === p.fy ? 0.7 : 0),
      };
    })
    .filter((o) => o.k >= 0 && r.tiles[o.k] === 0)
    .sort((a, b) => b.score - a.score);
  if (opts.length) {
    p.dx = opts[0].dx;
    p.dy = opts[0].dy;
    p.botTarget = opts[0].k;
  } else {
    p.dx = p.dy = 0;
    p.botThink = now + 100;
  }
}

function touch(r: MatchRoom, p: Actor, index: number, now: number) {
  if (index < 0 || r.tiles[index] === -1) {
    p.alive = false;
    p.dead = now;
    return false;
  }
  if (r.tiles[index] === 0) r.tiles[index] = now + r.settings.collapseMs;
  return true;
}
// Visit cells in the order crossed, including very short diagonal intersections.
function walk(r: MatchRoom, p: Actor, x: number, y: number, now: number) {
  let col = Math.floor(p.x),
    row = Math.floor(p.y);
  const dx = x - p.x,
    dy = y - p.y,
    sx = Math.sign(dx),
    sy = Math.sign(dy);
  let tx = sx ? ((sx > 0 ? col + 1 : col) - p.x) / dx : Infinity;
  let ty = sy ? ((sy > 0 ? row + 1 : row) - p.y) / dy : Infinity;
  if (!touch(r, p, tile(r, p.x, p.y), now)) return;
  while (col !== Math.floor(x) || row !== Math.floor(y)) {
    const t = Math.min(
      col === Math.floor(x) ? Infinity : tx,
      row === Math.floor(y) ? Infinity : ty,
    );
    if (tx === t && col !== Math.floor(x)) {
      col += sx;
      tx += 1 / Math.abs(dx);
    }
    if (ty === t && row !== Math.floor(y)) {
      row += sy;
      ty += 1 / Math.abs(dy);
    }
    if (!touch(r, p, tile(r, col, row), now)) {
      p.x = col + 0.5;
      p.y = row + 0.5;
      return;
    }
  }
  p.x = x;
  p.y = y;
}
export function action(r: MatchRoom, p: Actor, type: string, now: number) {
  if (!r.settings.mobility || p.jumpUntil > now || p.dashUntil > now) return;
  if (type === "jump" && p.jumpReady <= now) {
    p.jumpUntil = now + 400;
    p.jumpReady = now + 3000;
  }
  if (type === "dash" && p.dashReady <= now) {
    p.dashUntil = now + 250;
    p.dashReady = now + 4000;
  }
}
export function tick(r: MatchRoom, now: number, dt: number) {
  if (r.nextRing && now >= r.nextRing) {
    r.tiles.forEach((_, k) => {
      const x = k % SIZE,
        y = Math.floor(k / SIZE);
      if (Math.min(x, y, SIZE - 1 - x, SIZE - 1 - y) <= r.ring) r.tiles[k] = -1;
    });
    r.ring++;
    r.nextRing =
      r.ring === 9
        ? 0
        : r.nextRing + (r.nextRing - r.start >= 70000 ? 4000 : 8000);
  }
  r.ringWarning = r.nextRing && now >= r.nextRing - 2000 ? r.nextRing : 0;
  r.tiles.forEach((v, k) => {
    if (v > 0 && v <= now) r.tiles[k] = -1;
  });
  for (const p of r.players) {
    if (!p.alive) continue;
    if (p.bot) botMove(r, p, now);
    const from = Math.max(r.start, now - dt * 1000);
    const air = Math.max(0, Math.min(now, p.jumpUntil) - from) / 1000;
    if (air > 0) {
      p.x += p.fx * 5 * air;
      p.y += p.fy * 5 * air;
    }
    if (tile(r, p.x, p.y) < 0) {
      p.dead = now;
      p.alive = false;
      continue;
    }
    if (p.jumpUntil > now) continue;
    const ground = (now - from) / 1000 - air;
    const dash = Math.max(0, Math.min(now, p.dashUntil) - from) / 1000;
    if (dash > 0)
      walk(r, p, p.x + p.fx * 7.2 * dash, p.y + p.fy * 7.2 * dash, now);
    if (!p.alive) continue;
    walk(
      r,
      p,
      p.x + p.dx * 4 * (ground - dash),
      p.y + p.dy * 4 * (ground - dash),
      now,
    );
    if ((p.dx || p.dy) && p.dashUntil <= now) {
      const len = Math.hypot(p.dx, p.dy);
      p.fx = p.dx / len;
      p.fy = p.dy / len;
    }
  }
}
