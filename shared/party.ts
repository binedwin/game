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
  "liar-game": {
    name: "라이어 게임",
    english: "LIAR GAME",
    rule: "같은 단어를 한 번씩 설명하고, 단어를 모르는 한 사람을 찾아내세요.",
    actions: "차례에 설명 입력 · 비밀 투표 · 라이어의 마지막 추측",
  },
} as const;
export type GameId = keyof typeof games;
export const gameIds = Object.keys(games) as GameId[];
export function eligibleGames(
  s: Pick<Settings, "enabledGames">,
  count: number,
) {
  return gameIds.filter(
    (id) => s.enabledGames.includes(id) && (id !== "liar-game" || count >= 3),
  );
}
export const defaults = {
  maxPlayers: 6,
  rounds: 5,
  mode: "random",
  singleGame: "falling-floor",
  collapseMs: 1000,
  mobility: true,
  defense: true,
  enabledGames: gameIds,
} as const;
export type Settings = {
  maxPlayers: number;
  rounds: number;
  mode: "random" | "alternate" | "single";
  singleGame: GameId;
  collapseMs: number;
  mobility: boolean;
  defense: boolean;
  enabledGames: GameId[];
};
