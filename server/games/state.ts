import type { Member, Room } from "../../shared/snapshot";
export type Actor = Member & {
  dx: number;
  dy: number;
  inputAt: number;
  botThink: number;
  botTarget: number | null;
  vx: number;
  vy: number;
  pushQueued: boolean;
  dashHits: string[];
  contacts: Record<string, number>;
  moveSeq: number;
  actionSeq: number;
};
export type MatchRoom = Omit<Room, "players"> & { players: Actor[] };
