import type { PoolClient } from "pg"
import type { NotificationType } from "@/lib/notifications/notification-types"
import { runWithoutAuth } from "@/lib/db"

/**
 * When no preference row exists, transactional emails are allowed (opt-out model).
 * Once a row exists, honor notification_preferences.email_enabled.
 */
export async function isMemberEmailEnabled(
  memberId: string,
  notificationType: NotificationType,
  client?: PoolClient,
): Promise<boolean> {
  const check = async (db: PoolClient) => {
    const res = await db.query<{ email_enabled: boolean }>(
      `SELECT email_enabled
       FROM notification_preferences
       WHERE user_id = $1
         AND user_type = 'member'
         AND notification_type = $2
       LIMIT 1`,
      [memberId, notificationType],
    )
    if ((res.rowCount ?? 0) === 0) return true
    return Boolean(res.rows[0]?.email_enabled)
  }

  if (client) return check(client)
  return runWithoutAuth(check)
}

export async function isStaffEmailEnabled(
  staffId: string,
  notificationType: NotificationType,
  client?: PoolClient,
): Promise<boolean> {
  const check = async (db: PoolClient) => {
    const res = await db.query<{ email_enabled: boolean }>(
      `SELECT email_enabled
       FROM notification_preferences
       WHERE user_id = $1
         AND user_type = 'institution_user'
         AND notification_type = $2
       LIMIT 1`,
      [staffId, notificationType],
    )
    if ((res.rowCount ?? 0) === 0) return true
    return Boolean(res.rows[0]?.email_enabled)
  }

  if (client) return check(client)
  return runWithoutAuth(check)
}

export async function isOpeningBalanceEmailEnabled(
  memberId: string,
  hasSavings: boolean,
  hasLoan: boolean,
  client?: PoolClient,
): Promise<boolean> {
  const checks: Promise<boolean>[] = []
  if (hasSavings) checks.push(isMemberEmailEnabled(memberId, "opening_savings_recorded", client))
  if (hasLoan) checks.push(isMemberEmailEnabled(memberId, "opening_loan_recorded", client))
  if (checks.length === 0) return false
  const results = await Promise.all(checks)
  return results.some(Boolean)
}
