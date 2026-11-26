import { randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { MatchRoom, Actor } from "../state";
import type {
  LiarPublic,
  LiarPrivate,
  LiarResult,
  LiarAction,
  LiarInput,
  Ack,
  Outcome,
  Stage,
} from "../../../shared/liar";

type Word = {
  answer: string;
  aliases: string[];
  category: string;
  hint: string;
};
const words: Word[] = JSON.parse(
  readFileSync(new URL("./words.ko.json", import.meta.url), "utf8"),
);
const pick = <T>(items: T[]): T => items[randomInt(items.length)];
function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
const norm = (s: string) =>
  s.replace(/\s+/gu, "").normalize("NFC").toLowerCase();
function clean(value: unknown) {
  if (typeof value !== "string" || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(value))
    return null;
  const s = value.normalize("NFC").trim();
  return s && [...s].length <= 80 ? s : null;
}
const rounds = new WeakMap<MatchRoom, LiarRound>();
export function currentLiar(r: MatchRoom) {
  return rounds.get(r);
}
export function clearLiar(r: MatchRoom) {
  rounds.delete(r);
  delete r.liar;
  delete r.liarResult;
}
export function initLiar(r: MatchRoom) {
  const used = new Set(r.history.map((h) => h.liarResult?.answer));
  const available = words.filter((w) => !used.has(w.answer));
  const game = new LiarRound(r, pick(available.length ? available : words));
  rounds.set(r, game);
  r.liar = game.view;
}
export class LiarRound {
  readonly room: MatchRoom;
  readonly word: Word;
  readonly liarId: string;
  readonly view: LiarPublic;
  private ballots = [new Map<string, string>(), new Map<string, string>()];
  private accepted = new Map<string, { signature: string; ack: Ack }>();
  private botAt = 0;
  private guess: string | null = null;
  outcome: Outcome | null = null;
  constructor(r: MatchRoom, word: Word) {
    this.room = r;
    this.word = word;
    const ids = this.eligible();
    this.liarId = pick(ids);
    const order = shuffle(ids);
    this.view = {
      stage: "role",
      category: word.category,
      order,
      turnIndex: -1,
      turnId: null,
      clues: [],
      version: 1,
      revision: 1,
      deadline: r.start + 5000,
      voteRound: 0,
      candidates: [],
      voteCount: 0,
      voterCount: 0,
      nominated: null,
    };
  }
  eligible() {
    return this.room.players.filter((p) => !p.forfeited).map((p) => p.id);
  }
  personal(id: string): LiarPrivate | null {
    if (
      !this.view.order.includes(id) ||
      this.room.phase !== "playing" ||
      this.outcome
    )
      return null;
    const v = this.view,
      liar = id === this.liarId;
    return {
      matchId: this.room.matchId!,
      round: this.room.round,
      version: v.version,
      revision: v.revision,
      role: liar ? "liar" : "citizen",
      word: liar ? null : this.word.answer,
      myVote: this.ballots[v.voteRound - 1]?.get(id) ?? null,
      canGuess: liar && v.stage === "guess",
      hasClue: v.clues.some((c) => c.playerId === id),
    };
  }
  private stage(stage: Stage, now: number, duration: number) {
    const v = this.view;
    v.stage = stage;
    v.version++;
    v.revision++;
    v.deadline = now + duration;
    v.turnId = null;
    this.botAt = now + 1400;
  }
  private nextTurn(now: number) {
    const v = this.view;
    while (++v.turnIndex < v.order.length) {
      this.stage("clue", now, 12000);
      v.turnId = randomUUID();
      if (this.eligible().includes(v.order[v.turnIndex])) return;
      this.record(null, "forfeit");
    }
    this.stage("review", now, 5000);
  }
  private record(
    text: string | null,
    status: "submitted" | "timeout" | "forfeit",
  ) {
    const v = this.view;
    v.clues.push({
      playerId: v.order[v.turnIndex],
      turnId: v.turnId!,
      text,
      status,
    });
  }
  private voting(now: number, candidates: string[], round: number) {
    this.stage(
      round === 1 ? "vote" : "runoff",
      now,
      round === 1 ? 15000 : 10000,
    );
    this.view.voteRound = round;
    this.view.candidates = candidates;
    this.countVotes();
  }
  private countVotes() {
    const v = this.view,
      eligible = this.eligible();
    v.candidates = v.candidates.filter((id) => eligible.includes(id));
    const voters = eligible.filter((id) =>
      v.candidates.some((candidate) => candidate !== id),
    );
    const ballots = this.ballots[v.voteRound - 1];
    v.voterCount = voters.length;
    v.voteCount = voters.filter((id) => ballots.has(id)).length;
  }
  private tally(now: number) {
    const v = this.view,
      counts = new Map<string, number>();
    for (const target of this.ballots[v.voteRound - 1].values())
      if (v.candidates.includes(target))
        counts.set(target, (counts.get(target) ?? 0) + 1);
    const max = Math.max(0, ...counts.values()),
      top = [...counts].filter(([, n]) => n === max).map(([id]) => id);
    if (top.length === 1) {
      v.nominated = top[0];
      if (top[0] === this.liarId) this.stage("guess", now, 12000);
      else this.finish("LIAR_ESCAPED", now);
    } else if (top.length > 1 && v.voteRound === 1) this.voting(now, top, 2);
    else this.finish("LIAR_UNRESOLVED", now);
  }
  private finish(outcome: Outcome, now: number) {
    if (this.outcome) return;
    this.outcome = outcome;
    this.stage("finished", now, 0);
    this.room.liarResult = {
      liarId: this.liarId,
      answer: this.word.answer,
      category: this.word.category,
      nominated: this.view.nominated,
      clues: [...this.view.clues],
      guess: this.guess,
      outcome,
      ballots: this.ballots.flatMap((b, i) =>
        [...b].map(([voter, target]) => ({
          round: i + 1,
          voter,
          target,
          valid: this.eligible().includes(target),
        })),
      ),
    };
  }
  groups(): string[][] {
    if (!this.outcome || this.outcome === "VOID") return [];
    const citizens = this.eligible().filter((id) => id !== this.liarId);
    const liar = this.eligible().filter((id) => id === this.liarId);
    return this.outcome === "CITIZENS_CAUGHT" || this.outcome === "LIAR_FORFEIT"
      ? [citizens, liar]
      : [liar, citizens];
  }
  advance(now: number) {
    if (this.outcome) return;
    const ids = this.eligible(),
      v = this.view;
    if (!ids.includes(this.liarId)) {
      this.finish("LIAR_FORFEIT", now);
      return;
    }
    if (ids.length < 3) {
      this.finish("VOID", now);
      return;
    }
    if (now >= this.room.start + 132000) {
      this.finish(
        v.stage === "guess" ? "CITIZENS_CAUGHT" : "LIAR_UNRESOLVED",
        now,
      );
      return;
    }
    if (v.stage === "clue" && !ids.includes(v.order[v.turnIndex])) {
      this.record(null, "forfeit");
      this.nextTurn(now);
      return;
    }
    if (v.stage === "vote" || v.stage === "runoff") {
      this.countVotes();
      if (v.voteCount === v.voterCount || now >= v.deadline) {
        this.tally(now);
        return;
      }
    }
    if (now >= v.deadline) {
      if (v.stage === "role") this.nextTurn(now);
      else if (v.stage === "clue") {
        this.record(null, "timeout");
        this.nextTurn(now);
      } else if (v.stage === "review") this.voting(now, ids, 1);
      else if (v.stage === "guess") this.finish("CITIZENS_CAUGHT", now);
      return;
    }
    if (this.room.practice && now >= this.botAt) {
      this.botAt = now + 900;
      this.botStep(now);
    }
  }
  private botStep(now: number) {
    const v = this.view;
    for (const bot of this.room.players.filter((p) => p.bot && !p.forfeited)) {
      const type =
        v.stage === "clue" ? "clue" : v.stage === "guess" ? "guess" : "vote";
      const data: LiarInput = {
        matchId: this.room.matchId!,
        roundIndex: this.room.round,
        phaseVersion: v.version,
        requestId: randomUUID(),
        voteRound: v.voteRound,
      };
      if (type === "clue" && v.order[v.turnIndex] === bot.id) {
        data.turnId = v.turnId!;
        data.text =
          bot.id === this.liarId
            ? "친구들과 이야기할 때 떠올린 적 있어요."
            : v.clues.some((c) => c.text === this.word.hint)
              ? pick([
                  "어릴 때 처음 알게 됐어요.",
                  "저한테는 익숙한 편이에요.",
                  "사람마다 떠올리는 장면이 달라요.",
                ])
              : this.word.hint;
      } else if (
        type === "vote" &&
        (v.stage === "vote" || v.stage === "runoff") &&
        !this.ballots[v.voteRound - 1].has(bot.id)
      ) {
        const candidates = v.candidates.filter((id) => id !== bot.id);
        if (!candidates.length) continue;
        data.targetId = pick(candidates);
      } else if (type === "guess" && bot.id === this.liarId) {
        data.text = pick(words.filter((w) => w.category === v.category)).answer;
      } else continue;
      this.submit(bot, type, data, now);
      return;
    }
  }
  submit(p: Actor, type: LiarAction, data: LiarInput, now: number): Ack {
    const v = this.view;
    if (
      !data ||
      data.matchId !== this.room.matchId ||
      data.roundIndex !== this.room.round
    )
      return { ok: false, code: "STALE_ROUND" };
    if (!p.connected || p.forfeited || !v.order.includes(p.id))
      return { ok: false, code: "INELIGIBLE" };
    if (
      typeof data.requestId !== "string" ||
      !data.requestId.length ||
      data.requestId.length > 96
    )
      return { ok: false, code: "INVALID_REQUEST" };
    const key = p.id + "/" + data.requestId,
      signature = JSON.stringify([
        type,
        data.phaseVersion,
        data.turnId,
        data.voteRound,
        data.targetId,
        data.text,
      ]);
    const old = this.accepted.get(key);
    if (old)
      return old.signature === signature
        ? old.ack
        : { ok: false, code: "REQUEST_CONFLICT" };
    if (
      this.room.phase !== "playing" ||
      this.outcome ||
      v.version !== data.phaseVersion
    )
      return { ok: false, code: "WRONG_PHASE" };
    if (now >= v.deadline || now >= this.room.start + 132000)
      return { ok: false, code: "DEADLINE_PASSED" };
    if (type === "clue" && v.stage === "clue") {
      if (v.turnId !== data.turnId || v.order[v.turnIndex] !== p.id)
        return { ok: false, code: "NOT_YOUR_TURN" };
      const text = clean(data.text);
      if (!text) return { ok: false, code: "INVALID_TEXT" };
      this.record(text, "submitted");
      this.nextTurn(now);
    } else if (
      type === "vote" &&
      (v.stage === "vote" || v.stage === "runoff")
    ) {
      const ballot = this.ballots[v.voteRound - 1];
      if (
        data.voteRound !== v.voteRound ||
        !data.targetId ||
        p.id === data.targetId ||
        !v.candidates.includes(data.targetId) ||
        !this.eligible().includes(data.targetId)
      )
        return { ok: false, code: "INVALID_TARGET" };
      if (ballot.has(p.id)) return { ok: false, code: "ALREADY_SUBMITTED" };
      ballot.set(p.id, data.targetId);
      v.revision++;
      this.countVotes();
      if (v.voteCount === v.voterCount) this.tally(now);
    } else if (
      type === "guess" &&
      v.stage === "guess" &&
      p.id === this.liarId
    ) {
      const guess = clean(data.text);
      if (!guess) return { ok: false, code: "INVALID_TEXT" };
      this.guess = guess;
      this.finish(
        [this.word.answer, ...this.word.aliases].some(
          (a) => norm(a) === norm(guess),
        )
          ? "LIAR_GUESSED"
          : "CITIZENS_CAUGHT",
        now,
      );
    } else return { ok: false, code: "WRONG_PHASE" };
    const ack = { ok: true, requestId: data.requestId, revision: v.revision };
    this.accepted.set(key, { signature, ack });
    return ack;
  }
}
