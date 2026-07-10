import { NextResponse } from "next/server"
import type { PoolClient } from "@/lib/db"
import { toConfigFlag } from "@/lib/institution-branch-config"
import {
  CHATS_DISABLED_ERROR,
  CHATS_DISABLED_MESSAGE,
} from "@/lib/chats/chats-disabled"

export { CHATS_DISABLED_ERROR, CHATS_DISABLED_MESSAGE }

export class ChatsDisabledError extends Error {
  readonly code = CHATS_DISABLED_ERROR

  constructor(message = CHATS_DISABLED_MESSAGE) {
    super(message)
    this.name = "ChatsDisabledError"
  }
}

export function chatsDisabledResponse() {
  return NextResponse.json(
    { error: CHATS_DISABLED_ERROR, message: CHATS_DISABLED_MESSAGE },
    { status: 403 },
  )
}

/**
 * Reads branch `config.chats` (VARCHAR 'true'/'false').
 * Falls back to any institution branch config when branchId is missing.
 */
export async function isChatsModuleEnabled(
  client: PoolClient,
  options: {
    institutionId: string
    branchId?: string | null
  },
): Promise<boolean> {
  const { institutionId, branchId } = options

  const res = await client.query(
    `SELECT c.chats
       FROM config c
       INNER JOIN branches b ON b.id = c.branch_id
      WHERE b.institution_id = $1
        AND ($2::uuid IS NULL OR c.branch_id = $2)
      ORDER BY
        CASE WHEN $2::uuid IS NOT NULL AND c.branch_id = $2 THEN 0 ELSE 1 END,
        c.updated_at DESC NULLS LAST,
        c.created_at DESC
      LIMIT 1`,
    [institutionId, branchId ?? null],
  )

  if ((res.rowCount ?? 0) === 0) return false
  return toConfigFlag(res.rows[0]?.chats, false)
}

export async function assertChatsModuleEnabled(
  client: PoolClient,
  options: {
    institutionId: string
    branchId?: string | null
  },
): Promise<void> {
  const enabled = await isChatsModuleEnabled(client, options)
  if (!enabled) {
    throw new ChatsDisabledError()
  }
}
