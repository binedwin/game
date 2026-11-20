export type { Room, Member, Settings } from "../shared/snapshot";
export type Command = (type: string, body?: Record<string, unknown>) => void;
