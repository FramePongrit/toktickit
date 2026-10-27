import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { HttpError } from "./httpError.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface IdempotencyScope {
  userId: number;
  method: "POST" | "PATCH";
  canonicalPath: string;
  key: string;
}

export type IdempotencyLockTestHook = (context: {
  canonicalPath: string;
  backendPid: number;
}) => void | Promise<void>;

let idempotencyLockTestHook: IdempotencyLockTestHook | undefined;

export function setIdempotencyLockTestHook(hook: IdempotencyLockTestHook | undefined): void {
  idempotencyLockTestHook = hook;
}

export function requireIdempotencyKey(value: string | undefined): string {
  if (!value || !UUID_V4.test(value)) {
    throw HttpError.validationFailed("A UUID v4 Idempotency-Key header is required.", [
      { field: "Idempotency-Key", message: "Use a valid UUID v4 request key." },
    ]);
  }
  return value.toLowerCase();
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalValue(nested)])
    );
  }
  return value;
}

/** Canonicalizes JSON property ordering while preserving supplied values and omissions. */
export function canonicalRequestJson(body: unknown): string {
  return JSON.stringify(canonicalValue(body)) ?? "undefined";
}

export function digestRequestBody(body: unknown): string {
  return createHash("sha256").update(canonicalRequestJson(body)).digest("hex");
}

function scopeText(scope: IdempotencyScope): string {
  return JSON.stringify([scope.userId, scope.method, scope.canonicalPath, scope.key]);
}

export async function lockAndReadIdempotencyRecord(
  tx: Prisma.TransactionClient,
  scope: IdempotencyScope
) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scopeText(scope)}, 0))::text AS "locked"`;
  if (idempotencyLockTestHook) {
    const [{ backendPid }] = await tx.$queryRaw<{ backendPid: number }[]>`
      SELECT pg_backend_pid() AS "backendPid"
    `;
    await idempotencyLockTestHook({ canonicalPath: scope.canonicalPath, backendPid });
  }
  return tx.idempotencyRecord.findUnique({
    where: {
      userId_method_canonicalPath_key: {
        userId: scope.userId,
        method: scope.method,
        canonicalPath: scope.canonicalPath,
        key: scope.key,
      },
    },
  });
}

export function replayIdempotencyRecord(
  record: NonNullable<Awaited<ReturnType<typeof lockAndReadIdempotencyRecord>>>,
  digest: string
) {
  if (record.payloadDigest !== digest) {
    throw HttpError.conflict("IDEMPOTENCY_KEY_REUSED", "This request key was already used for different data.");
  }
  return { status: record.httpStatus, body: record.response as Prisma.JsonValue, replayed: true as const };
}

export async function saveIdempotencySuccess(
  tx: Prisma.TransactionClient,
  scope: IdempotencyScope,
  digest: string,
  status: number,
  body: unknown
): Promise<void> {
  const response = JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue;
  await tx.idempotencyRecord.create({
    data: {
      userId: scope.userId,
      method: scope.method,
      canonicalPath: scope.canonicalPath,
      key: scope.key,
      payloadDigest: digest,
      httpStatus: status,
      response,
    },
  });
}
