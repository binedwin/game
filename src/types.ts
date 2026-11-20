export type Member = {
  id: string;
  name: string;
  color: string;
  bot: boolean;
  ready: boolean;
  connected: boolean;
  alive: boolean;
  score: number;
  wins: number;
  x: number;
  y: number;
  fx: number;
  fy: number;
  jumpUntil: number;
  dashUntil: number;
  jumpReady: number;
  dashReady: number;
  item: string | null;
  shield: boolean;
  frozen: number;
  ghost: number;
  dead: number | null;
};
export type Settings = {
  maxPlayers: number;
  rounds: number;
  map: string;
  difficulty: string;
  collapseMs: number;
  mobility: boolean;
  items: boolean;
  special: boolean;
};
export type Room = {
  code: string;
  host: string;
  phase: string;
  round: number;
  settings: Settings;
  players: Member[];
  tiles: number[];
  size: number;
  start: number;
  now: number;
  nextRound: number;
  ring: number;
  ringWarning: number;
  practice?: boolean;
  specials: Record<string, string>;
  loot: Record<string, string>;
  durations: Record<string, number>;
  fuses: Record<string, number>;
  effects: { target: string; at: number }[];
  results: { id: string; rank: number; points: number; time: number }[];
};
export const itemNames: Record<string, string> = {
  superJump: "슈퍼 점프",
  bomb: "폭탄",
  push: "밀치기",
  freeze: "얼리기",
  shield: "보호막",
  ghost: "유령",
  swap: "위치 교환",
};
export type Command = (type: string, body?: Record<string, unknown>) => void;
