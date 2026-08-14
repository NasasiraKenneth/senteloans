import type { NotificationType } from "@/lib/notifications/notification-types"

/** Maps email template ids to notification_preferences.notification_type. */
export const EMAIL_TEMPLATE_NOTIFICATION_TYPE: Record<string, NotificationType> = {
  "member.welcome": "member_welcome",
  "member.portal_credentials": "member_portal_access_enabled",
  "member.kyc_required": "kyc_verification_required",
  "kyc.submitted": "kyc_submitted",
  "kyc.uploaded": "kyc_submitted",
  "kyc.approved": "kyc_approved",
  "kyc.rejected": "kyc_rejected",
  "member.invoice": "membership_invoice_created",
  "invoice.sent": "invoice_created",
  "invoice.payment_recorded": "invoice_payment_recorded",
  "membership_fee.paid": "membership_fee_paid",
  "shares.purchased": "shares_purchased",
  "shares.transferred": "shares_transferred",
  "shares.received": "shares_transferred",
  "shares.sold": "shares_sold",
  "shares.buy_out": "shares_purchased",
  "loan.payment_received": "payment_received",
  "savings.deposit": "deposit_received",
  "savings.withdrawal": "withdrawal_processed",
  "savings.transfer": "transfer_processed",
  "savings.transfer_deposit": "deposit_received",
  "opening_balance.recorded": "opening_savings_recorded",
  "loan.application_submitted": "loan_application_submitted",
  "loan.pending_approval": "pending_loan_approval",
  "loan.under_review": "loan_under_review",
  "loan.reviewed": "loan_reviewed",
  "loan.status_change": "loan_status_change",
  "loan.approved": "loan_approved",
  "loan.rejected": "loan_rejected",
  "loan.partially_disbursed": "loan_partially_disbursed",
  "loan.disbursed": "loan_disbursed",
  "loan.ready_for_approval": "loan_ready_for_approval",
  "loan.under_review_staff": "loan_under_review",
  "loan.approved_staff": "loan_approved",
  "loan.rejected_staff": "loan_rejected",
  "loan.partially_disbursed_staff": "loan_partially_disbursed",
  "loan.fully_disbursed_staff": "loan_disbursed",
}

export function notificationTypeForEmailTemplate(template: string): NotificationType | null {
  return EMAIL_TEMPLATE_NOTIFICATION_TYPE[template] ?? null
}
