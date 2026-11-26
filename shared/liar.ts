export type Stage =
  | "role"
  | "clue"
  | "review"
  | "vote"
  | "runoff"
  | "guess"
  | "finished";
export type Outcome =
  | "LIAR_ESCAPED"
  | "LIAR_UNRESOLVED"
  | "LIAR_GUESSED"
  | "CITIZENS_CAUGHT"
  | "LIAR_FORFEIT"
  | "VOID";
export type Clue = {
  playerId: string;
  turnId: string;
  text: string | null;
  status: "submitted" | "timeout" | "forfeit";
};
export type LiarPublic = {
  stage: Stage;
  version: number;
  revision: number;
  category: string;
  order: string[];
  turnIndex: number;
  turnId: string | null;
  deadline: number;
  clues: Clue[];
  voteRound: number;
  candidates: string[];
  voteCount: number;
  voterCount: number;
  nominated: string | null;
};
export type LiarPrivate = {
  matchId: string;
  round: number;
  version: number;
  revision: number;
  role: "citizen" | "liar";
  word: string | null;
  myVote: string | null;
  canGuess: boolean;
  hasClue: boolean;
};
export type LiarResult = {
  outcome: Outcome;
  answer: string | null;
  category: string;
  liarId: string | null;
  guess: string | null;
  nominated: string | null;
  clues: Clue[];
  ballots: { round: number; voter: string; target: string; valid: boolean }[];
};
export type LiarInput = {
  requestId: string;
  matchId: string;
  roundIndex: number;
  phaseVersion: number;
  turnId?: string;
  voteRound?: number;
  text?: string;
  targetId?: string;
};
export type LiarAction = "clue" | "vote" | "guess";
export type Ack = {
  ok: boolean;
  code?: string;
  requestId?: string;
  revision?: number;
};
