import type { Actor, MatchRoom } from "./games/state";
import type { GameId, Settings } from "../shared/party";
import type { Result } from "../shared/snapshot";
import { randomUUID } from "node:crypto";
import { defaults, gameIds, eligibleGames } from "../shared/party.ts";
import * as floor from "./games/falling-floor.ts";
import * as push from "./games/push-out.ts";
import { clearLiar, initLiar, currentLiar } from "./games/liar/round.ts";
const modules = { "falling-floor": floor, "push-out": push };
export const COLORS = ["coral", "blue", "mint", "gold", "purple", "orange"];
export function configure(r: MatchRoom, changes: Partial<Settings>) {
  if (
    r.phase !== "lobby" ||
    !changes ||
    typeof changes !== "object" ||
    Array.isArray(changes)
  )
    return false;
  const allowed: Record<string, readonly unknown[]> = {
    maxPlayers: [2, 3, 4, 5, 6],
    rounds: [3, 5, 10],
    mode: ["random", "alternate", "single"],
    singleGame: gameIds,
    mobility: [true, false],
    defense: [true, false],
  };
  for (const [key, value] of Object.entries(changes)) {
    if (key === "enabledGames") {
      if (
        !Array.isArray(value) ||
        !value.length ||
        value.length > gameIds.length ||
        value.some((id) => !gameIds.includes(id)) ||
        new Set(value).size !== value.length
      )
        return false;
    } else if (key === "collapseMs") {
      if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < 500 ||
        value > 2000 ||
        value % 100 !== 0
      )
        return false;
    } else if (!Object.hasOwn(allowed, key) || !allowed[key].includes(value))
      return false;
  }
  if (changes.maxPlayers !== undefined && changes.maxPlayers < r.players.length)
    return false;
  const next = { ...r.settings, ...changes };
  if (
    next.mode === "single" &&
    !eligibleGames(next, r.players.length).includes(next.singleGame)
  )
    return false;
  Object.assign(r.settings, changes);
  resetReady(r);
  return true;
}
export function resetReady(r: MatchRoom) {
  for (const p of r.players) p.ready = p.bot;
}
export function player(
  id: string,
  name: string,
  color: string,
  bot = false,
): Actor {
  return {
    id,
    name,
    color,
    bot,
    connected: true,
    ready: bot,
    forfeited: false,
    score: 0,
    wins: 0,
    alive: false,
    x: 0,
    y: 0,
    fx: 0,
    fy: -1,
    dx: 0,
    dy: 0,
    vx: 0,
    vy: 0,
    dead: null,
    jumpUntil: 0,
    dashUntil: 0,
    jumpReady: 0,
    dashReady: 0,
    pushReady: 0,
    guardReady: 0,
    guardUntil: 0,
    lastPush: 0,
    lastHit: 0,
    inputAt: 0,
    botThink: 0,
    botTarget: null,
    pushQueued: false,
    dashHits: [],
    contacts: {},
    moveSeq: -1,
    actionSeq: -1,
  };
}
export function room(code: string, host: Actor): MatchRoom {
  return {
    code,
    host: host.id,
    phase: "lobby",
    settings: { ...defaults },
    players: [host],
    round: 0,
    now: 0,
    tiles: [],
    results: [],
    history: [],
    schedule: [],
    matchId: null,
    game: "falling-floor",
    size: 21,
    start: 0,
    nextRound: 0,
    ring: 0,
    ringWarning: 0,
    nextRing: 0,
    radius: 0,
    nextRadius: null,
  };
}
export function schedule(s: Settings, count = 6): GameId[] {
  const eligible = eligibleGames(s, count);
  if (
    !eligible.length ||
    (s.mode === "single" && !eligible.includes(s.singleGame))
  )
    return [];
  if (s.mode === "single") return Array(s.rounds).fill(s.singleGame);
  const order: GameId[] = [];
  while (order.length < s.rounds) {
    const bag = [...eligible];
    if (s.mode === "random") {
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (bag.length > 1 && bag[0] === order.at(-1))
        [bag[0], bag[1]] = [bag[1], bag[0]];
    }
    order.push(...bag);
  }
  return order.slice(0, s.rounds);
}
export function startMatch(r: MatchRoom, now: number) {
  if (
    r.phase !== "lobby" ||
    r.players.length < 2 ||
    r.players.some((p) => !p.connected || !p.ready)
  )
    return false;
  const sequence = schedule(r.settings, r.players.length);
  if (!sequence.length) return false;
  r.matchId = randomUUID();
  r.schedule = sequence;
  r.round = 0;
  r.history = [];
  for (const p of r.players)
    Object.assign(p, { score: 0, wins: 0, forfeited: false });
  beginRound(r, now);
  return true;
}
export function beginRound(r: MatchRoom, now: number) {
  clearLiar(r);
  r.round++;
  r.game = r.schedule[r.round - 1];
  r.phase = "intro";
  r.now = now;
  r.start = now + 6000;
  r.results = [];
  Object.assign(r, {
    radius: 0,
    nextRadius: null,
    nextRing: 0,
    ringWarning: 0,
    ring: 0,
  });
  for (const p of r.players) {
    Object.assign(p, {
      alive: !p.forfeited,
      dead: p.forfeited ? now : null,
      dx: 0,
      dy: 0,
      jumpUntil: 0,
      dashUntil: 0,
      jumpReady: 0,
      dashReady: 0,
      pushReady: 0,
      guardUntil: 0,
      guardReady: 0,
      lastPush: 0,
      lastHit: 0,
      vx: 0,
      vy: 0,
      contacts: {},
      dashHits: [],
      pushQueued: false,
      botTarget: null,
      inputAt: now,
      moveSeq: -1,
      actionSeq: -1,
    });
  }
  if (r.game === "liar-game") {
    const participants = r.players.filter((p) => !p.forfeited).length;
    if (participants >= 3) {
      r.tiles = [];
      initLiar(r);
      return;
    }
    const replacement = eligibleGames(r.settings, participants).find(
      (id) => id !== "liar-game",
    );
    if (replacement) r.schedule[r.round - 1] = r.game = replacement;
    else {
      r.phase = "playing";
      r.liarResult = {
        outcome: "VOID",
        answer: null,
        category: "",
        liarId: null,
        nominated: null,
        clues: [],
        ballots: [],
        guess: null,
      };
      settle(r, now, []);
      return;
    }
  }
  modules[r.game].init(r);
}
export function move(
  r: MatchRoom,
  p: Actor,
  x: number,
  y: number,
  now: number,
) {
  if (
    r.phase !== "playing" ||
    r.game === "liar-game" ||
    !p.alive ||
    !p.connected ||
    ![x, y].every((v) => Number.isFinite(v) && Math.abs(v) <= 1)
  )
    return;
  const len = Math.max(1, Math.hypot(x, y));
  p.dx = x / len;
  p.dy = y / len;
  p.inputAt = now;
  if ((x || y) && p.jumpUntil <= now && p.dashUntil <= now) {
    const d = Math.hypot(x, y);
    p.fx = x / d;
    p.fy = y / d;
  }
}
export function action(r: MatchRoom, p: Actor, type: string, now: number) {
  if (r.game !== "liar-game" && r.phase === "playing" && p.alive && p.connected)
    modules[r.game].action(r, p, type, now);
}
export function settle(r: MatchRoom, now: number, teams?: string[][]) {
  if (
    r.phase !== "playing" ||
    r.history.some((h) => h.matchId === r.matchId && h.round === r.round)
  )
    return;
  const sorted = r.players
    .filter((p) => !p.forfeited)
    .sort((a, b) => (b.dead ?? Infinity) - (a.dead ?? Infinity));
  const rows: Result[] = [];
  const n = r.players.length;
  const groups: Actor[][] = [];
  if (teams) {
    for (const ids of teams)
      groups.push(sorted.filter((p) => ids.includes(p.id)));
  } else
    for (const p of sorted) {
      const last = groups.at(-1);
      if (last && last[0].dead === p.dead) last.push(p);
      else groups.push([p]);
    }
  let i = 0;
  for (const group of groups) {
    if (!group.length) continue;
    const end = i + group.length,
      points = n - (i + end - 1) / 2;
    for (const p of group) {
      p.score += points;
      if (i === 0) p.wins++;
      rows.push({
        id: p.id,
        rank: i + 1,
        points,
        time: Math.max(0, (p.dead ?? now) - r.start),
        total: p.score,
      });
    }
    i = end;
  }
  for (const p of r.players.filter(
    (p) => p.forfeited || (teams && !rows.some((row) => row.id === p.id)),
  ))
    rows.push({
      id: p.id,
      rank: null,
      points: 0,
      time: Math.max(0, (p.dead ?? r.start) - r.start),
      total: p.score,
    });
  r.results = rows;
  r.history.push({
    matchId: r.matchId!,
    round: r.round,
    game: r.game,
    results: rows,
    ...(r.liarResult ? { liarResult: r.liarResult } : {}),
  });
  r.phase = "result";
  r.nextRound = now + 5000;
}
export function tick(r: MatchRoom, now: number, dt: number) {
  r.now = now;
  if (r.phase === "result" && now >= r.nextRound) {
    if (r.round === r.settings.rounds) r.phase = "final";
    else beginRound(r, now);
    return;
  }
  if (r.phase === "intro" && now >= r.start - 3000) r.phase = "countdown";
  if (r.phase === "countdown" && now >= r.start) r.phase = "playing";
  if (r.phase !== "playing") return;
  if (r.game === "liar-game") {
    const game = currentLiar(r)!;
    game.advance(now);
    if (game.outcome) settle(r, now, game.groups());
    return;
  }
  for (const p of r.players)
    if (now - p.inputAt >= 250) {
      p.dx = 0;
      p.dy = 0;
    }
  modules[r.game].tick(r, Math.min(now, r.start + 90000), dt);
  if (
    now >= r.start + 90000 ||
    r.players.filter((p) => p.alive).length <= 1 ||
    (r.game === "falling-floor" && !r.tiles.includes(0))
  )
    settle(r, Math.min(now, r.start + 90000));
}
