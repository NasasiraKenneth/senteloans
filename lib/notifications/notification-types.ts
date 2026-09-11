// Notification types and templates for SenteLoans
// Phase 1: In-app notifications for core events

export type NotificationType =
  // Loan events
  | 'loan_status_change'
  | 'loan_under_review'
  | 'loan_reviewed'
  | 'loan_partially_disbursed'
  | 'loan_application_submitted'
  | 'loan_approved'
  | 'loan_rejected'
  | 'loan_disbursed'
  | 'loan_ready_for_approval'
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
  | 'transfer_processed'
  | 'profile_updated'
  | 'member_profile_updated'
  | 'configure_savings_account'
  // Admin events
  | 'pending_loan_approval'
  | 'pending_kyc_review'
  | 'loan_overdue_alert'
  | 'new_member_registered'
  // Member lifecycle events
  | 'member_welcome'
  | 'member_portal_access_enabled'
  | 'member_login_enabled'
  | 'membership_invoice_created'
  | 'kyc_verification_required'
  // Shares events
  | 'shares_purchased'
  | 'shares_transferred'
  | 'shares_sold'
  // Membership fee events
  | 'membership_fee_paid'
  // Opening balance (migration) events
  | 'opening_savings_recorded'
  | 'opening_loan_recorded'
  // Generic finance events
  | 'transaction_recorded'
  | 'invoice_created'
  | 'invoice_draft_created'
  | 'invoice_cancelled'
  | 'invoice_overdue'
  | 'invoice_payment_recorded'
  // Third-party agent events
  | 'third_party_agent_created'
  | 'third_party_agent_updated'
  // External / sacco loan events
  | 'sacco_loan_created'
  | 'sacco_loan_activated'
  | 'sacco_loan_payment_recorded'
  // Investment events
  | 'investment_created'
  | 'investment_development_started'
  | 'investment_cashflow_recorded'
  // Expense events
  | 'expense_created'
  | 'expense_updated'
  | 'expense_cashflow_payment_recorded'

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

function memberLoanDescription(applicationId: string, productName?: string | null): string {
  const product = productName?.trim()
  if (product) {
    return `${product} application (${applicationId})`
  }
  return `loan application (${applicationId})`
}

function staffLoanDescription(
  memberName: string,
  applicationId: string,
  productName?: string | null,
): string {
  const product = productName?.trim()
  if (product) {
    return `${memberName}'s ${product} application (${applicationId})`
  }
  return `${memberName}'s loan application (${applicationId})`
}

