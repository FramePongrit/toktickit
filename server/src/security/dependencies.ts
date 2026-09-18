import { randomBytes } from "node:crypto";

export interface Clock {
  now(): Date;
}

export interface RandomSource {
  bytes(size: number): Uint8Array;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export const systemRandom: RandomSource = {
  bytes: (size) => randomBytes(size),
};
