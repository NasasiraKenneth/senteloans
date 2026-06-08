// Notification types and templates for SenteLoans
// Phase 1: In-app notifications for core events

export type NotificationType =
  // Loan events
  | 'loan_status_change'
  | 'loan_application_submitted'
  | 'loan_approved'
  | 'loan_rejected'
  | 'loan_disbursed'
  | 'payment_due'
  | 'payment_received'
  | 'payment_overdue'
  // KYC events
  | 'kyc_submitted'
  | 'kyc_approved'
  | 'kyc_rejected'
  // Account events
  | 'deposit_received'
  | 'withdrawal_processed'
  | 'profile_updated'
  // Admin events
  | 'pending_loan_approval'
  | 'pending_kyc_review'
  | 'loan_overdue_alert'
  | 'new_member_registered'
  // Member lifecycle events
  | 'member_welcome'
  | 'membership_invoice_created'
  | 'kyc_verification_required'
  // Shares events
  | 'shares_purchased'
  // Generic finance events
  | 'transaction_recorded'
  | 'invoice_created'

export type RecipientType = 'member' | 'institution_user'

export interface NotificationMetadata {
  loan_id?: string
  amount?: number
  due_date?: string
  status?: string
  doc_type?: string
  reason?: string
  client_id?: string
  client_name?: string
  [key: string]: any
}

export interface CreateNotificationInput {
  institutionId: string
  branchId: string
  recipientType: RecipientType
  recipientId: string
  type: NotificationType
  title: string
  message: string
  actionUrl?: string
  metadata?: NotificationMetadata
}

export interface Notification {
  id: string
  institution_id: string
  recipient_type: RecipientType
  recipient_id: string
  type: NotificationType
  title: string
  message: string
  action_url?: string
  metadata: NotificationMetadata
  read: boolean
  read_at?: string
  created_at: string
  expires_at: string
}

export interface NotificationPreference {
  id: string
  institution_id: string
  user_type: 'member' | 'institution_user'
  user_id: string
  notification_type: string
  in_app_enabled: boolean
  sms_enabled: boolean
  email_enabled: boolean
  created_at: string
  updated_at: string
}

