/**
 * Shared Redis connection factory for BullMQ producers (Queue, QueueEvents)
 * and workers.
 *
 * Why the split?
 * - Producers (Queue / QueueEvents) can safely share ONE connection because
 *   their commands are non-blocking. We expose that as `getSharedConnection()`.
 * - Workers use blocking Redis commands (BRPOPLPUSH, XREAD, etc.) which hog
 *   whatever connection they sit on, so each Worker should get its OWN
 *   connection from `createConnection()`. They still share this module's
 *   configuration so options stay consistent.
 *
 * Next.js note: hot-module reload in dev would otherwise create a new
 * connection on every file change. We stash the shared instance on
 * `globalThis` so HMR re-uses it. This is the same trick used for Prisma /
 * single-pg-pool patterns.
 */

import type { ConnectionOptions } from "bullmq"
import IORedis, { type Redis, type RedisOptions } from "ioredis"

/** BullMQ bundles its own ioredis types; cast avoids duplicate-package TS errors. */
function asBullConnection(conn: Redis): ConnectionOptions {
  return conn as unknown as ConnectionOptions
}

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379"

/**
 * BullMQ REQUIRES `maxRetriesPerRequest: null` on connections used by
 * workers. It is also safe for producers, so we use it everywhere to keep
 * one consistent options object.
 */
const BASE_OPTIONS: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: false,
}

function maskUrl(url: string): string {
  return url.replace(/(redis(?:s)?:\/\/[^@/]*:)([^@]+)(@)/i, "$1***$3")
}

function attachLifecycle(conn: Redis, label: string): Redis {
  conn.on("connect", () => {
    console.log(`[redis:${label}] connecting → ${maskUrl(REDIS_URL)}`)
  })
  conn.on("ready", () => {
    console.log(`[redis:${label}] ready`)
  })
  conn.on("error", (err: Error) => {
    console.error(`[redis:${label}] error: ${err.message}`)
  })
  conn.on("end", () => {
    console.warn(`[redis:${label}] connection closed`)
  })
  return conn
}

type GlobalWithRedis = typeof globalThis & {
  __senteloansRedis?: Redis
}

const globalForRedis = globalThis as GlobalWithRedis

/**
 * Returns the process-wide shared Redis connection. Safe for all BullMQ
 * `Queue` and `QueueEvents` instances. HMR-safe in Next.js dev mode.
 */
export function getRedis(): Redis {
  if (!globalForRedis.__senteloansRedis) {
    globalForRedis.__senteloansRedis = attachLifecycle(
      new IORedis(REDIS_URL, BASE_OPTIONS),
      "shared",
    )
  }
  return globalForRedis.__senteloansRedis
}

export function getSharedConnection(): ConnectionOptions {
  return asBullConnection(getRedis())
}

/**
 * Creates a dedicated connection. Use this for each `Worker` so blocking
 * commands don't contend with producers.
 */
export function createConnection(label = "worker"): ConnectionOptions {
  return asBullConnection(attachLifecycle(new IORedis(REDIS_URL, BASE_OPTIONS), label))
}

/**
 * Graceful shutdown helper. Closes the shared connection if it exists.
 * Workers should close their own connections via `worker.close()`.
 */
export async function closeSharedConnection(): Promise<void> {
  const conn = globalForRedis.__senteloansRedis
  if (conn) {
    globalForRedis.__senteloansRedis = undefined
    await conn.quit().catch(() => undefined)
  }
}

export { REDIS_URL }
