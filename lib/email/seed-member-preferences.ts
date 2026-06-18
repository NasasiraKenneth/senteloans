import type { PoolClient } from "pg"
import type { NotificationType } from "@/lib/notifications/notification-types"

/** Transactional email types seeded for new members (email on by default). */
export const MEMBER_TRANSACTIONAL_EMAIL_TYPES: NotificationType[] = [
  "member_welcome",
  "kyc_verification_required",
  "kyc_submitted",
  "kyc_approved",
  "kyc_rejected",
  "membership_invoice_created",
  "membership_fee_paid",
  "shares_purchased",
  "opening_savings_recorded",
  "opening_loan_recorded",
]

export async function seedMemberEmailPreferences(
  client: PoolClient,
  params: {
    memberId: string
    institutionId: string
    branchId: string
    emailEnabled?: boolean
  },
): Promise<void> {
  await syncMemberEmailPreferences(client, {
    memberId: params.memberId,
    institutionId: params.institutionId,
    branchId: params.branchId,
    emailEnabled: params.emailEnabled !== false,
  })
}

/** Upsert transactional email prefs when member email is added, changed, or removed. */
export async function syncMemberEmailPreferences(
  client: PoolClient,
  params: {
    memberId: string
    institutionId: string
    branchId: string
    emailEnabled: boolean
  },
): Promise<void> {
  for (const notificationType of MEMBER_TRANSACTIONAL_EMAIL_TYPES) {
    await client.query(
      `INSERT INTO notification_preferences (
         institution_id, branch_id, user_type, user_id,
         notification_type, in_app_enabled, sms_enabled, email_enabled
       ) VALUES ($1, $2, 'member', $3, $4, true, false, $5)
       ON CONFLICT (user_id, notification_type) DO UPDATE SET
         email_enabled = EXCLUDED.email_enabled,
         updated_at = NOW()`,
      [
        params.institutionId,
        params.branchId,
        params.memberId,
        notificationType,
        params.emailEnabled,
      ],
    )
  }
}
