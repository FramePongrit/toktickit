import { normalizeEmail } from "./identity.js";
import { systemClock, type Clock } from "./dependencies.js";

export const LOGIN_THROTTLE_LIMIT = 5;
export const LOGIN_THROTTLE_WINDOW_MS = 15 * 60 * 1000;

interface AttemptRecord {
  failures: number;
  windowStartedAt: number;
}

export interface ThrottleStorage {
  get(email: string): AttemptRecord | undefined;
  set(email: string, record: AttemptRecord): void;
  delete(email: string): void;
}

export class InMemoryThrottleStorage implements ThrottleStorage {
  private readonly records = new Map<string, AttemptRecord>();

  get(email: string): AttemptRecord | undefined {
    return this.records.get(email);
  }

  set(email: string, record: AttemptRecord): void {
    this.records.set(email, record);
  }

  delete(email: string): void {
    this.records.delete(email);
  }
}

export class LoginThrottle {
  private readonly clock: Clock;
  private readonly storage: ThrottleStorage;

  constructor(dependencies: { clock?: Clock; storage?: ThrottleStorage } = {}) {
    this.clock = dependencies.clock ?? systemClock;
    this.storage = dependencies.storage ?? new InMemoryThrottleStorage();
  }

  isThrottled(email: string): boolean {
    const key = normalizeEmail(email);
    const record = this.storage.get(key);
    if (!record) return false;
    if (this.clock.now().getTime() - record.windowStartedAt >= LOGIN_THROTTLE_WINDOW_MS) {
      this.storage.delete(key);
      return false;
    }
    return record.failures >= LOGIN_THROTTLE_LIMIT;
  }

  recordFailure(email: string): { failures: number; throttled: boolean } {
    const key = normalizeEmail(email);
    const now = this.clock.now().getTime();
    const existing = this.storage.get(key);
    const record =
      !existing || now - existing.windowStartedAt >= LOGIN_THROTTLE_WINDOW_MS
        ? { failures: 1, windowStartedAt: now }
        : { failures: existing.failures + 1, windowStartedAt: existing.windowStartedAt };
    this.storage.set(key, record);
    return { failures: record.failures, throttled: record.failures >= LOGIN_THROTTLE_LIMIT };
  }

  clear(email: string): void {
    this.storage.delete(normalizeEmail(email));
  }
}
