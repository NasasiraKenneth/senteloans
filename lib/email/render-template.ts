import { formatCurrency } from "@/lib/format-currency"
import type { RenderedEmail } from "./types"

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

const layout = (title: string, bodyHtml: string, institutionName: string): RenderedEmail => {
  const html = `<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;color:#111;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
  <p style="color:#f08c2b;font-weight:600;margin:0 0 8px">${esc(institutionName)}</p>
  <h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>
  ${bodyHtml}
  <p style="margin-top:24px;font-size:12px;color:#666">This is an automated message from ${esc(institutionName)}.</p>
</body></html>`
  const text = `${institutionName}\n\n${title}\n\n${bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}`
  return { html, text }
}

type TemplateData = Record<string, unknown>

export function renderEmailTemplate(template: string, data: TemplateData = {}): RenderedEmail {
  const institutionName = String(data.institutionName || "Your institution")
  const memberName = String(data.memberName || "Member")
  const memberNumber = String(data.memberNumber || "")
  const currency = String(data.currency || "UGX")

  switch (template) {
    case "member.welcome": {
      const accountType = data.accountType ? String(data.accountType) : null
      const accountNumber = data.accountNumber ? String(data.accountNumber) : null
      const savingsDetails =
        accountType || accountNumber
          ? `<p>Your savings account details:</p>
             ${accountType ? `<p>Account type: <strong>${esc(accountType)}</strong></p>` : ""}
             ${accountNumber ? `<p>Account number: <strong>${esc(accountNumber)}</strong></p>` : ""}`
          : ""
      return layout(
        "Welcome",
        `<p>Hello ${esc(memberName)},</p>
         <p>Your membership at <strong>${esc(institutionName)}</strong> is now active.</p>
         <p>Member number: <strong>${esc(memberNumber)}</strong></p>
         ${savingsDetails}
         <p>Please complete your KYC verification when prompted.</p>`,
        institutionName,
      )
    }

    case "member.kyc_required":
      return layout(
        "KYC verification required",
        `<p>Hello ${esc(memberName)},</p>
         <p>Please upload or update your KYC documents so we can verify your identity.</p>
         <p>Member number: <strong>${esc(memberNumber)}</strong></p>`,
        institutionName,
      )

    case "kyc.submitted": {
      const docTypeLabel = String(data.docTypeLabel || data.docType || "document")
      return layout(
        "KYC document submitted",
        `<p>Hello ${esc(memberName)},</p>
         <p>Your <strong>${esc(docTypeLabel)}</strong> has been submitted for review.</p>
         <p>We will notify you once the verification is complete.</p>
         <p>Member number: <strong>${esc(memberNumber)}</strong></p>`,
        institutionName,
      )
    }

    case "kyc.uploaded": {
      const docTypeLabel = String(data.docTypeLabel || data.docType || "document")
      return layout(
        "KYC document submitted",
        `<p>Hello ${esc(memberName)},</p>
         <p>Your <strong>${esc(docTypeLabel)}</strong> has been submitted successfully.</p>
         <p>Member number: <strong>${esc(memberNumber)}</strong></p>`,
        institutionName,
      )
    }

    case "kyc.approved": {
      const docTypeLabel = String(data.docTypeLabel || data.docType || "document")
      return layout(
        "KYC document approved",
        `<p>Hello ${esc(memberName)},</p>
         <p>Your <strong>${esc(docTypeLabel)}</strong> has been verified successfully.</p>
         <p>Member number: <strong>${esc(memberNumber)}</strong></p>`,
        institutionName,
      )
    }

    case "kyc.rejected": {
      const docTypeLabel = String(data.docTypeLabel || data.docType || "document")
      const reason = String(data.reason || "Document did not meet requirements")
      return layout(
        "KYC document rejected",
        `<p>Hello ${esc(memberName)},</p>
         <p>Your <strong>${esc(docTypeLabel)}</strong> was not approved.</p>
         <p>Reason: <strong>${esc(reason)}</strong></p>
         <p>Please sign in to your portal and resubmit the document with corrections.</p>
         <p>Member number: <strong>${esc(memberNumber)}</strong></p>`,
        institutionName,
      )
    }

    case "member.invoice": {
      const amount = Number(data.amount || 0)
      const invoiceNumber = String(data.invoiceNumber || "")
      const dueDate = data.dueDate ? String(data.dueDate) : null
      return layout(
        "Membership fee invoice",
        `<p>Hello ${esc(memberName)},</p>
         <p>Invoice <strong>${esc(invoiceNumber)}</strong> has been issued for your annual membership fee.</p>
         <p>Amount due: <strong>${esc(formatCurrency(amount, currency))}</strong></p>
         ${dueDate ? `<p>Due date: <strong>${esc(dueDate)}</strong></p>` : ""}`,
        institutionName,
      )
    }

    case "invoice.sent": {
      const amount = Number(data.amount || 0)
      const invoiceNumber = String(data.invoiceNumber || "")
      const dueDate = data.dueDate ? String(data.dueDate) : null
      return layout(
        "Invoice issued",
        `<p>Hello ${esc(memberName)},</p>
         <p>Invoice <strong>${esc(invoiceNumber)}</strong> has been issued to your account.</p>
         <p>Amount due: <strong>${esc(formatCurrency(amount, currency))}</strong></p>
         ${dueDate ? `<p>Due date: <strong>${esc(dueDate)}</strong></p>` : ""}
         <p>Your invoice is attached to this email as a PDF.</p>`,
        institutionName,
      )
    }

    case "membership_fee.paid": {
      const amount = Number(data.amount || 0)
      const remaining = Number(data.remaining || 0)
      const invoiceNumber = data.invoiceNumber ? String(data.invoiceNumber) : null
      const transactionNumber = data.transactionNumber ? String(data.transactionNumber) : null
      return layout(
        "Membership fee payment received",
        `<p>Hello ${esc(memberName)},</p>
         <p>We received your membership fee payment of <strong>${esc(formatCurrency(amount, currency))}</strong>.</p>
         ${remaining > 0 ? `<p>Outstanding balance: <strong>${esc(formatCurrency(remaining, currency))}</strong></p>` : "<p>Your membership fee is fully paid. Thank you.</p>"}
         ${invoiceNumber ? `<p>Invoice: <strong>${esc(invoiceNumber)}</strong></p>` : ""}
         ${transactionNumber ? `<p>Receipt no.: <strong>${esc(transactionNumber)}</strong></p>` : ""}
         <p>Your payment receipt is attached to this email as a PDF.</p>`,
        institutionName,
      )
    }

    case "invoice.payment_recorded": {
      const amount = Number(data.amount || 0)
      const outstanding = Number(data.outstanding || 0)
      const fullySettled = Boolean(data.fullySettled)
      const invoiceNumber = data.invoiceNumber ? String(data.invoiceNumber) : null
      const transactionNumber = data.transactionNumber ? String(data.transactionNumber) : null
      return layout(
        "Invoice payment received",
        `<p>Hello ${esc(memberName)},</p>
         <p>We received your payment of <strong>${esc(formatCurrency(amount, currency))}</strong>${invoiceNumber ? ` for invoice <strong>${esc(invoiceNumber)}</strong>` : ""}.</p>
         ${fullySettled ? "<p>Your invoice is now fully paid. Thank you.</p>" : `<p>Outstanding balance: <strong>${esc(formatCurrency(outstanding, currency))}</strong></p>`}
         ${transactionNumber ? `<p>Receipt no.: <strong>${esc(transactionNumber)}</strong></p>` : ""}
         <p>Your payment receipt is attached to this email as a PDF.</p>`,
        institutionName,
      )
    }

    case "shares.purchased": {
      const shares = Number(data.numberOfShares || 0)
      const amount = Number(data.amount || 0)
      const invoiceNumber = data.invoiceNumber ? String(data.invoiceNumber) : null
      const transactionNumber = data.transactionNumber ? String(data.transactionNumber) : null
      return layout(
        "Share purchase confirmation",
        `<p>Hello ${esc(memberName)},</p>
         <p>Your purchase of <strong>${esc(shares)}</strong> share(s) totalling <strong>${esc(formatCurrency(amount, currency))}</strong> has been recorded.</p>
         ${invoiceNumber ? `<p>Invoice: <strong>${esc(invoiceNumber)}</strong></p>` : ""}
         ${transactionNumber ? `<p>Receipt no.: <strong>${esc(transactionNumber)}</strong></p>` : ""}
         <p>Your invoice and payment receipt are attached to this email as PDFs.</p>`,
        institutionName,
      )
    }

    case "savings.deposit":
    case "savings.withdrawal":
    case "savings.transfer":
    case "savings.transfer_deposit": {
      const amount = Number(data.amount || 0)
      const balanceAfter = Number(data.balanceAfter ?? data.balance_after ?? 0)
      const accountNumber = data.accountNumber ? String(data.accountNumber) : null
      const sourceAccountNumber = data.sourceAccountNumber ? String(data.sourceAccountNumber) : null
      const transactionNumber = data.transactionNumber ? String(data.transactionNumber) : null
      const transactionDate = data.transactionDate ? String(data.transactionDate) : null
      const mode = data.mode ? String(data.mode) : null
      const charges = data.charges != null ? Number(data.charges) : null
      const transactionType = String(data.transactionType || template.split(".")[1] || "transaction")
      const isTransferDeposit = template === "savings.transfer_deposit"
      const typeLabel = isTransferDeposit
        ? "Transfer deposit"
        : transactionType === "deposit"
          ? "Deposit"
          : transactionType === "withdrawal"
            ? "Withdrawal"
            : "Transfer"
      const title = isTransferDeposit ? "Transfer deposit received" : `${typeLabel} confirmation`
      const intro = isTransferDeposit
        ? `A transfer deposit of <strong>${esc(formatCurrency(amount, currency))}</strong>${accountNumber ? ` was credited to account <strong>${esc(accountNumber)}</strong>` : " was credited to your account"}${sourceAccountNumber ? ` from account <strong>${esc(sourceAccountNumber)}</strong>` : ""}.`
        : `Your ${esc(typeLabel.toLowerCase())} of <strong>${esc(formatCurrency(amount, currency))}</strong>${accountNumber ? ` on account <strong>${esc(accountNumber)}</strong>` : ""} has been processed.`
      return layout(
        title,
        `<p>Hello ${esc(memberName)},</p>
         <p>${intro}</p>
         ${mode ? `<p>Payment method: <strong>${esc(mode)}</strong></p>` : ""}
         ${transactionDate ? `<p>Transaction date: <strong>${esc(transactionDate)}</strong></p>` : ""}
         <p>Available balance: <strong>${esc(formatCurrency(balanceAfter, currency))}</strong></p>
         ${charges != null && charges > 0 ? `<p>Transaction charges: <strong>${esc(formatCurrency(charges, currency))}</strong></p>` : ""}
         ${transactionNumber ? `<p>Receipt no.: <strong>${esc(transactionNumber)}</strong></p>` : ""}
         <p>Your transaction receipt is attached to this email as a PDF.</p>`,
        institutionName,
      )
    }

    case "loan.payment_received": {
      const amount = Number(data.amount || 0)
      const balanceAfter = Number(data.balanceAfter ?? data.balance_after ?? 0)
      const applicationId = String(data.applicationId || "")
      const paymentDate = data.paymentDate ? String(data.paymentDate) : null
      const transactionNumber = data.transactionNumber ? String(data.transactionNumber) : null
      return layout(
        "Loan payment received",
        `<p>Hello ${esc(memberName)},</p>
         <p>Thank you — we received your loan payment of <strong>${esc(formatCurrency(amount, currency))}</strong>${applicationId ? ` for loan <strong>${esc(applicationId)}</strong>` : ""}.</p>
         ${paymentDate ? `<p>Payment date: <strong>${esc(paymentDate)}</strong></p>` : ""}
         <p>Outstanding balance: <strong>${esc(formatCurrency(balanceAfter, currency))}</strong></p>
         ${transactionNumber ? `<p>Receipt no.: <strong>${esc(transactionNumber)}</strong></p>` : ""}
         <p>Your payment receipt is attached to this email as a PDF.</p>`,
        institutionName,
      )
    }

    case "loan.application_submitted": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      const loanType = String(data.loanType || "Normal")
      const productName = data.productName ? String(data.productName) : null
      return layout(
        "Loan application submitted",
        `<p>Hello ${esc(memberName)},</p>
         <p>Your loan application <strong>${esc(applicationId)}</strong> has been submitted successfully.</p>
         <p>Amount requested: <strong>${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))}</strong></p>
         <p>Loan type: <strong>${esc(loanType)}</strong></p>
         ${productName ? `<p>Product: <strong>${esc(productName)}</strong></p>` : ""}
         <p>We will notify you when your application is reviewed.</p>
         <p>Member number: <strong>${esc(memberNumber)}</strong></p>`,
        institutionName,
      )
    }

    case "loan.pending_approval": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      const loanType = String(data.loanType || "Normal")
      const productName = data.productName ? String(data.productName) : null
      const staffName = String(data.staffName || "Team member")
      return layout(
        "New loan application",
        `<p>Hello ${esc(staffName)},</p>
         <p><strong>${esc(memberName)}</strong> (${esc(memberNumber)}) has submitted a new loan application.</p>
         <p>Application ID: <strong>${esc(applicationId)}</strong></p>
         <p>Amount requested: <strong>${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))}</strong></p>
         <p>Loan type: <strong>${esc(loanType)}</strong></p>
         ${productName ? `<p>Product: <strong>${esc(productName)}</strong></p>` : ""}
         <p>Please sign in to review the application.</p>`,
        institutionName,
      )
    }

    case "loan.under_review": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      return layout(
        "Loan under review",
        `<p>Hello ${esc(memberName)},</p>
         <p>Your loan application <strong>${esc(applicationId)}</strong> is under review.</p>
         <p>Amount requested: <strong>${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))}</strong></p>
         <p>We will notify you when a decision is made.</p>
         <p>Member number: <strong>${esc(memberNumber)}</strong></p>`,
        institutionName,
      )
    }

    case "loan.reviewed": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      return layout(
        "Loan review complete",
        `<p>Hello ${esc(memberName)},</p>
         <p>Your loan application <strong>${esc(applicationId)}</strong> has been reviewed.</p>
         <p>Amount: <strong>${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))}</strong></p>
         <p>We will notify you when a final decision is made.</p>`,
        institutionName,
      )
    }

    case "loan.status_change": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      const statusLabel = String(data.statusLabel || "updated")
      return layout(
        "Loan status update",
        `<p>Hello ${esc(memberName)},</p>
         <p>Your loan application <strong>${esc(applicationId)}</strong> status is now <strong>${esc(statusLabel)}</strong>.</p>
         <p>Amount: <strong>${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))}</strong></p>
         <p>Sign in to your portal for details.</p>
         <p>Member number: <strong>${esc(memberNumber)}</strong></p>`,
        institutionName,
      )
    }

    case "loan.approved": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      return layout(
        "Loan application approved",
        `<p>Hello ${esc(memberName)},</p>
         <p>Your loan application <strong>${esc(applicationId)}</strong> has been approved.</p>
         <p>Approved amount: <strong>${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))}</strong></p>
         <p>We will notify you when disbursement is processed.</p>`,
        institutionName,
      )
    }

    case "loan.rejected": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      return layout(
        "Loan application update",
        `<p>Hello ${esc(memberName)},</p>
         <p>Your loan application <strong>${esc(applicationId)}</strong> was not approved.</p>
         <p>Amount requested: <strong>${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))}</strong></p>
         <p>Contact your branch for more information.</p>`,
        institutionName,
      )
    }

    case "loan.partially_disbursed": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      return layout(
        "Loan partially disbursed",
        `<p>Hello ${esc(memberName)},</p>
         <p>A partial disbursement has been made on your loan <strong>${esc(applicationId)}</strong>.</p>
         <p>Amount: <strong>${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))}</strong></p>
         <p>Sign in to your portal for disbursement details.</p>`,
        institutionName,
      )
    }

    case "loan.disbursed": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      return layout(
        "Loan fully disbursed",
        `<p>Hello ${esc(memberName)},</p>
         <p>Your loan <strong>${esc(applicationId)}</strong> has been fully disbursed.</p>
         <p>Disbursed amount: <strong>${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))}</strong></p>
         <p>Thank you for banking with ${esc(institutionName)}.</p>`,
        institutionName,
      )
    }

    case "loan.ready_for_approval": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      const staffName = String(data.staffName || "Team member")
      return layout(
        "Loan ready for approval",
        `<p>Hello ${esc(staffName)},</p>
         <p><strong>${esc(memberName)}</strong> (${esc(memberNumber)}) — application <strong>${esc(applicationId)}</strong> has been reviewed.</p>
         <p>Amount: <strong>${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))}</strong></p>
         <p>Please sign in to approve or reject the loan.</p>`,
        institutionName,
      )
    }

    case "loan.under_review_staff": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      const staffName = String(data.staffName || "Team member")
      return layout(
        "Loan under review",
        `<p>Hello ${esc(staffName)},</p>
         <p><strong>${esc(memberName)}</strong> (${esc(memberNumber)}) — application <strong>${esc(applicationId)}</strong> is under review.</p>
         <p>Amount: <strong>${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))}</strong></p>`,
        institutionName,
      )
    }

    case "loan.approved_staff": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      const staffName = String(data.staffName || "Team member")
      return layout(
        "Loan approved",
        `<p>Hello ${esc(staffName)},</p>
         <p><strong>${esc(memberName)}</strong>'s loan (<strong>${esc(applicationId)}</strong>) for ${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))} has been approved.</p>`,
        institutionName,
      )
    }

    case "loan.rejected_staff": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      const staffName = String(data.staffName || "Team member")
      return layout(
        "Loan rejected",
        `<p>Hello ${esc(staffName)},</p>
         <p><strong>${esc(memberName)}</strong>'s loan application (<strong>${esc(applicationId)}</strong>) for ${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))} was rejected.</p>`,
        institutionName,
      )
    }

    case "loan.partially_disbursed_staff": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      const staffName = String(data.staffName || "Team member")
      return layout(
        "Loan partially disbursed",
        `<p>Hello ${esc(staffName)},</p>
         <p><strong>${esc(memberName)}</strong>'s loan (<strong>${esc(applicationId)}</strong>) has been partially disbursed (${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))}).</p>`,
        institutionName,
      )
    }

    case "loan.fully_disbursed_staff": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      const staffName = String(data.staffName || "Team member")
      return layout(
        "Loan fully disbursed",
        `<p>Hello ${esc(staffName)},</p>
         <p><strong>${esc(memberName)}</strong>'s loan (<strong>${esc(applicationId)}</strong>) for ${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))} has been fully disbursed.</p>`,
        institutionName,
      )
    }

    case "opening_balance.recorded": {
      const savingsAccounts = Array.isArray(data.savingsAccounts)
        ? data.savingsAccounts
            .map((raw) => {
              const row = (raw ?? {}) as Record<string, unknown>
              const openingBalance = Number(row.openingBalance)
              if (!Number.isFinite(openingBalance) || openingBalance <= 0) return null
              return {
                accountNumber: String(row.accountNumber || "").trim(),
                accountType: String(row.accountType || "").trim(),
                openingBalance,
              }
            })
            .filter(
              (row): row is { accountNumber: string; accountType: string; openingBalance: number } =>
                row != null,
            )
        : []

      const loanRaw = (data.loan ?? null) as Record<string, unknown> | null
      const loanOutstanding =
        loanRaw?.outstanding != null && Number.isFinite(Number(loanRaw.outstanding))
          ? Number(loanRaw.outstanding)
          : null

      const savingsHtml =
        savingsAccounts.length > 0
          ? `<p><strong>Savings opening balances</strong></p>
             <ul>${savingsAccounts
               .map((account) => {
                 const lines: string[] = []
                 if (account.accountNumber) {
                   lines.push(`Account no.: <strong>${esc(account.accountNumber)}</strong>`)
                 }
                 if (account.accountType) {
                   lines.push(`Account type: <strong>${esc(account.accountType)}</strong>`)
                 }
                 lines.push(
                   `Opening balance: <strong>${esc(formatCurrency(account.openingBalance, currency))}</strong>`,
                 )
                 return `<li>${lines.join("<br/>")}</li>`
               })
               .join("")}</ul>`
          : ""

      const loanLines: string[] = []
      if (loanRaw && loanOutstanding != null) {
        const applicationId = String(loanRaw.applicationId || "").trim()
        const productName = String(loanRaw.productName || "").trim()
        const principalAmount = Number(loanRaw.principalAmount)
        const amountPaid = Number(loanRaw.amountPaid)

        if (applicationId) {
          loanLines.push(`Loan application: <strong>${esc(applicationId)}</strong>`)
        }
        if (productName) {
          loanLines.push(`Loan product: <strong>${esc(productName)}</strong>`)
        }
        if (Number.isFinite(principalAmount) && principalAmount > 0) {
          loanLines.push(
            `Original principal: <strong>${esc(formatCurrency(principalAmount, currency))}</strong>`,
          )
        }
        if (Number.isFinite(amountPaid) && amountPaid > 0) {
          loanLines.push(`Amount paid: <strong>${esc(formatCurrency(amountPaid, currency))}</strong>`)
        }
        loanLines.push(
          `Outstanding balance: <strong>${esc(formatCurrency(loanOutstanding, currency))}</strong>`,
        )
      }

      const loanHtml =
        loanLines.length > 0
          ? `<p><strong>Loan opening balance</strong></p><ul><li>${loanLines.join("<br/>")}</li></ul>`
          : ""

      return layout(
        "Opening balances recorded",
        `<p>Hello ${esc(memberName)},</p>
         <p>Your opening balance migration has been recorded:</p>
         ${savingsHtml}
         ${loanHtml}`,
        institutionName,
      )
    }

    case "email.test":
      return layout(
        "Test email",
        `<p>This is a test message from <strong>${esc(institutionName)}</strong>.</p>
         <p>If you received this, branch email delivery is configured correctly.</p>`,
        institutionName,
      )

    default:
      return layout(
        "Notification",
        `<p>Hello ${esc(memberName)},</p><p>You have a new notification from ${esc(institutionName)}.</p>`,
        institutionName,
      )
  }
}
