import type { NotificationType } from "@/lib/notifications/notification-types"

/** Maps email template ids to notification_preferences.notification_type. */
export const EMAIL_TEMPLATE_NOTIFICATION_TYPE: Record<string, NotificationType> = {
  "member.welcome": "member_welcome",
  "member.kyc_required": "kyc_verification_required",
  "kyc.submitted": "kyc_submitted",
  "kyc.uploaded": "kyc_submitted",
  "kyc.approved": "kyc_approved",
  "kyc.rejected": "kyc_rejected",
  "member.invoice": "membership_invoice_created",
  "membership_fee.paid": "membership_fee_paid",
  "shares.purchased": "shares_purchased",
  "opening_balance.recorded": "opening_savings_recorded",
}

export function notificationTypeForEmailTemplate(template: string): NotificationType | null {
  return EMAIL_TEMPLATE_NOTIFICATION_TYPE[template] ?? null
}
