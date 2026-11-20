import type { Actor, MatchRoom } from "./state";
const SHRINKS = [
  [15, 7],
  [25, 6],
  [35, 5],
  [45, 4],
  [55, 3],
  [65, 2.2],
  [75, 1.5],
];
const ARC_COS = Math.cos((55 * Math.PI) / 180);
export function init(r: MatchRoom) {
  Object.assign(r, {
    size: 18,
    tiles: [],
    radius: 8,
    nextRadius: 7,
    nextRing: r.start + 15000,
    ringWarning: 0,
  });
  r.players.forEach((p, i) => {
    const angle = (2 * Math.PI * i) / r.players.length + r.round * 0.47;
    Object.assign(p, {
      x: 4.5 * Math.cos(angle),
      y: 4.5 * Math.sin(angle),
      fx: -Math.cos(angle),
      fy: -Math.sin(angle),
      vx: 0,
      vy: 0,
      pushQueued: false,
      dashHits: [],
      contacts: {},
      lastPush: 0,
      lastHit: 0,
    });
  });
}
export function action(r: MatchRoom, p: Actor, type: string, now: number) {
  if (p.dashUntil > now || p.guardUntil > now) return;
  if (type === "push" && p.pushReady <= now) {
    p.pushQueued = true;
    p.pushReady = now + 2000;
    p.lastPush = now;
  }
  if (type === "guard" && r.settings.defense && p.guardReady <= now) {
    p.guardUntil = now + 700;
    p.guardReady = now + 5000;
  }
  if (type === "dash" && p.dashReady <= now) {
    p.dashUntil = now + 250;
    p.dashReady = now + 4000;
    p.dashHits = [];
  }
}
function knock(p: Actor, nx: number, ny: number, power: number, now: number) {
  const force = power * (p.guardUntil > now ? 0.3 : 1);
  p.vx += nx * force;
  p.vy += ny * force;
}
function bots(r: MatchRoom, p: Actor, now: number) {
  const enemies = r.players
    .filter((q) => q !== p && q.alive)
    .sort(
      (a, b) =>
        Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y),
    );
  const target = enemies[0];
  if (!target) return;
  const retreat = Math.hypot(p.x, p.y) > r.radius - 0.9,
    dx = (retreat ? 0 : target.x) - p.x,
    dy = (retreat ? 0 : target.y) - p.y,
    d = Math.hypot(dx, dy) || 1;
  p.dx = dx / d;
  p.dy = dy / d;
  p.inputAt = now;
  if (p.dashUntil <= now) {
    p.fx = p.dx;
    p.fy = p.dy;
  }
  if (!retreat && d <= 1.45) action(r, p, "push", now);
  if (retreat && Math.hypot(p.vx, p.vy) > 1) action(r, p, "guard", now);
}
function resolvePushes(players: Actor[], now: number) {
  for (const p of players) {
    if (!p.pushQueued) continue;
    p.pushQueued = false;
    let target = null,
      nearest = Infinity;
    for (const q of players) {
      if (q === p) continue;
      const dx = q.x - p.x,
        dy = q.y - p.y,
        d = Math.hypot(dx, dy);
      if (d <= 0 || d > 1.6 || (dx * p.fx + dy * p.fy) / d < ARC_COS) continue;
      if (
        d < nearest ||
        (d === nearest && target !== null && q.id < target.id)
      ) {
        target = q;
        nearest = d;
      }
    }
    if (target) {
      knock(
        target,
        (target.x - p.x) / nearest,
        (target.y - p.y) / nearest,
        7,
        now,
      );
      p.lastHit = now;
    }
  }
}
function velocity(p: Actor, now: number) {
  const dash = p.dashUntil > now,
    speed = dash ? 7.6 : p.guardUntil > now ? 1.9 : 3.8;
  return [
    (dash ? p.fx : p.dx) * speed + p.vx,
    (dash ? p.fy : p.dy) * speed + p.vy,
  ];
}
function contact(a: Actor, b: Actor, now: number) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    d = Math.hypot(dx, dy);
  if (d >= 0.76) return;
  const nx = d ? dx / d : 1,
    ny = d ? dy / d : 0,
    offset = (0.76 - d) / 2;
  a.x -= nx * offset;
  a.y -= ny * offset;
  b.x += nx * offset;
  b.y += ny * offset;
  if (a.dashUntil > now || b.dashUntil > now) {
    for (const [src, dst, sign] of [
      [a, b, 1],
      [b, a, -1],
    ] as const)
      if (src.dashUntil > now && !src.dashHits.includes(dst.id)) {
        src.dashHits.push(dst.id);
        knock(dst, nx * sign, ny * sign, 5.5, now);
      }
  } else if (!(a.contacts[b.id] > now)) {
    const [ax, ay] = velocity(a, now),
      [bx, by] = velocity(b, now);
    if ((ax - bx) * nx + (ay - by) * ny > 0) {
      knock(a, -nx, -ny, 1.5, now);
      knock(b, nx, ny, 1.5, now);
      a.contacts[b.id] = now + 300;
    }
  }
}
function boundary(r: MatchRoom, p: Actor, now: number) {
  if (p.alive && Math.hypot(p.x, p.y) > r.radius) {
    p.alive = false;
    p.dead = now;
  }
}
export function tick(r: MatchRoom, now: number, dt: number) {
  const elapsed = (now - r.start) / 1000;
  r.radius = 8;
  r.nextRing = 0;
  r.nextRadius = null;
  for (const [sec, radius] of SHRINKS) {
    if (elapsed >= sec) r.radius = radius;
    else {
      r.nextRadius = radius;
      r.nextRing = r.start + sec * 1000;
      break;
    }
  }
  r.ringWarning = r.nextRing && now >= r.nextRing - 3000 ? r.nextRing : 0;
  for (const p of r.players) boundary(r, p, now);
  const players = r.players.filter((p) => p.alive);
  for (const p of players) if (p.bot) bots(r, p, now);
  resolvePushes(players, now);
  const sub = dt / 4;
  for (let step = 0; step < 4; step++) {
    for (const p of players) {
      if (!p.alive) continue;
      const factor = Math.max(1, Math.hypot(p.vx, p.vy) / 10);
      p.vx /= factor;
      p.vy /= factor;
      const [x, y] = velocity(p, now);
      p.x += x * sub;
      p.y += y * sub;
      p.vx *= Math.exp(-5 * sub);
      p.vy *= Math.exp(-5 * sub);
      boundary(r, p, now);
    }
    for (let pass = 0; pass < 3; pass++)
      for (let i = 0; i < players.length; i++)
        for (let j = i + 1; j < players.length; j++) {
          const a = players[i],
            b = players[j];
          if (a.alive && b.alive) {
            contact(a, b, now);
            boundary(r, a, now);
            boundary(r, b, now);
          }
        }
  }
}
