export const games = {
  "falling-floor": {
    name: "바닥이 사라진다",
    english: "FALLING FLOOR",
    rule: "출발 발판도 무너져요. 시작과 동시에 파란 발판으로 이동하세요.",
    actions: "Space 점프 · Shift 대시",
  },
  "push-out": {
    name: "밀어내기",
    english: "PUSH OUT",
    rule: "상대를 원 밖으로 밀어내세요. 점선이 나타나면 다음 안전 원 안으로 이동하세요.",
    actions: "Space 밀치기 · Shift 대시 · E 방어",
  },
} as const;
export type GameId = keyof typeof games;
export const gameIds = Object.keys(games) as GameId[];
export const defaults = {
  maxPlayers: 6,
  rounds: 5,
  mode: "random",
  singleGame: "falling-floor",
  collapseMs: 1000,
  mobility: true,
  defense: true,
} as const;
export type Settings = {
  maxPlayers: number;
  rounds: number;
  mode: "random" | "alternate" | "single";
  singleGame: GameId;
  collapseMs: number;
  mobility: boolean;
  defense: boolean;
};
