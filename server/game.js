export const COLORS = ["coral", "blue", "mint", "gold", "purple"];
export const DEFAULTS = {
  maxPlayers: 5,
  rounds: 5,
  map: "square",
  difficulty: "normal",
  collapseMs: 1000,
  mobility: true,
  items: false,
  special: false,
};
const MAPS = ["square", "cross", "donut", "island"];
const ITEMS = [
  "superJump",
  "bomb",
  "push",
  "freeze",
  "shield",
  "ghost",
  "swap",
];
const SPECIAL = ["speed", "bomb", "ice", "armor", "warp", "repair"];
export function configure(room, changes) {
  const s = { ...room.settings };
  if (!changes || typeof changes !== "object") return false;
  for (const [key, value] of Object.entries(changes)) {
    const allowed = {
      maxPlayers: [2, 3, 4, 5],
      rounds: [3, 5, 10],
      map: [...MAPS, "random"],
      difficulty: ["easy", "normal", "hard"],
      mobility: [true, false],
      items: [true, false],
      special: [true, false],
    };
    if (
      key === "collapseMs"
        ? !(
            Number.isInteger(value) &&
            value >= 500 &&
            value <= 2000 &&
            value % 100 === 0
          )
        : !allowed[key]?.includes(value)
    )
      return false;
    s[key] = value;
  }
  if (s.maxPlayers < room.players.length) return false;
  room.settings = s;
  return true;
}
export function player(id, name, color, bot = false) {
  return {
    id,
    name,
    color,
    bot,
    connected: true,
    ready: bot,
    score: 0,
    wins: 0,
    alive: false,
  };
}
export function room(code, host) {
  return {
    code,
    host: host.id,
    phase: "lobby",
    settings: { ...DEFAULTS },
    players: [host],
    round: 0,
    now: 0,
    tiles: [],
    results: [],
  };
}
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
function inMap(map, x, y, n) {
  const c = (n - 1) / 2,
    dx = Math.abs(x - c),
    dy = Math.abs(y - c);
  if (map === "cross") return Math.min(dx, dy) <= Math.floor(n / 5);
  if (map === "donut")
    return Math.hypot(dx, dy) <= c + 0.5 && Math.hypot(dx, dy) >= c * 0.42;
  if (map === "island")
    return (
      (dx >= 2 && dy >= 2) ||
      (dx <= 1 && Math.abs(dy - c * 0.55) < 1.5) ||
      (dy <= 1 && Math.abs(dx - c * 0.55) < 1.5)
    );
  return true;
}
export function beginRound(r, now) {
  r.phase = "countdown";
  r.round++;
  r.now = now;
  r.start = now + 3000;
  r.results = [];
  r.ring = 0;
  r.nextRing = r.start + 30000;
  r.nextItem = r.start + 15000;
  r.ringWarning = 0;
  r.effects = [];
  const n = (r.size = { easy: 23, normal: 21, hard: 17 }[
    r.settings.difficulty
  ]);
  r.map = r.settings.map === "random" ? pick(MAPS) : r.settings.map;
  // -1 is a hole, 0 is safe, positive numbers are server collapse deadlines.
  r.tiles = Array.from({ length: n * n }, (_, i) =>
    inMap(r.map, i % n, Math.floor(i / n), n) ? 0 : -1,
  );
  r.specials = {};
  r.loot = {};
  r.fuses = {};
  r.durations = {};
  const targets = [
    [0.22, 0.22],
    [0.78, 0.78],
    [0.78, 0.22],
    [0.22, 0.78],
    [0.5, 0.5],
  ];
  const used = new Set();
  r.players.forEach((p, i) => {
    const [tx, ty] = targets[(i + r.round - 1) % 5];
    let spawn = 0,
      best = Infinity;
    r.tiles.forEach((v, k) => {
      if (v !== 0 || used.has(k)) return;
      const x = k % n,
        y = Math.floor(k / n);
      if ([k - 1, k + 1, k - n, k + n].some((t) => r.tiles[t] !== 0)) return;
      const d = (x - tx * (n - 1)) ** 2 + (y - ty * (n - 1)) ** 2;
      if (d < best) {
        best = d;
        spawn = k;
      }
    });
    used.add(spawn);
    Object.assign(p, {
      x: (spawn % n) + 0.5,
      y: Math.floor(spawn / n) + 0.5,
      alive: p.connected,
      dead: p.connected ? null : now,
      dx: 0,
      dy: 0,
      fx: 0,
      fy: -1,
      jumpUntil: 0,
      dashUntil: 0,
      jumpReady: 0,
      dashReady: 0,
      item: null,
      ghost: 0,
      shield: false,
      speed: 0,
      ice: 0,
      frozen: 0,
      botTarget: null,
      botThink: now,
      inputAt: now,
    });
  });
  if (r.settings.special)
    for (let i = 0; i < n * n; i++)
      if (r.tiles[i] === 0 && !used.has(i) && Math.random() < 0.045)
        r.specials[i] = pick(SPECIAL);
}
function tile(r, x, y) {
  return x >= 0 && y >= 0 && x < r.size && y < r.size
    ? Math.floor(y) * r.size + Math.floor(x)
    : -1;
}
function safe(r) {
  const a = [];
  r.tiles.forEach((v, i) => {
    if (v === 0) a.push(i);
  });
  return a.length ? pick(a) : null;
}
function relocate(r, p, i) {
  p.x = (i % r.size) + 0.5;
  p.y = Math.floor(i / r.size) + 0.5;
}
function fall(r, p, now) {
  if (p.shield) {
    const i = safe(r);
    if (i !== null) {
      relocate(r, p, i);
      p.shield = false;
      land(r, p, now);
      return;
    }
  }
  p.alive = false;
  p.dead = now;
}
function neighbors(r, i) {
  const x = i % r.size,
    y = Math.floor(i / r.size);
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
function fuse(r, i, now) {
  for (const k of neighbors(r, i))
    if (r.tiles[k] !== -1)
      r.fuses[k] = Math.min(r.fuses[k] ?? Infinity, now + 800);
}
function land(r, p, now) {
  const i = tile(r, p.x, p.y);
  if (i < 0 || (r.tiles[i] === -1 && p.ghost <= now)) {
    fall(r, p, now);
    return;
  }
  if (r.tiles[i] !== 0) return;
  const kind = r.specials[i];
  delete r.specials[i];
  r.durations[i] =
    r.settings.collapseMs *
    (kind === "armor" ? 3 : 1) *
    (now - r.start >= 30000 ? 0.82 : 1);
  r.tiles[i] = now + r.durations[i];
  if (!p.item && r.loot[i]) {
    p.item = r.loot[i];
    delete r.loot[i];
  }
  if (kind === "speed") p.speed = now + 3000;
  if (kind === "ice") p.ice = now + 650;
  if (kind === "bomb") fuse(r, i, now);
  if (kind === "repair")
    for (const k of neighbors(r, i)) {
      const x = k % r.size,
        y = Math.floor(k / r.size);
      if (
        r.tiles[k] === -1 &&
        Math.min(x, y, r.size - 1 - x, r.size - 1 - y) >= r.ring &&
        inMap(r.map, x, y, r.size)
      )
        r.tiles[k] = 0;
    }
  if (kind === "warp") {
    const dest = safe(r);
    if (dest !== null) {
      relocate(r, p, dest);
      land(r, p, now);
    }
  }
}
export function action(r, p, type, now) {
  if (
    r.phase !== "playing" ||
    !p.alive ||
    !p.connected ||
    p.frozen > now ||
    p.jumpUntil > now ||
    p.dashUntil > now
  )
    return;
  if (type === "item" && p.item) {
    const item = p.item;
    const other = r.players
      .filter((q) => q !== p && q.alive)
      .sort(
        (a, b) =>
          Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y),
      )[0];
    if (item === "shield") p.shield = true;
    if (item === "ghost") p.ghost = now + 2000;
    if (item === "superJump") {
      p.jumpUntil = now + 500;
      p.jumpSpeed = 8;
      p.jumpReady = now + 3000;
    }
    if (item === "bomb") {
      const k = tile(r, p.x + p.fx * 2, p.y + p.fy * 2);
      if (k < 0) return;
      fuse(r, k, now);
    }
    if (item === "push" || item === "freeze") {
      if (!other || Math.hypot(p.x - other.x, p.y - other.y) > 3.5) return;
      r.effects.push({
        type: item,
        source: p.id,
        target: other.id,
        x: other.x,
        y: other.y,
        at: now + 500,
      });
    }
    if (item === "swap") {
      if (
        !other ||
        other.jumpUntil > now ||
        other.dashUntil > now ||
        [other, p].some((q) => r.tiles[tile(r, q.x, q.y)] === -1)
      )
        return;
      [p.x, other.x] = [other.x, p.x];
      [p.y, other.y] = [other.y, p.y];
    }
    p.item = null;
    return;
  }
  if (!r.settings.mobility) return;
  if (type === "jump" && p.jumpReady <= now) {
    p.jumpUntil = now + 400;
    p.jumpSpeed = 5;
    p.jumpReady = now + 3000;
  }
  if (type === "dash" && p.dashReady <= now) {
    p.dashUntil = now + 250;
    p.dashReady = now + 4000;
  }
}
export function move(r, p, x, y, now) {
  if (
    r.phase !== "playing" ||
    !p.alive ||
    !p.connected ||
    ![x, y].every(Number.isFinite)
  )
    return;
  const len = Math.max(1, Math.hypot(x, y));
  p.dx = x / len;
  p.dy = y / len;
  p.inputAt = now;
}
function botMove(r, p, now) {
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
          (space <= 1 ? -10 : 0) - space * 0.4 + Math.random() +
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
export function settle(r, now) {
  if (r.phase !== "playing") return;
  const ps = [...r.players].sort(
    (a, b) => (b.dead ?? Infinity) - (a.dead ?? Infinity),
  );
  const results = [];
  for (let i = 0; i < ps.length; ) {
    let end = i + 1;
    while (end < ps.length && ps[end].dead === ps[i].dead) end++;
    const points = ps.length - (i + end - 1) / 2;
    for (let j = i; j < end; j++) {
      const p = ps[j];
      p.score += points;
      if (i === 0) p.wins++;
      results.push({
        id: p.id,
        rank: i + 1,
        points,
        time: Math.max(0, (p.dead ?? now) - r.start),
      });
    }
    i = end;
  }
  r.results = results;
  r.phase = r.round >= r.settings.rounds ? "final" : "result";
  r.nextRound = now + 7000;
}
export function tick(r, now, dt) {
  r.now = now;
  if (r.phase === "result" && now >= r.nextRound) {
    beginRound(r, now);
    return;
  }
  if (r.phase === "countdown" && now >= r.start) {
    r.phase = "playing";
    for (const p of r.players) if (p.alive) land(r, p, now);
  }
  if (r.phase !== "playing") return;
  if (now >= r.nextRing) {
    if (!r.ringWarning) {
      r.ringWarning = now + 1200;
      r.nextRing = r.ringWarning;
    } else {
      const n = r.size;
      r.tiles.forEach((_, k) => {
        const x = k % n,
          y = Math.floor(k / n);
        if (Math.min(x, y, n - 1 - x, n - 1 - y) <= r.ring) {
          r.tiles[k] = -1;
          delete r.loot[k];
          delete r.specials[k];
        }
      });
      r.ring++;
      r.ringWarning = 0;
      r.nextRing =
        now +
        (now - r.start >= 90000
          ? 1800
          : { easy: 10000, normal: 8000, hard: 5500 }[r.settings.difficulty]) -
        1200;
    }
  }
  if (r.settings.items && now >= r.nextItem) {
    const k = safe(r);
    if (k !== null) r.loot[k] = pick(ITEMS);
    r.nextItem = now + 5000;
  }
  for (const [k, t] of Object.entries(r.fuses))
    if (now >= t) {
      r.tiles[k] = -1;
      delete r.fuses[k];
      delete r.loot[k];
    }
  r.tiles.forEach((v, k) => {
    if (v > 0 && v <= now) r.tiles[k] = -1;
  });
  for (const e of r.effects.filter((e) => e.at <= now)) {
    const p = r.players.find((p) => p.id === e.target),
      src = r.players.find((p) => p.id === e.source);
    if (!p?.alive || !src || Math.hypot(p.x - e.x, p.y - e.y) > 1.1) continue;
    if (e.type === "freeze") p.frozen = now + 1000;
    else {
      const x = p.x - src.x,
        y = p.y - src.y,
        l = Math.hypot(x, y) || 1;
      p.x += x / l;
      p.y += y / l;
    }
  }
  r.effects = r.effects.filter((e) => e.at > now);
  for (const p of r.players) {
    if (!p.alive) continue;
    if (p.bot) botMove(r, p, now);
    if (now - p.inputAt > 1200) {
      p.dx = 0;
      p.dy = 0;
    }
    const at = tile(r, p.x, p.y);
    if (
      at < 0 ||
      (r.tiles[at] === -1 && p.jumpUntil <= now && p.ghost <= now)
    ) {
      fall(r, p, now);
      continue;
    }
    const jump = p.jumpUntil > now,
      dash = p.dashUntil > now,
      locked = jump || dash || p.ice > now;
    let dx = locked ? p.fx : p.dx,
      dy = locked ? p.fy : p.dy;
    if (p.frozen > now) {
      dx = 0;
      dy = 0;
    }
    if (!locked && (dx || dy)) {
      const l = Math.hypot(dx, dy);
      p.fx = dx / l;
      p.fy = dy / l;
    }
    const speed = jump ? p.jumpSpeed : dash ? 7.2 : p.speed > now ? 5.6 : 4;
    p.x += dx * speed * dt;
    p.y += dy * speed * dt;
    if (tile(r, p.x, p.y) < 0) fall(r, p, now);
    else if (!jump) land(r, p, now);
  }
  if (r.players.filter((p) => p.alive).length <= 1) settle(r, now);
}