export const NotificationTemplates = {
  // Loan templates
  loanApplicationSubmitted: (
    loanId: string,
    amount: number,
    applicationId: string,
    productName?: string | null,
  ) => ({
    title: 'Loan Application Submitted',
    message: `Your ${memberLoanDescription(applicationId, productName)} for ${formatCurrency(amount)} has been submitted successfully.`,
    actionUrl: `/client-portal/loan-details/${loanId}`,
  }),

  loanApproved: (
    loanId: string,
    amount: number,
    applicationId: string,
    productName?: string | null,
  ) => ({
    title: 'Loan Application Approved',
    message: `Great news! Your ${memberLoanDescription(applicationId, productName)} for ${formatCurrency(amount)} has been approved.`,
    actionUrl: `/client-portal/loan-details/${loanId}`,
  }),

  loanRejected: (
    loanId: string,
    amount: number,
    applicationId: string,
    productName?: string | null,
    reason?: string,
  ) => ({
    title: 'Loan Application Status',
    message: reason
      ? `Your ${memberLoanDescription(applicationId, productName)} for ${formatCurrency(amount)} was not approved. Reason: ${reason}`
      : `Your ${memberLoanDescription(applicationId, productName)} for ${formatCurrency(amount)} was not approved.`,
    actionUrl: `/client-portal/loan-details/${loanId}`,
  }),

  loanDisbursed: (
    loanId: string,
    amount: number,
    applicationId: string,
    productName?: string | null,
  ) => ({
    title: 'Loan Fully Disbursed',
    message: `Your ${memberLoanDescription(applicationId, productName)} for ${formatCurrency(amount)} has been fully disbursed.`,
    actionUrl: `/client-portal/loan-details/${loanId}`,
  }),

  loanUnderReview: (
    loanId: string,
    amount: number,
    applicationId: string,
    productName?: string | null,
  ) => ({
    title: 'Loan Under Review',
    message: `Your ${memberLoanDescription(applicationId, productName)} for ${formatCurrency(amount)} is under review.`,
    actionUrl: `/client-portal/loan-details/${loanId}`,
  }),

  loanReviewed: (
    loanId: string,
    amount: number,
    applicationId: string,
    productName?: string | null,
  ) => ({
    title: 'Loan Review Complete',
    message: `Your ${memberLoanDescription(applicationId, productName)} for ${formatCurrency(amount)} has been reviewed.`,
    actionUrl: `/client-portal/loan-details/${loanId}`,
  }),

  loanPartiallyDisbursed: (
    loanId: string,
    amount: number,
    applicationId: string,
    productName?: string | null,
  ) => ({
    title: 'Loan Partially Disbursed',
    message: `A partial disbursement of ${formatCurrency(amount)} has been made on your ${memberLoanDescription(applicationId, productName)}.`,
    actionUrl: `/client-portal/loan-details/${loanId}`,
  }),

  loanStatusChange: (
    loanId: string,
    statusLabel: string,
    applicationId: string,
    productName?: string | null,
    amount?: number,
  ) => ({
    title: 'Loan Status Update',
    message: amount != null && amount > 0
      ? `Your ${memberLoanDescription(applicationId, productName)} for ${formatCurrency(amount)} is now ${statusLabel}.`
      : `Your ${memberLoanDescription(applicationId, productName)} is now ${statusLabel}.`,
    actionUrl: `/client-portal/loan-details/${loanId}`,
  }),

  loanReadyForApprovalStaff: (
    memberName: string,
    applicationId: string,
    amount: number,
    loanId: string,
    productName?: string | null,
  ) => ({
    title: 'Loan Ready for Approval',
    message: `${staffLoanDescription(memberName, applicationId, productName)} for ${formatCurrency(amount)} has been reviewed and is ready for approval.`,
    actionUrl: `/loans/${loanId}`,
  }),

  loanUnderReviewStaff: (
    memberName: string,
    applicationId: string,
    amount: number,
    loanId: string,
    productName?: string | null,
  ) => ({
    title: 'Loan Under Review',
    message: `${staffLoanDescription(memberName, applicationId, productName)} for ${formatCurrency(amount)} is under review.`,
    actionUrl: `/loans/${loanId}`,
  }),

  loanApprovedStaff: (
    memberName: string,
    applicationId: string,
    amount: number,
    loanId: string,
    productName?: string | null,
  ) => ({
    title: 'Loan Approved',
    message: `${staffLoanDescription(memberName, applicationId, productName)} for ${formatCurrency(amount)} has been approved.`,
    actionUrl: `/loans/${loanId}`,
  }),

  loanRejectedStaff: (
    memberName: string,
    applicationId: string,
    amount: number,
    loanId: string,
    productName?: string | null,
  ) => ({
    title: 'Loan Rejected',
    message: `${staffLoanDescription(memberName, applicationId, productName)} for ${formatCurrency(amount)} was rejected.`,
    actionUrl: `/loans/${loanId}`,
  }),

  loanPartiallyDisbursedStaff: (
    memberName: string,
    applicationId: string,
    amount: number,
    loanId: string,
    productName?: string | null,
  ) => ({
    title: 'Loan Partially Disbursed',
    message: `${staffLoanDescription(memberName, applicationId, productName)} has been partially disbursed (${formatCurrency(amount)}).`,
    actionUrl: `/loans/${loanId}`,
  }),

  loanFullyDisbursedStaff: (
    memberName: string,
    applicationId: string,
    amount: number,
    loanId: string,
    productName?: string | null,
  ) => ({
    title: 'Loan Fully Disbursed',
    message: `${staffLoanDescription(memberName, applicationId, productName)} for ${formatCurrency(amount)} has been fully disbursed.`,
    actionUrl: `/loans/${loanId}`,
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

  kycUploaded: (docType: string) => ({
    title: 'KYC Document Submitted',
    message: `Your ${formatDocType(docType)} has been submitted successfully.`,
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
  depositReceived: (amount: number, accountId?: string, currency?: string) => ({
    title: 'Deposit Received',
    message: `Your deposit of ${formatCurrency(amount, currency)} has been processed successfully.`,
    actionUrl: accountId ? `/client-portal/savings/${accountId}` : '/client-portal/savings',
  }),

  withdrawalProcessed: (amount: number, accountId?: string, currency?: string) => ({
    title: 'Withdrawal Processed',
    message: `Your withdrawal of ${formatCurrency(amount, currency)} has been processed.`,
    actionUrl: accountId ? `/client-portal/savings/${accountId}` : '/client-portal/savings',
  }),

  transferProcessed: (amount: number, accountId?: string, currency?: string) => ({
    title: 'Transfer Processed',
    message: `Your transfer of ${formatCurrency(amount, currency)} has been processed.`,
    actionUrl: accountId ? `/client-portal/savings/${accountId}` : '/client-portal/savings',
  }),

  profileUpdated: (institutionName?: string) => ({
    title: 'Profile Updated',
    message: institutionName
      ? `Your membership profile at ${institutionName} has been updated. Review your details in the portal.`
      : 'Your membership profile has been updated. Review your details in the portal.',
    actionUrl: '/client-portal/profile',
  }),

  memberProfileUpdatedForStaff: (
    memberName: string,
    memberNumber: string,
    memberId: string,
  ) => ({
    title: 'Member Profile Updated',
    message: `The profile for ${memberName} (${memberNumber}) was updated.`,
    actionUrl: `/members/${memberId}`,
  }),

  // Admin templates
  pendingLoanApproval: (
    clientName: string,
    amount: number,
    loanId: string,
    applicationId: string,
    productName?: string | null,
  ) => ({
    title: 'New Loan Application',
    message: `${staffLoanDescription(clientName, applicationId, productName)} for ${formatCurrency(amount)}.`,
    actionUrl: `/loans/${loanId}`,
  }),

  pendingKycReview: (clientName: string, docType: string, memberId: string) => ({
    title: 'KYC Document Pending Review',
    message: `${clientName} has submitted ${formatDocType(docType)} for verification.`,
    actionUrl: `/members/${memberId}`,
  }),

  kycReadyForReviewStaff: (
    memberName: string,
    memberNumber: string,
    docType: string,
    memberId: string,
  ) => ({
    title: 'KYC Documents Ready for Review',
    message: `${memberName} (${memberNumber}) has successfully uploaded KYC documents (${formatDocType(docType)}) and they are ready for review.`,
    actionUrl: `/members/${memberId}`,
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

  memberPortalAccessEnabled: (memberName: string, institutionName?: string) => ({
    title: `Welcome${memberName ? ', ' + memberName.split(' ')[0] : ''} — portal access ready`,
    message: institutionName
      ? `Your client portal login for ${institutionName} is ready. Sign in at /client-login with the email and temporary password we sent you, then change your password immediately.`
      : `Your client portal login is ready. Sign in at /client-login with the email and temporary password we sent you, then change your password immediately.`,
    actionUrl: '/client-portal',
  }),

  memberPortalPasswordReset: () => ({
    title: 'Portal password reset',
    message:
      'Your client portal password was reset. Sign in at /client-login with the temporary password we sent you, then change it immediately.',
    actionUrl: '/client-portal',
  }),

  memberLoginEnabledForStaff: (
    memberName: string,
    memberNumber: string,
    memberId: string,
    passwordReset?: boolean,
  ) => ({
    title: passwordReset ? 'Member Portal Password Reset' : 'Member Portal Login Enabled',
    message: passwordReset
      ? `Portal password was reset for ${memberName} (${memberNumber}).`
      : `Client portal login was enabled for ${memberName} (${memberNumber}).`,
    actionUrl: `/members/${memberId}`,
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

  configureSavingsAccountForStaff: (memberName: string, accountNumber: string, memberId: string) => ({
    title: 'Configure Savings Account',
    message: `Please configure the savings account (${accountNumber}) for new member ${memberName}.`,
    actionUrl: `/members/${memberId}/savings`,
  }),

  thirdPartyAgentCreatedForStaff: (agentName: string) => ({
    title: 'Third Party Agent Added',
    message: `${agentName} has been added as a Third Party Agent.`,
    actionUrl: '/third-party-agents',
  }),

  thirdPartyAgentUpdatedForStaff: (agentName: string) => ({
    title: 'Third Party Agent Updated',
    message: `${agentName}'s profile has been updated.`,
    actionUrl: '/third-party-agents',
  }),

  saccoLoanCreatedForStaff: (
    agentName: string,
    amount: number,
    loanId: string,
    productName?: string | null,
    currency?: string,
  ) => ({
    title: 'New External Loan',
    message: `${agentName}'s ${productName?.trim() || 'external loan'} for ${formatCurrency(amount, currency)} has been created.`,
    actionUrl: `/sacco-loans/${loanId}`,
  }),

  saccoLoanActivatedForStaff: (
    agentName: string,
    loanId: string,
    productName?: string | null,
    nextPaymentDate?: string | null,
  ) => ({
    title: 'External Loan Activated',
    message: `${agentName}'s ${productName?.trim() || 'external loan'} is now active${
      nextPaymentDate ? `; next payment due ${nextPaymentDate}` : ''
    }.`,
    actionUrl: `/sacco-loans/${loanId}`,
  }),

  saccoLoanPaymentRecordedForStaff: (
    agentName: string,
    amount: number,
    loanId: string,
    balanceAfter: number,
    productName?: string | null,
    isClosed?: boolean,
    currency?: string,
  ) => ({
    title: 'External Loan Payment Recorded',
    message: isClosed
      ? `${agentName}'s ${productName?.trim() || 'external loan'} payment of ${formatCurrency(amount, currency)} was recorded; the loan is now closed.`
      : `${agentName}'s ${productName?.trim() || 'external loan'} payment of ${formatCurrency(amount, currency)} was recorded; outstanding ${formatCurrency(balanceAfter, currency)}.`,
    actionUrl: `/sacco-loans/${loanId}`,
  }),

  investmentCreatedForStaff: (
    investmentName: string,
    amount: number,
    investmentId: string,
    investmentNumber?: string | null,
    currency?: string,
  ) => ({
    title: 'New Investment',
    message: `${investmentName}${
      investmentNumber ? ` (${investmentNumber})` : ''
    } for ${formatCurrency(amount, currency)} has been created.`,
    actionUrl: `/investments/${investmentId}`,
  }),

  investmentDevelopmentStartedForStaff: (
    investmentName: string,
    amount: number,
    investmentId: string,
    startDate: string,
    maturityDate?: string | null,
    currency?: string,
  ) => ({
    title: 'Investment Development Started',
    message: `${investmentName} development has started with a ${formatCurrency(amount, currency)} deposit on ${startDate}${
      maturityDate ? `; matures ${maturityDate}` : ''
    }.`,
    actionUrl: `/investments/${investmentId}`,
  }),

  investmentCashflowRecordedForStaff: (
    investmentName: string,
    type: string,
    category: string,
    amount: number,
    investmentId: string,
    closingValue: number,
    investmentNumber?: string | null,
    currency?: string,
  ) => {
    const suffix = investmentNumber ? ` (${investmentNumber})` : ''
    if (category === 'adjustment') {
      return {
        title: 'Investment Value Adjusted',
        message: `${investmentName}${suffix} value was adjusted to ${formatCurrency(closingValue, currency)}.`,
        actionUrl: `/investments/${investmentId}`,
      }
    }
    return {
      title: 'Investment Cashflow Recorded',
      message: `A ${category} ${type} of ${formatCurrency(amount, currency)} was recorded on ${investmentName}${suffix}; closing value ${formatCurrency(closingValue, currency)}.`,
      actionUrl: `/investments/${investmentId}`,
    }
  },

  expenseCreatedForStaff: (
    expenseName: string,
    expenseId: string,
    expenseNumber?: string | null,
    expenseType?: string | null,
  ) => {
    const suffix = expenseNumber ? ` (${expenseNumber})` : ''
    const typeLabel = expenseType?.trim()
      ? expenseType.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : null
    return {
      title: 'New Expense',
      message: typeLabel
        ? `${expenseName}${suffix} has been created as ${typeLabel}.`
        : `${expenseName}${suffix} has been created.`,
      actionUrl: `/expenses/${expenseId}`,
    }
  },

  expenseUpdatedForStaff: (
    expenseName: string,
    expenseId: string,
    expenseNumber?: string | null,
    expenseType?: string | null,
  ) => {
    const suffix = expenseNumber ? ` (${expenseNumber})` : ''
    const typeLabel = expenseType?.trim()
      ? expenseType.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : null
    return {
      title: 'Expense Updated',
      message: typeLabel
        ? `${expenseName}${suffix} was updated (${typeLabel}).`
        : `${expenseName}${suffix} was updated.`,
      actionUrl: `/expenses/${expenseId}`,
    }
  },

  expenseCashflowPaymentRecordedForStaff: (
    assigneeName: string,
    paymentAmount: number,
    expenseId: string,
    expenseName: string,
    expenseNumber: string | null | undefined,
    fullyPaid: boolean,
    outstanding: number,
    currency?: string,
  ) => {
    const suffix = expenseNumber ? ` (${expenseNumber})` : ''
    const label = expenseName?.trim() ? `${expenseName}${suffix}` : `expense${suffix}`
    return {
      title: fullyPaid ? 'Expense Cashflow Fully Paid' : 'Expense Cashflow Payment Recorded',
      message: fullyPaid
        ? `A payment of ${formatCurrency(paymentAmount, currency)} to ${assigneeName} fully settled the cashflow on ${label}.`
        : `A payment of ${formatCurrency(paymentAmount, currency)} to ${assigneeName} was recorded on ${label}; outstanding ${formatCurrency(outstanding, currency)}.`,
      actionUrl: `/expenses/${expenseId}`,
    }
  },

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

  sharesTransferred: (
    numberOfShares: number,
    totalValue: number,
    recipientName: string,
    currency?: string,
  ) => ({
    title: 'Shares Transferred',
    message: `You transferred ${numberOfShares} share(s) worth ${formatCurrency(totalValue, currency)} to ${recipientName}.`,
    actionUrl: '/client-portal/shares',
  }),

  sharesTransferReceived: (
    numberOfShares: number,
    totalValue: number,
    senderName: string,
    currency?: string,
  ) => ({
    title: 'Shares Received',
    message: `You received ${numberOfShares} share(s) worth ${formatCurrency(totalValue, currency)} from ${senderName}.`,
    actionUrl: '/client-portal/shares',
  }),

  sharesTransferredForStaff: (
    senderName: string,
    recipientName: string,
    numberOfShares: number,
    totalValue: number,
    memberId: string,
    currency?: string,
  ) => ({
    title: 'Shares Transfer Recorded',
    message: `${senderName} transferred ${numberOfShares} share(s) worth ${formatCurrency(totalValue, currency)} to ${recipientName}.`,
    actionUrl: `/members/${memberId}`,
  }),

  sharesSold: (
    numberOfShares: number,
    totalValue: number,
    buyerName: string,
    currency?: string,
  ) => ({
    title: 'Shares Sold',
    message: `You sold ${numberOfShares} share(s) worth ${formatCurrency(totalValue, currency)} to ${buyerName}. Proceeds have been credited to your savings account.`,
    actionUrl: '/client-portal/shares',
  }),

  sharesBuyOff: (
    numberOfShares: number,
    totalValue: number,
    sellerName: string,
    currency?: string,
  ) => ({
    title: 'Shares Purchased',
    message: `You purchased ${numberOfShares} share(s) worth ${formatCurrency(totalValue, currency)} from ${sellerName}.`,
    actionUrl: '/client-portal/shares',
  }),

  sharesBuyOffForStaff: (
    buyerName: string,
    sellerName: string,
    numberOfShares: number,
    totalValue: number,
    memberId: string,
    currency?: string,
  ) => ({
    title: 'Shares Buy off Recorded',
    message: `${buyerName} purchased ${numberOfShares} share(s) worth ${formatCurrency(totalValue, currency)} from ${sellerName}.`,
    actionUrl: `/members/${memberId}`,
  }),

  // --- Membership fee templates -----------------------------------------
  membershipFeePaid: (
    amount: number,
    remaining: number,
    currency?: string,
  ) => ({
    title: 'Membership Fee Payment Received',
    message: remaining > 0
      ? `We've received your membership fee payment of ${formatCurrency(amount, currency)}. Outstanding balance: ${formatCurrency(remaining, currency)}.`
      : `We've received your membership fee payment of ${formatCurrency(amount, currency)}. Your membership fee is now fully paid.`,
    actionUrl: '/client-portal/transactions',
  }),

  membershipFeePaidForStaff: (
    memberName: string,
    amount: number,
    memberId: string,
    currency?: string,
  ) => ({
    title: 'Membership Fee Payment Received',
    message: `${memberName} paid a membership fee of ${formatCurrency(amount, currency)}.`,
    actionUrl: `/members/${memberId}`,
  }),

  // --- Opening balance (migration) templates ----------------------------
  openingSavingsRecorded: (amount: number, currency?: string) => ({
    title: 'Opening Savings Balance Recorded',
    message: `An opening savings balance of ${formatCurrency(amount, currency)} has been recorded on your account from your previous records.`,
    actionUrl: '/client-portal/savings',
  }),

  openingSavingsRecordedForStaff: (
    memberName: string,
    amount: number,
    memberId: string,
    currency?: string,
  ) => ({
    title: 'Opening Savings Balance Recorded',
    message: `An opening savings balance of ${formatCurrency(amount, currency)} was recorded for ${memberName}.`,
    actionUrl: `/members/${memberId}`,
  }),

  openingLoanRecorded: (outstanding: number, currency?: string) => ({
    title: 'Opening Loan Balance Recorded',
    message: `An opening loan with an outstanding balance of ${formatCurrency(outstanding, currency)} has been recorded on your account from your previous records.`,
    actionUrl: '/client-portal/loans',
  }),

  openingLoanRecordedForStaff: (
    memberName: string,
    outstanding: number,
    memberId: string,
    currency?: string,
  ) => ({
    title: 'Opening Loan Balance Recorded',
    message: `An opening loan with an outstanding balance of ${formatCurrency(outstanding, currency)} was recorded for ${memberName}.`,
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

  invoiceDraftCreatedForStaff: (
    invoiceNumber: string,
    recipientName: string,
    amount: number,
    invoiceId: string,
    currency?: string,
  ) => ({
    title: `Draft Invoice ${invoiceNumber}`,
    message: `A draft invoice of ${formatCurrency(amount, currency)} for ${recipientName} was created.`,
    actionUrl: `/invoices?invoice_id=${invoiceId}`,
  }),

  invoiceCancelled: (invoiceNumber: string, invoiceId?: string) => ({
    title: `Invoice ${invoiceNumber} Cancelled`,
    message: `Invoice ${invoiceNumber} has been cancelled.`,
    actionUrl: invoiceId
      ? `/client-portal/invoices?invoice_id=${invoiceId}`
      : "/client-portal/invoices",
  }),

  invoiceCancelledForStaff: (
    invoiceNumber: string,
    recipientName: string,
    invoiceId: string,
  ) => ({
    title: `Invoice ${invoiceNumber} Cancelled`,
    message: `Invoice ${invoiceNumber} for ${recipientName} has been cancelled.`,
    actionUrl: `/invoices?invoice_id=${invoiceId}`,
  }),

  invoiceOverdue: (invoiceNumber: string, invoiceId?: string) => ({
    title: `Invoice ${invoiceNumber} Overdue`,
    message: `Invoice ${invoiceNumber} is overdue.`,
    actionUrl: invoiceId
      ? `/client-portal/invoices?invoice_id=${invoiceId}`
      : "/client-portal/invoices",
  }),

  invoiceOverdueForStaff: (
    invoiceNumber: string,
    recipientName: string,
    invoiceId: string,
  ) => ({
    title: `Invoice ${invoiceNumber} Overdue`,
    message: `Invoice ${invoiceNumber} for ${recipientName} is overdue.`,
    actionUrl: `/invoices?invoice_id=${invoiceId}`,
  }),

  invoicePaymentRecorded: (
    invoiceNumber: string,
    amount: number,
    fullySettled: boolean,
    currency?: string,
  ) => ({
    title: `Payment Applied to Invoice ${invoiceNumber}`,
    message: fullySettled
      ? `A payment of ${formatCurrency(amount, currency)} was applied to invoice ${invoiceNumber}, which is now fully settled.`
      : `A payment of ${formatCurrency(amount, currency)} was applied to invoice ${invoiceNumber}.`,
    actionUrl: '/client-portal/invoices',
  }),

  invoicePaymentRecordedForStaff: (
    invoiceNumber: string,
    memberName: string,
    amount: number,
    invoiceId: string,
    fullySettled: boolean,
    currency?: string,
  ) => ({
    title: `Payment Applied to Invoice ${invoiceNumber}`,
    message: fullySettled
      ? `A payment of ${formatCurrency(amount, currency)} from ${memberName} settled invoice ${invoiceNumber}.`
      : `A payment of ${formatCurrency(amount, currency)} from ${memberName} was applied to invoice ${invoiceNumber}.`,
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
