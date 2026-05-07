import type { PoolClient } from "pg"
import { runWithoutAuth } from "@/lib/db"
import type { CreateNotificationInput } from "./notification-types"

async function withClient<T>(
  client: PoolClient | undefined,
  fn: (c: PoolClient) => Promise<T>
): Promise<T> {
  if (client) return fn(client)
  return runWithoutAuth(fn)
}

export class NotificationService {
  async create(
    input: CreateNotificationInput,
    client?: PoolClient
  ): Promise<{ ok: boolean; notificationId?: string; error?: string }> {
    try {
      const row = await withClient(client, async (c) => {
        const res = await c.query(
          `INSERT INTO senteloans_notifications (
            institution_id, branch_id, recipient_type, recipient_id, type, title, message, action_url, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id`,
          [
            input.institutionId,
            input.branchId,
            input.recipientType,
            input.recipientId,
            input.type,
            input.title,
            input.message,
            input.actionUrl ?? null,
            JSON.stringify(input.metadata || {}),
          ]
        )
        return res.rows[0]?.id
      })
      return { ok: true, notificationId: row }
    } catch (e: unknown) {
      const err = e as Error
      console.error("[NotificationService] Create error:", err)
      return { ok: false, error: err?.message || "Unexpected error" }
    }
  }

  async createBulk(
    inputs: CreateNotificationInput[],
    client?: PoolClient
  ): Promise<{ ok: boolean; count?: number; error?: string }> {
    try {
      const count = await withClient(client, async (c) => {
        for (const input of inputs) {
          await c.query(
            `INSERT INTO senteloans_notifications (
              institution_id, branch_id, recipient_type, recipient_id, type, title, message, action_url, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              input.institutionId,
              input.branchId,
              input.recipientType,
              input.recipientId,
              input.type,
              input.title,
              input.message,
              input.actionUrl ?? null,
              JSON.stringify(input.metadata || {}),
            ]
          )
        }
        return inputs.length
      })
      return { ok: true, count }
    } catch (e: unknown) {
      const err = e as Error
      console.error("[NotificationService] Bulk create error:", err)
      return { ok: false, error: err?.message || "Unexpected error" }
    }
  }

  async markAsRead(notificationId: string, client?: PoolClient): Promise<{ ok: boolean; error?: string }> {
    try {
      await withClient(client, async (c) => {
        await c.query(
          `UPDATE senteloans_notifications SET read = true, read_at = NOW() WHERE id = $1`,
          [notificationId]
        )
      })
      return { ok: true }
    } catch (e: unknown) {
      const err = e as Error
      console.error("[NotificationService] Mark as read error:", err)
      return { ok: false, error: err?.message || "Unexpected error" }
    }
  }

  async markManyAsRead(
    notificationIds: string[],
    client?: PoolClient
  ): Promise<{ ok: boolean; count?: number; error?: string }> {
    if (notificationIds.length === 0) return { ok: true, count: 0 }
    try {
      const count = await withClient(client, async (c) => {
        const res = await c.query(
          `UPDATE senteloans_notifications SET read = true, read_at = NOW() WHERE id = ANY($1::uuid[]) RETURNING id`,
          [notificationIds]
        )
        return res.rowCount ?? 0
      })
      return { ok: true, count }
    } catch (e: unknown) {
      const err = e as Error
      console.error("[NotificationService] Mark many as read error:", err)
      return { ok: false, error: err?.message || "Unexpected error" }
    }
  }

  async markAllAsRead(
    recipientId: string,
    recipientType: "client" | "institution_user",
    client?: PoolClient
  ): Promise<{ ok: boolean; count?: number; error?: string }> {
    try {
      const count = await withClient(client, async (c) => {
        const res = await c.query(
          `UPDATE senteloans_notifications SET read = true, read_at = NOW()
           WHERE recipient_id = $1 AND recipient_type = $2 AND read = false
           RETURNING id`,
          [recipientId, recipientType]
        )
        return res.rowCount ?? 0
      })
      return { ok: true, count }
    } catch (e: unknown) {
      const err = e as Error
      console.error("[NotificationService] Mark all as read error:", err)
      return { ok: false, error: err?.message || "Unexpected error" }
    }
  }

  async deleteExpired(client?: PoolClient): Promise<{ ok: boolean; count?: number; error?: string }> {
    try {
      const count = await withClient(client, async (c) => {
        const res = await c.query(
          `DELETE FROM senteloans_notifications WHERE expires_at < NOW() RETURNING id`
        )
        return res.rowCount ?? 0
      })
      return { ok: true, count }
    } catch (e: unknown) {
      const err = e as Error
      console.error("[NotificationService] Delete expired error:", err)
      return { ok: false, error: err?.message || "Unexpected error" }
    }
  }

  async getUnreadCount(
    recipientId: string,
    recipientType: "client" | "institution_user",
    client?: PoolClient
  ): Promise<{ ok: boolean; count?: number; error?: string }> {
    try {
      const count = await withClient(client, async (c) => {
        const res = await c.query(
          `SELECT COUNT(*)::int AS c FROM senteloans_notifications
           WHERE recipient_id = $1 AND recipient_type = $2 AND read = false`,
          [recipientId, recipientType]
        )
        return res.rows[0]?.c ?? 0
      })
      return { ok: true, count }
    } catch (e: unknown) {
      const err = e as Error
      console.error("[NotificationService] Get unread count error:", err)
      return { ok: false, error: err?.message || "Unexpected error" }
    }
  }
}

export const notificationService = new NotificationService()