// Notification template helpers
export const NotificationTemplates = {
  // Loan templates
  loanApplicationSubmitted: (loanId: string, amount: number) => ({
    title: 'Loan Application Submitted',
    message: `Your loan application for ${formatCurrency(amount)} has been submitted successfully.`,
    actionUrl: `/client-portal/loan-details/${loanId}`,
  }),

  loanApproved: (loanId: string, amount: number) => ({
    title: 'Loan Application Approved',
    message: `Great news! Your loan application for ${formatCurrency(amount)} has been approved.`,
    actionUrl: `/client-portal/loan-details/${loanId}`,
  }),

  loanRejected: (loanId: string, amount: number, reason?: string) => ({
    title: 'Loan Application Status',
    message: reason
      ? `Your loan application for ${formatCurrency(amount)} was not approved. Reason: ${reason}`
      : `Your loan application for ${formatCurrency(amount)} was not approved.`,
    actionUrl: `/client-portal/loan-details/${loanId}`,
  }),

  loanDisbursed: (loanId: string, amount: number) => ({
    title: 'Loan Disbursed',
    message: `Your loan of ${formatCurrency(amount)} has been disbursed to your account.`,
    actionUrl: `/client-portal/loan-details/${loanId}`,
  }),

  paymentDue: (loanId: string, amount: number, dueDate: string) => ({
    title: 'Payment Reminder',
    message: `Your loan payment of ${formatCurrency(amount)} is due on ${new Date(dueDate).toLocaleDateString()}.`,
    actionUrl: `/client-portal/loan-details/${loanId}`,
  }),

  paymentReceived: (loanId: string, amount: number) => ({
    title: 'Payment Received',
    message: `Thank you! We've received your payment of ${formatCurrency(amount)}.`,
    actionUrl: `/client-portal/loan-details/${loanId}`,
  }),

  paymentOverdue: (loanId: string, amount: number, days: number) => ({
    title: 'Payment Overdue',
    message: `Your loan payment of ${formatCurrency(amount)} is ${days} day(s) overdue. Please make a payment as soon as possible.`,
    actionUrl: `/client-portal/loan-details/${loanId}`,
  }),

  // KYC templates
  kycSubmitted: (docType: string) => ({
    title: 'KYC Document Submitted',
    message: `Your ${formatDocType(docType)} has been submitted for review.`,
    actionUrl: '/client-portal/profile?tab=kyc',
  }),

  kycApproved: (docType: string) => ({
    title: 'KYC Document Approved',
    message: `Your ${formatDocType(docType)} has been verified successfully.`,
    actionUrl: '/client-portal/profile?tab=kyc',
  }),

  kycRejected: (docType: string, reason: string) => ({
    title: 'KYC Document Rejected',
    message: `Your ${formatDocType(docType)} was rejected. Reason: ${reason}. Please resubmit with corrections.`,
    actionUrl: '/client-portal/profile?tab=kyc',
  }),

  // Account templates
  depositReceived: (amount: number, accountId: string) => ({
    title: 'Deposit Received',
    message: `Your deposit of ${formatCurrency(amount)} has been processed successfully.`,
    actionUrl: `/client-portal/savings/${accountId}`,
  }),

  withdrawalProcessed: (amount: number, accountId: string) => ({
    title: 'Withdrawal Processed',
    message: `Your withdrawal of ${formatCurrency(amount)} has been processed.`,
    actionUrl: `/client-portal/savings/${accountId}`,
  }),

  // Admin templates
  pendingLoanApproval: (clientName: string, amount: number, loanId: string) => ({
    title: 'New Loan Application',
    message: `${clientName} has applied for a loan of ${formatCurrency(amount)}.`,
    actionUrl: `/loans/${loanId}`,
  }),

  pendingKycReview: (clientName: string, docType: string, clientId: string) => ({
    title: 'KYC Document Pending Review',
    message: `${clientName} has submitted ${formatDocType(docType)} for verification.`,
    actionUrl: `/users/${clientId}`,
  }),

  loanOverdueAlert: (clientName: string, amount: number, days: number, loanId: string) => ({
    title: 'Loan Overdue Alert',
    message: `${clientName}'s loan payment of ${formatCurrency(amount)} is ${days} day(s) overdue.`,
    actionUrl: `/loans/${loanId}`,
  }),

  // --- Member lifecycle templates ---------------------------------------
  memberWelcome: (memberName: string, institutionName?: string) => ({
    title: `Welcome${memberName ? ', ' + memberName.split(' ')[0] : ''}!`,
    message: institutionName
      ? `Your membership at ${institutionName} has been created. Explore your portal to manage savings, loans, and your KYC.`
      : `Your membership has been created. Explore your portal to manage savings, loans, and your KYC.`,
    actionUrl: '/client-portal',
  }),

  membershipInvoiceCreated: (
    invoiceNumber: string,
    amount: number,
    invoiceId?: string,
    dueDate?: string | null,
  ) => ({
    title: `New Invoice ${invoiceNumber}`,
    message: dueDate
      ? `A membership fee invoice of ${formatCurrency(amount)} has been issued (due ${new Date(dueDate).toLocaleDateString()}). Please review and settle.`
      : `A membership fee invoice of ${formatCurrency(amount)} has been issued. Please review and settle it from your portal.`,
    actionUrl: invoiceId
      ? `/client-portal/invoices?invoice_id=${invoiceId}`
      : '/client-portal/invoices',
  }),

  kycVerificationRequired: () => ({
    title: 'Verify your KYC',
    message:
      'To activate all account features, please upload your KYC documents (national ID, passport photo, etc.) for verification.',
    actionUrl: '/client-portal/profile?tab=kyc',
  }),

  // --- Staff/admin templates --------------------------------------------
  newMemberRegistered: (memberName: string, memberNumber: string, memberId: string) => ({
    title: 'New Member Registered',
    message: `${memberName} (${memberNumber}) has been added to the institution.`,
    actionUrl: `/users/${memberId}`,
  }),

  newInvoiceCreatedForStaff: (
    invoiceNumber: string,
    memberName: string,
    amount: number,
    invoiceId: string,
  ) => ({
    title: `Invoice ${invoiceNumber} Created`,
    message: `A new invoice of ${formatCurrency(amount)} was issued to ${memberName}.`,
    actionUrl: `/invoices?invoice_id=${invoiceId}`,
  }),

  // --- Shares templates -------------------------------------------------
  sharesPurchased: (
    numberOfShares: number,
    totalValue: number,
    invoiceNumber?: string | null,
    currency?: string,
  ) => ({
    title: 'Shares Purchased',
    message: invoiceNumber
      ? `You purchased ${numberOfShares} share(s) worth ${formatCurrency(totalValue, currency)}. Invoice ${invoiceNumber} has been issued.`
      : `You purchased ${numberOfShares} share(s) worth ${formatCurrency(totalValue, currency)}.`,
    actionUrl: '/client-portal/shares',
  }),

  sharesPurchasedForStaff: (
    memberName: string,
    numberOfShares: number,
    totalValue: number,
    memberId: string,
    currency?: string,
  ) => ({
    title: 'Shares Purchased',
    message: `${memberName} purchased ${numberOfShares} share(s) worth ${formatCurrency(totalValue, currency)}.`,
    actionUrl: `/members/${memberId}`,
  }),

  // --- Generic transaction templates ------------------------------------
  transactionRecorded: (
    amount: number,
    transactionNumber?: string | null,
    currency?: string,
  ) => ({
    title: 'Transaction Recorded',
    message: transactionNumber
      ? `A transaction of ${formatCurrency(amount, currency)} (${transactionNumber}) has been recorded on your account.`
      : `A transaction of ${formatCurrency(amount, currency)} has been recorded on your account.`,
    actionUrl: '/client-portal/transactions',
  }),

  transactionRecordedForStaff: (
    memberName: string,
    amount: number,
    transactionNumber: string,
    memberId: string,
    currency?: string,
  ) => ({
    title: 'Transaction Recorded',
    message: `A transaction of ${formatCurrency(amount, currency)} (${transactionNumber}) was recorded for ${memberName}.`,
    actionUrl: `/members/${memberId}`,
  }),

  // --- Generic invoice templates ----------------------------------------
  invoiceCreated: (
    invoiceNumber: string,
    amount: number,
    invoiceId?: string,
    currency?: string,
  ) => ({
    title: `New Invoice ${invoiceNumber}`,
    message: `An invoice of ${formatCurrency(amount, currency)} has been issued.`,
    actionUrl: '/client-portal',
  }),

  invoiceCreatedForStaff: (
    invoiceNumber: string,
    memberName: string,
    amount: number,
    invoiceId: string,
    currency?: string,
  ) => ({
    title: `Invoice ${invoiceNumber} Created`,
    message: `An invoice of ${formatCurrency(amount, currency)} was issued to ${memberName}.`,
    actionUrl: `/invoices?invoice_id=${invoiceId}`,
  }),
}

// Helper functions
function formatCurrency(amount: number, currency = 'UGX'): string {
  const code = currency && currency.trim() ? currency.trim() : 'UGX'
  try {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
    }).format(Number(amount) || 0)
  } catch {
    return `${code} ${(Number(amount) || 0).toLocaleString()}`
  }
}

function formatDocType(docType: string): string {
  return docType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}
