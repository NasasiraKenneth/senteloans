import { formatCurrency } from "@/lib/format-currency"
import { isUsableInstitutionLogo } from "@/lib/institution-brand"
import type { RenderedEmail } from "./types"

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

interface LayoutOptions {
  badge?: string
  badgeVariant?: "primary" | "success" | "warning" | "danger" | "info" | "neutral"
  institutionLogo?: string | null
}

const getBadgeStyles = (variant: LayoutOptions["badgeVariant"] = "primary"): string => {
  switch (variant) {
    case "success":
      return "background-color:#dcfce7;color:#15803d;border:1px solid #bbf7d0;"
    case "warning":
      return "background-color:#fef3c7;color:#b45309;border:1px solid #fde68a;"
    case "danger":
      return "background-color:#fee2e2;color:#b91c1c;border:1px solid #fecaca;"
    case "info":
      return "background-color:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;"
    case "neutral":
      return "background-color:#f1f5f9;color:#475569;border:1px solid #e2e8f0;"
    case "primary":
    default:
      return "background-color:#fff7ed;color:#c2410c;border:1px solid #ffedd5;"
  }
}

const baseLayout = (
  title: string,
  bodyHtml: string,
  institutionName: string,
  options: LayoutOptions = {}
): RenderedEmail => {
  const badgeHtml = options.badge
    ? `<div style="margin-bottom:12px;"><span style="display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:4px 10px;border-radius:9999px;${getBadgeStyles(options.badgeVariant)}">${esc(options.badge)}</span></div>`
    : ""

  const logoHtml = isUsableInstitutionLogo(options.institutionLogo)
    ? `<td style="width:36px;height:36px;text-align:center;vertical-align:middle;">
        <img src="${esc(options.institutionLogo.trim())}" alt="${esc(institutionName)}" width="36" height="36" style="width:36px;height:36px;max-width:36px;max-height:36px;object-fit:contain;border-radius:10px;display:block;" />
      </td>`
    : `<td style="width:36px;height:36px;background:linear-gradient(135deg,#fff7ed 0%,#ffedd5 100%);border:1px solid #fed7aa;border-radius:10px;text-align:center;vertical-align:middle;font-weight:800;font-size:16px;color:#ea580c;">
        ${esc(institutionName.charAt(0).toUpperCase() || "S")}
      </td>`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#0f172a;line-height:1.6;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:32px 16px;">
    <tr>
      <td align="center">
        <!-- Card Container -->
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:580px;background-color:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.04),0 2px 4px -2px rgba(0,0,0,0.02);">
          <!-- Top Accent Gradient Line -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#f08c2b 0%,#ea580c 50%,#f59e0b 100%);"></td>
          </tr>
          <!-- Header -->
          <tr>
            <td style="padding:28px 32px 20px;border-bottom:1px solid #f1f5f9;">
              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        ${logoHtml}
                        <td style="padding-left:12px;">
                          <div style="font-size:15px;font-weight:700;color:#0f172a;letter-spacing:-0.01em;">${esc(institutionName)}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Main Content -->
          <tr>
            <td style="padding:32px;">
              ${badgeHtml}
              <h1 style="font-size:20px;font-weight:700;color:#0f172a;margin:0 0 18px;line-height:1.3;letter-spacing:-0.01em;">${esc(title)}</h1>
              <div style="font-size:14px;color:#334155;line-height:1.6;">
                ${bodyHtml}
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#475569;">${esc(institutionName)}</p>
              <p style="margin:0 0 8px;font-size:11px;color:#94a3b8;line-height:1.5;">This is an automated message from ${esc(institutionName)}. Please do not reply directly to this email.</p>
              <p style="margin:0;font-size:11px;color:#cbd5e1;">&copy; ${new Date().getFullYear()} ${esc(institutionName)}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = `${institutionName}\n\n${title}\n\n${bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}\n\nThis is an automated message from ${institutionName}.`
  return { html, text }
}

const renderDetailTable = (
  rows: Array<{ label: string; value: string | number | null | undefined; isHighlight?: boolean }>
): string => {
  const activeRows = rows.filter((r) => r.value != null && String(r.value).trim() !== "")
  if (activeRows.length === 0) return ""

  const rowsHtml = activeRows
    .map(
      (r, idx) => `
      <tr>
        <td style="padding:10px 16px;font-size:13px;color:#64748b;font-weight:500;border-bottom:${idx === activeRows.length - 1 ? "none" : "1px solid #e2e8f0"};background-color:${idx % 2 === 0 ? "#ffffff" : "#f8fafc"};width:42%;vertical-align:middle;">
          ${esc(r.label)}
        </td>
        <td style="padding:10px 16px;font-size:13px;color:${r.isHighlight ? "#0f172a" : "#1e293b"};font-weight:${r.isHighlight ? "700" : "600"};text-align:right;border-bottom:${idx === activeRows.length - 1 ? "none" : "1px solid #e2e8f0"};background-color:${idx % 2 === 0 ? "#ffffff" : "#f8fafc"};vertical-align:middle;">
          ${esc(r.value)}
        </td>
      </tr>`
    )
    .join("")

  return `
    <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin:16px 0;border-collapse:separate;border-spacing:0;">
      ${rowsHtml}
    </table>
  `
}

const renderAmountCard = (
  label: string,
  formattedAmount: string,
  subLabel?: string,
  variant: "primary" | "success" | "warning" = "primary"
): string => {
  const bg =
    variant === "success"
      ? "background:linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%);border:1px solid #bbf7d0;"
      : variant === "warning"
        ? "background:linear-gradient(135deg,#fffbeb 0%,#fef3c7 100%);border:1px solid #fde68a;"
        : "background:linear-gradient(135deg,#fff7ed 0%,#ffedd5 100%);border:1px solid #fed7aa;"

  return `
    <div style="${bg}border-radius:12px;padding:18px 20px;margin:16px 0;text-align:center;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;margin-bottom:4px;">
        ${esc(label)}
      </div>
      <div style="font-size:24px;font-weight:800;letter-spacing:-0.02em;line-height:1.2;color:#0f172a;">
        ${esc(formattedAmount)}
      </div>
      ${subLabel ? `<div style="font-size:12px;margin-top:4px;color:#64748b;font-weight:500;">${esc(subLabel)}</div>` : ""}
    </div>
  `
}

const renderNotice = (
  htmlContent: string,
  type: "info" | "warning" | "success" | "danger" = "info"
): string => {
  let style = ""
  switch (type) {
    case "warning":
      style = "background-color:#fffbeb;border-left:4px solid #f59e0b;color:#92400e;"
      break
    case "success":
      style = "background-color:#f0fdf4;border-left:4px solid #22c55e;color:#166534;"
      break
    case "danger":
      style = "background-color:#fef2f2;border-left:4px solid #ef4444;color:#991b1b;"
      break
    case "info":
    default:
      style = "background-color:#f0f9ff;border-left:4px solid #0ea5e9;color:#075985;"
      break
  }
  return `
    <div style="${style}border-radius:4px 10px 10px 4px;padding:12px 16px;margin:16px 0;font-size:13px;line-height:1.5;">
      ${htmlContent}
    </div>
  `
}

const renderAttachmentNotice = (text: string): string => `
  <div style="background-color:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px;padding:11px 15px;margin:16px 0;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td style="width:20px;vertical-align:middle;font-size:14px;">📎</td>
        <td style="padding-left:8px;vertical-align:middle;font-size:13px;color:#475569;font-weight:500;">
          ${text}
        </td>
      </tr>
    </table>
  </div>
`

type TemplateData = Record<string, unknown>

export function renderEmailTemplate(template: string, data: TemplateData = {}): RenderedEmail {
  const institutionName = String(data.institutionName || "Your institution")
  const institutionLogo = (data.institutionLogo ?? data.logo ?? data.logoUrl ?? null) as string | null
  const memberName = String(data.memberName || "Member")
  const memberNumber = String(data.memberNumber || "")
  const currency = String(data.currency || "UGX")

  const layout = (
    title: string,
    bodyHtml: string,
    instName: string = institutionName,
    options: LayoutOptions = {}
  ): RenderedEmail =>
    baseLayout(title, bodyHtml, instName, {
      institutionLogo,
      ...options,
    })

  switch (template) {
    case "member.welcome": {
      const accountType = data.accountType ? String(data.accountType) : null
      const accountNumber = data.accountNumber ? String(data.accountNumber) : null
      const savingsDetails =
        accountType || accountNumber
          ? `<div style="margin-top:14px;">
               <p style="margin:0 0 6px;font-weight:600;color:#0f172a;">Your savings account details:</p>
               ${accountType ? `<p style="margin:0 0 4px;color:#475569;">Account type: <strong>${esc(accountType)}</strong></p>` : ""}
               ${accountNumber ? `<p style="margin:0;color:#475569;">Account number: <strong>${esc(accountNumber)}</strong></p>` : ""}
             </div>`
          : ""
      return layout(
        "Welcome",
        `<p style="margin:0 0 12px;">Hello ${esc(memberName)},</p>
         <p style="margin:0 0 14px;">Your membership at <strong>${esc(institutionName)}</strong> is now active.</p>
         ${renderDetailTable([
           { label: "Member Number", value: memberNumber, isHighlight: true },
           ...(accountType ? [{ label: "Account Type", value: accountType }] : []),
           ...(accountNumber ? [{ label: "Account Number", value: accountNumber }] : []),
         ])}
         <p style="display:none">Member number: <strong>${esc(memberNumber)}</strong></p>
         ${savingsDetails}
         ${renderNotice("Please complete your KYC verification when prompted.", "info")}`,
        institutionName,
        { badge: "Membership Active", badgeVariant: "success" }
      )
    }

    case "member.portal_credentials": {
      const loginEmail = String(data.loginEmail || "")
      const temporaryPassword = String(data.temporaryPassword || "")
      const loginUrl = String(data.loginUrl || "/client-login")
      const passwordReset = Boolean(data.passwordReset)
      const title = passwordReset ? "Portal password reset" : "Client portal access ready"
      return layout(
        title,
        `<p style="margin:0 0 12px;">Hello ${esc(memberName)},</p>
         <p style="margin:0 0 16px;">${
           passwordReset
             ? `Your client portal password for <strong>${esc(institutionName)}</strong> has been reset.`
             : `You can now access the <strong>${esc(institutionName)}</strong> client portal.`
         }</p>
         ${renderDetailTable([
           { label: "Member Number", value: memberNumber },
           { label: "Login Email", value: loginEmail },
           { label: "Temporary Password", value: temporaryPassword, isHighlight: true },
         ])}
         <div style="display:none">
           <p>Member number: <strong>${esc(memberNumber)}</strong></p>
           <p>Sign in at: <a href="${esc(loginUrl)}">${esc(loginUrl)}</a></p>
           <p>Email: <strong>${esc(loginEmail)}</strong></p>
           <p>Temporary password: <strong>${esc(temporaryPassword)}</strong></p>
         </div>
         <div style="margin:20px 0 16px;text-align:center;">
           <a href="${esc(loginUrl)}" style="display:inline-block;background-color:#f08c2b;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:8px;box-shadow:0 2px 4px rgba(240,140,43,0.3);">
             Sign In to Portal
           </a>
         </div>
         <p style="font-size:12px;color:#64748b;text-align:center;margin:0 0 16px;">Sign in URL: <a href="${esc(loginUrl)}" style="color:#ea580c;word-break:break-all;">${esc(loginUrl)}</a></p>
         ${renderNotice(
           `<p style="margin:0 0 6px;"><strong>Important:</strong> Change this password immediately after you log in.</p>
            <p style="margin:0;">Do not share this email with anyone. If you did not expect this message, contact your branch.</p>`,
           "warning"
         )}`,
        institutionName,
        { badge: passwordReset ? "Password Reset" : "Portal Access", badgeVariant: "warning" }
      )
    }

    case "member.kyc_required":
      return layout(
        "KYC verification required",
        `<p style="margin:0 0 12px;">Hello ${esc(memberName)},</p>
         <p style="margin:0 0 16px;">Please upload or update your KYC documents so we can verify your identity.</p>
         ${renderDetailTable([{ label: "Member Number", value: memberNumber }])}
         <p style="display:none">Member number: <strong>${esc(memberNumber)}</strong></p>
         ${renderNotice("Verified identity documents ensure account security and enable full financial services.", "info")}`,
        institutionName,
        { badge: "Action Required", badgeVariant: "warning" }
      )

    case "kyc.submitted": {
      const docTypeLabel = String(data.docTypeLabel || data.docType || "document")
      return layout(
        "KYC document submitted",
        `<p style="margin:0 0 12px;">Hello ${esc(memberName)},</p>
         <p style="margin:0 0 14px;">Your <strong>${esc(docTypeLabel)}</strong> has been submitted for review.</p>
         ${renderDetailTable([
           { label: "Document Type", value: docTypeLabel },
           { label: "Member Number", value: memberNumber },
           { label: "Review Status", value: "Pending Review" },
         ])}
         <p style="margin:14px 0 0;color:#475569;">We will notify you once the verification is complete.</p>
         <p style="display:none">Member number: <strong>${esc(memberNumber)}</strong></p>`,
        institutionName,
        { badge: "Under Review", badgeVariant: "info" }
      )
    }

    case "kyc.uploaded": {
      const docTypeLabel = String(data.docTypeLabel || data.docType || "document")
      return layout(
        "KYC document submitted",
        `<p style="margin:0 0 12px;">Hello ${esc(memberName)},</p>
         <p style="margin:0 0 14px;">Your <strong>${esc(docTypeLabel)}</strong> has been submitted successfully.</p>
         ${renderDetailTable([
           { label: "Document Type", value: docTypeLabel },
           { label: "Member Number", value: memberNumber },
           { label: "Status", value: "Uploaded" },
         ])}
         <p style="display:none">Member number: <strong>${esc(memberNumber)}</strong></p>`,
        institutionName,
        { badge: "Uploaded", badgeVariant: "info" }
      )
    }

    case "kyc.approved": {
      const docTypeLabel = String(data.docTypeLabel || data.docType || "document")
      return layout(
        "KYC document approved",
        `<p style="margin:0 0 12px;">Hello ${esc(memberName)},</p>
         <p style="margin:0 0 14px;">Your <strong>${esc(docTypeLabel)}</strong> has been verified successfully.</p>
         ${renderDetailTable([
           { label: "Document Type", value: docTypeLabel },
           { label: "Member Number", value: memberNumber },
           { label: "Verification Status", value: "Approved" },
         ])}
         <p style="display:none">Member number: <strong>${esc(memberNumber)}</strong></p>
         ${renderNotice("Your verification is up to date. You can now access all portal services.", "success")}`,
        institutionName,
        { badge: "Verified", badgeVariant: "success" }
      )
    }

    case "kyc.rejected": {
      const docTypeLabel = String(data.docTypeLabel || data.docType || "document")
      const reason = String(data.reason || "Document did not meet requirements")
      return layout(
        "KYC document rejected",
        `<p style="margin:0 0 12px;">Hello ${esc(memberName)},</p>
         <p style="margin:0 0 14px;">Your <strong>${esc(docTypeLabel)}</strong> was not approved.</p>
         ${renderNotice(`<strong>Reason:</strong> ${esc(reason)}`, "danger")}
         ${renderDetailTable([
           { label: "Document Type", value: docTypeLabel },
           { label: "Member Number", value: memberNumber },
           { label: "Status", value: "Rejected" },
         ])}
         <p style="margin:14px 0 0;color:#475569;">Please sign in to your portal and resubmit the document with corrections.</p>
         <p style="display:none">Member number: <strong>${esc(memberNumber)}</strong></p>`,
        institutionName,
        { badge: "Action Required", badgeVariant: "danger" }
      )
    }

    case "member.invoice": {
      const amount = Number(data.amount || 0)
      const invoiceNumber = String(data.invoiceNumber || "")
      const dueDate = data.dueDate ? String(data.dueDate) : null
      return layout(
        "Membership fee invoice",
        `<p style="margin:0 0 12px;">Hello ${esc(memberName)},</p>
         <p style="margin:0 0 14px;">Invoice <strong>${esc(invoiceNumber)}</strong> has been issued for your annual membership fee.</p>
         ${renderAmountCard("Amount Due", formatCurrency(amount, currency))}
         ${renderDetailTable([
           { label: "Invoice Number", value: invoiceNumber },
           ...(dueDate ? [{ label: "Due Date", value: dueDate }] : []),
           { label: "Member Number", value: memberNumber },
         ])}
         <div style="display:none">
           <p>Amount due: <strong>${esc(formatCurrency(amount, currency))}</strong></p>
           ${dueDate ? `<p>Due date: <strong>${esc(dueDate)}</strong></p>` : ""}
         </div>`,
        institutionName,
        { badge: "Invoice Issued", badgeVariant: "primary" }
      )
    }

    case "invoice.sent": {
      const amount = Number(data.amount || 0)
      const invoiceNumber = String(data.invoiceNumber || "")
      const dueDate = data.dueDate ? String(data.dueDate) : null
      return layout(
        "Invoice issued",
        `<p style="margin:0 0 12px;">Hello ${esc(memberName)},</p>
         <p style="margin:0 0 14px;">Invoice <strong>${esc(invoiceNumber)}</strong> has been issued to your account.</p>
         ${renderAmountCard("Amount Due", formatCurrency(amount, currency))}
         ${renderDetailTable([
           { label: "Invoice Number", value: invoiceNumber },
           ...(dueDate ? [{ label: "Due Date", value: dueDate }] : []),
           { label: "Member Number", value: memberNumber },
         ])}
         <div style="display:none">
           <p>Amount due: <strong>${esc(formatCurrency(amount, currency))}</strong></p>
           ${dueDate ? `<p>Due date: <strong>${esc(dueDate)}</strong></p>` : ""}
         </div>
         ${renderAttachmentNotice("Your invoice is attached to this email as a PDF.")}`,
        institutionName,
        { badge: "Invoice", badgeVariant: "primary" }
      )
    }

    case "membership_fee.paid": {
      const amount = Number(data.amount || 0)
      const remaining = Number(data.remaining || 0)
      const invoiceNumber = data.invoiceNumber ? String(data.invoiceNumber) : null
      const transactionNumber = data.transactionNumber ? String(data.transactionNumber) : null
      return layout(
        "Membership fee payment received",
        `<p style="margin:0 0 12px;">Hello ${esc(memberName)},</p>
         <p style="margin:0 0 14px;">We received your membership fee payment of <strong>${esc(formatCurrency(amount, currency))}</strong>.</p>
         ${renderAmountCard("Payment Received", formatCurrency(amount, currency), undefined, "success")}
         ${renderDetailTable([
           ...(invoiceNumber ? [{ label: "Invoice Number", value: invoiceNumber }] : []),
           ...(transactionNumber ? [{ label: "Receipt No.", value: transactionNumber }] : []),
           {
             label: "Outstanding Balance",
             value: remaining > 0 ? formatCurrency(remaining, currency) : "UGX 0 (Fully Paid)",
             isHighlight: remaining > 0,
           },
         ])}
         <div style="display:none">
           ${remaining > 0 ? `<p>Outstanding balance: <strong>${esc(formatCurrency(remaining, currency))}</strong></p>` : "<p>Your membership fee is fully paid. Thank you.</p>"}
           ${invoiceNumber ? `<p>Invoice: <strong>${esc(invoiceNumber)}</strong></p>` : ""}
           ${transactionNumber ? `<p>Receipt no.: <strong>${esc(transactionNumber)}</strong></p>` : ""}
         </div>
         ${remaining <= 0 ? renderNotice("Your membership fee is fully paid. Thank you for your continued partnership.", "success") : ""}
         ${renderAttachmentNotice("Your payment receipt is attached to this email as a PDF.")}`,
        institutionName,
        { badge: "Payment Confirmed", badgeVariant: "success" }
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
        `<p style="margin:0 0 12px;">Hello ${esc(memberName)},</p>
         <p style="margin:0 0 14px;">We received your payment of <strong>${esc(formatCurrency(amount, currency))}</strong>${invoiceNumber ? ` for invoice <strong>${esc(invoiceNumber)}</strong>` : ""}.</p>
         ${renderAmountCard("Payment Recorded", formatCurrency(amount, currency), undefined, "success")}
         ${renderDetailTable([
           ...(invoiceNumber ? [{ label: "Invoice Number", value: invoiceNumber }] : []),
           ...(transactionNumber ? [{ label: "Receipt No.", value: transactionNumber }] : []),
           {
             label: "Outstanding Balance",
             value: fullySettled ? "Fully Settled" : formatCurrency(outstanding, currency),
           },
         ])}
         <div style="display:none">
           ${fullySettled ? "<p>Your invoice is now fully paid. Thank you.</p>" : `<p>Outstanding balance: <strong>${esc(formatCurrency(outstanding, currency))}</strong></p>`}
           ${transactionNumber ? `<p>Receipt no.: <strong>${esc(transactionNumber)}</strong></p>` : ""}
         </div>
         ${fullySettled ? renderNotice("Your invoice is now fully paid. Thank you.", "success") : ""}
         ${renderAttachmentNotice("Your payment receipt is attached to this email as a PDF.")}`,
        institutionName,
        { badge: "Payment Recorded", badgeVariant: "success" }
      )
    }

    case "shares.purchased": {
      const shares = Number(data.numberOfShares || 0)
      const amount = Number(data.amount || 0)
      const invoiceNumber = data.invoiceNumber ? String(data.invoiceNumber) : null
      const transactionNumber = data.transactionNumber ? String(data.transactionNumber) : null
      return layout(
        "Share purchase confirmation",
        `<p style="margin:0 0 12px;">Hello ${esc(memberName)},</p>
         <p style="margin:0 0 14px;">Your purchase of <strong>${esc(shares)}</strong> share(s) totalling <strong>${esc(formatCurrency(amount, currency))}</strong> has been recorded.</p>
         ${renderAmountCard("Shares Investment", formatCurrency(amount, currency), `${shares} Share(s) Acquired`, "success")}
         ${renderDetailTable([
           { label: "Number of Shares", value: shares },
           ...(invoiceNumber ? [{ label: "Invoice Number", value: invoiceNumber }] : []),
           ...(transactionNumber ? [{ label: "Receipt No.", value: transactionNumber }] : []),
         ])}
         <div style="display:none">
           ${invoiceNumber ? `<p>Invoice: <strong>${esc(invoiceNumber)}</strong></p>` : ""}
           ${transactionNumber ? `<p>Receipt no.: <strong>${esc(transactionNumber)}</strong></p>` : ""}
         </div>
         ${renderAttachmentNotice("Your invoice and payment receipt are attached to this email as PDFs.")}`,
        institutionName,
        { badge: "Shares Recorded", badgeVariant: "success" }
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
        `<p style="margin:0 0 12px;">Hello ${esc(memberName)},</p>
         <p style="margin:0 0 14px;">${intro}</p>
         ${renderAmountCard(
           `${typeLabel} Amount`,
           formatCurrency(amount, currency),
           accountNumber ? `Account: ${accountNumber}` : undefined,
           transactionType === "withdrawal" ? "warning" : "success"
         )}
         ${renderDetailTable([
           ...(accountNumber ? [{ label: "Account Number", value: accountNumber }] : []),
           ...(sourceAccountNumber ? [{ label: "Source Account", value: sourceAccountNumber }] : []),
           ...(mode ? [{ label: "Payment Method", value: mode }] : []),
           ...(transactionDate ? [{ label: "Transaction Date", value: transactionDate }] : []),
           { label: "Available Balance", value: formatCurrency(balanceAfter, currency), isHighlight: true },
           ...(charges != null && charges > 0 ? [{ label: "Transaction Charges", value: formatCurrency(charges, currency) }] : []),
           ...(transactionNumber ? [{ label: "Receipt No.", value: transactionNumber }] : []),
         ])}
         <div style="display:none">
           ${mode ? `<p>Payment method: <strong>${esc(mode)}</strong></p>` : ""}
           ${transactionDate ? `<p>Transaction date: <strong>${esc(transactionDate)}</strong></p>` : ""}
           <p>Available balance: <strong>${esc(formatCurrency(balanceAfter, currency))}</strong></p>
           ${charges != null && charges > 0 ? `<p>Transaction charges: <strong>${esc(formatCurrency(charges, currency))}</strong></p>` : ""}
           ${transactionNumber ? `<p>Receipt no.: <strong>${esc(transactionNumber)}</strong></p>` : ""}
         </div>
         ${renderAttachmentNotice("Your transaction receipt is attached to this email as a PDF.")}`,
        institutionName,
        {
          badge: isTransferDeposit ? "Deposit Received" : typeLabel,
          badgeVariant: transactionType === "withdrawal" ? "warning" : "success",
        }
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
        `<p style="margin:0 0 12px;">Hello ${esc(memberName)},</p>
         <p style="margin:0 0 14px;">Thank you — we received your loan payment of <strong>${esc(formatCurrency(amount, currency))}</strong>${applicationId ? ` for loan <strong>${esc(applicationId)}</strong>` : ""}.</p>
         ${renderAmountCard("Payment Received", formatCurrency(amount, currency), applicationId ? `Loan ID: ${applicationId}` : undefined, "success")}
         ${renderDetailTable([
           ...(applicationId ? [{ label: "Loan Application ID", value: applicationId }] : []),
           ...(paymentDate ? [{ label: "Payment Date", value: paymentDate }] : []),
           { label: "Outstanding Balance", value: formatCurrency(balanceAfter, currency), isHighlight: true },
           ...(transactionNumber ? [{ label: "Receipt No.", value: transactionNumber }] : []),
         ])}
         <div style="display:none">
           ${paymentDate ? `<p>Payment date: <strong>${esc(paymentDate)}</strong></p>` : ""}
           <p>Outstanding balance: <strong>${esc(formatCurrency(balanceAfter, currency))}</strong></p>
           ${transactionNumber ? `<p>Receipt no.: <strong>${esc(transactionNumber)}</strong></p>` : ""}
         </div>
         ${renderAttachmentNotice("Your payment receipt is attached to this email as a PDF.")}`,
        institutionName,
        { badge: "Loan Payment", badgeVariant: "success" }
      )
    }

    case "loan.application_submitted": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      const loanType = String(data.loanType || "Normal")
      const productName = data.productName ? String(data.productName) : null
      return layout(
        "Loan application submitted",
        `<p style="margin:0 0 12px;">Hello ${esc(memberName)},</p>
         <p style="margin:0 0 14px;">Your loan application <strong>${esc(applicationId)}</strong> has been submitted successfully.</p>
         ${renderAmountCard("Amount Requested", formatCurrency(amount, currency, { fractionDigits: 2 }))}
         ${renderDetailTable([
           { label: "Application ID", value: applicationId },
           { label: "Loan Type", value: loanType },
           ...(productName ? [{ label: "Product", value: productName }] : []),
           { label: "Member Number", value: memberNumber },
         ])}
         <div style="display:none">
           <p>Amount requested: <strong>${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))}</strong></p>
           <p>Loan type: <strong>${esc(loanType)}</strong></p>
           ${productName ? `<p>Product: <strong>${esc(productName)}</strong></p>` : ""}
           <p>Member number: <strong>${esc(memberNumber)}</strong></p>
         </div>
         ${renderNotice("We will notify you when your application is reviewed.", "info")}`,
        institutionName,
        { badge: "Application Submitted", badgeVariant: "primary" }
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
        `<p style="margin:0 0 12px;">Hello ${esc(staffName)},</p>
         <p style="margin:0 0 14px;"><strong>${esc(memberName)}</strong> (${esc(memberNumber)}) has submitted a new loan application.</p>
         ${renderAmountCard("Amount Requested", formatCurrency(amount, currency, { fractionDigits: 2 }), undefined, "warning")}
         ${renderDetailTable([
           { label: "Applicant Name", value: memberName },
           { label: "Member Number", value: memberNumber },
           { label: "Application ID", value: applicationId },
           { label: "Loan Type", value: loanType },
           ...(productName ? [{ label: "Product", value: productName }] : []),
         ])}
         <div style="display:none">
           <p>Application ID: <strong>${esc(applicationId)}</strong></p>
           <p>Amount requested: <strong>${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))}</strong></p>
           <p>Loan type: <strong>${esc(loanType)}</strong></p>
           ${productName ? `<p>Product: <strong>${esc(productName)}</strong></p>` : ""}
         </div>
         ${renderNotice("Please sign in to review the application.", "warning")}`,
        institutionName,
        { badge: "Approval Pending", badgeVariant: "warning" }
      )
    }

    case "loan.under_review": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      return layout(
        "Loan under review",
        `<p style="margin:0 0 12px;">Hello ${esc(memberName)},</p>
         <p style="margin:0 0 14px;">Your loan application <strong>${esc(applicationId)}</strong> is under review.</p>
         ${renderAmountCard("Amount Requested", formatCurrency(amount, currency, { fractionDigits: 2 }))}
         ${renderDetailTable([
           { label: "Application ID", value: applicationId },
           { label: "Member Number", value: memberNumber },
           { label: "Status", value: "Under Review" },
         ])}
         <div style="display:none">
           <p>Amount requested: <strong>${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))}</strong></p>
           <p>Member number: <strong>${esc(memberNumber)}</strong></p>
         </div>
         ${renderNotice("We will notify you when a decision is made.", "info")}`,
        institutionName,
        { badge: "Under Review", badgeVariant: "info" }
      )
    }

    case "loan.reviewed": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      return layout(
        "Loan review complete",
        `<p style="margin:0 0 12px;">Hello ${esc(memberName)},</p>
         <p style="margin:0 0 14px;">Your loan application <strong>${esc(applicationId)}</strong> has been reviewed.</p>
         ${renderAmountCard("Loan Amount", formatCurrency(amount, currency, { fractionDigits: 2 }))}
         ${renderDetailTable([
           { label: "Application ID", value: applicationId },
           { label: "Review Status", value: "Completed" },
         ])}
         <div style="display:none">
           <p>Amount: <strong>${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))}</strong></p>
         </div>
         ${renderNotice("We will notify you when a final decision is made.", "info")}`,
        institutionName,
        { badge: "Review Complete", badgeVariant: "info" }
      )
    }

    case "loan.status_change": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      const statusLabel = String(data.statusLabel || "updated")
      return layout(
        "Loan status update",
        `<p style="margin:0 0 12px;">Hello ${esc(memberName)},</p>
         <p style="margin:0 0 14px;">Your loan application <strong>${esc(applicationId)}</strong> status is now <strong>${esc(statusLabel)}</strong>.</p>
         ${renderAmountCard("Loan Amount", formatCurrency(amount, currency, { fractionDigits: 2 }))}
         ${renderDetailTable([
           { label: "Application ID", value: applicationId },
           { label: "Current Status", value: statusLabel, isHighlight: true },
           { label: "Member Number", value: memberNumber },
         ])}
         <div style="display:none">
           <p>Amount: <strong>${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))}</strong></p>
           <p>Member number: <strong>${esc(memberNumber)}</strong></p>
         </div>
         <p style="margin:14px 0 0;color:#475569;">Sign in to your portal for details.</p>`,
        institutionName,
        { badge: "Status Update", badgeVariant: "primary" }
      )
    }

    case "loan.approved": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      return layout(
        "Loan application approved",
        `<p style="margin:0 0 12px;">Hello ${esc(memberName)},</p>
         <p style="margin:0 0 14px;">Your loan application <strong>${esc(applicationId)}</strong> has been approved.</p>
         ${renderAmountCard("Approved Amount", formatCurrency(amount, currency, { fractionDigits: 2 }), undefined, "success")}
         ${renderDetailTable([
           { label: "Application ID", value: applicationId },
           { label: "Status", value: "Approved" },
         ])}
         <div style="display:none">
           <p>Approved amount: <strong>${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))}</strong></p>
         </div>
         ${renderNotice("We will notify you when disbursement is processed.", "success")}`,
        institutionName,
        { badge: "Approved", badgeVariant: "success" }
      )
    }

    case "loan.rejected": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      return layout(
        "Loan application update",
        `<p style="margin:0 0 12px;">Hello ${esc(memberName)},</p>
         <p style="margin:0 0 14px;">Your loan application <strong>${esc(applicationId)}</strong> was not approved.</p>
         ${renderDetailTable([
           { label: "Application ID", value: applicationId },
           { label: "Requested Amount", value: formatCurrency(amount, currency, { fractionDigits: 2 }) },
           { label: "Status", value: "Not Approved" },
         ])}
         <div style="display:none">
           <p>Amount requested: <strong>${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))}</strong></p>
         </div>
         ${renderNotice("Contact your branch for more information.", "danger")}`,
        institutionName,
        { badge: "Application Update", badgeVariant: "danger" }
      )
    }

    case "loan.partially_disbursed": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      return layout(
        "Loan partially disbursed",
        `<p style="margin:0 0 12px;">Hello ${esc(memberName)},</p>
         <p style="margin:0 0 14px;">A partial disbursement has been made on your loan <strong>${esc(applicationId)}</strong>.</p>
         ${renderAmountCard("Partial Disbursement", formatCurrency(amount, currency, { fractionDigits: 2 }))}
         ${renderDetailTable([
           { label: "Application ID", value: applicationId },
           { label: "Disbursed Amount", value: formatCurrency(amount, currency, { fractionDigits: 2 }) },
         ])}
         <div style="display:none">
           <p>Amount: <strong>${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))}</strong></p>
         </div>
         <p style="margin:14px 0 0;color:#475569;">Sign in to your portal for disbursement details.</p>`,
        institutionName,
        { badge: "Partially Disbursed", badgeVariant: "primary" }
      )
    }

    case "loan.disbursed": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      return layout(
        "Loan fully disbursed",
        `<p style="margin:0 0 12px;">Hello ${esc(memberName)},</p>
         <p style="margin:0 0 14px;">Your loan <strong>${esc(applicationId)}</strong> has been fully disbursed.</p>
         ${renderAmountCard("Disbursed Amount", formatCurrency(amount, currency, { fractionDigits: 2 }), undefined, "success")}
         ${renderDetailTable([
           { label: "Application ID", value: applicationId },
           { label: "Disbursed Amount", value: formatCurrency(amount, currency, { fractionDigits: 2 }) },
           { label: "Status", value: "Fully Disbursed" },
         ])}
         <div style="display:none">
           <p>Disbursed amount: <strong>${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))}</strong></p>
         </div>
         ${renderNotice(`Thank you for banking with ${esc(institutionName)}.`, "success")}`,
        institutionName,
        { badge: "Disbursed", badgeVariant: "success" }
      )
    }

    case "loan.ready_for_approval": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      const staffName = String(data.staffName || "Team member")
      return layout(
        "Loan ready for approval",
        `<p style="margin:0 0 12px;">Hello ${esc(staffName)},</p>
         <p style="margin:0 0 14px;"><strong>${esc(memberName)}</strong> (${esc(memberNumber)}) — application <strong>${esc(applicationId)}</strong> has been reviewed.</p>
         ${renderAmountCard("Loan Amount", formatCurrency(amount, currency, { fractionDigits: 2 }), undefined, "warning")}
         ${renderDetailTable([
           { label: "Member Name", value: memberName },
           { label: "Member Number", value: memberNumber },
           { label: "Application ID", value: applicationId },
         ])}
         <div style="display:none">
           <p>Amount: <strong>${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))}</strong></p>
         </div>
         ${renderNotice("Please sign in to approve or reject the loan.", "warning")}`,
        institutionName,
        { badge: "Ready for Approval", badgeVariant: "warning" }
      )
    }

    case "loan.under_review_staff": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      const staffName = String(data.staffName || "Team member")
      return layout(
        "Loan under review",
        `<p style="margin:0 0 12px;">Hello ${esc(staffName)},</p>
         <p style="margin:0 0 14px;"><strong>${esc(memberName)}</strong> (${esc(memberNumber)}) — application <strong>${esc(applicationId)}</strong> is under review.</p>
         ${renderAmountCard("Loan Amount", formatCurrency(amount, currency, { fractionDigits: 2 }))}
         ${renderDetailTable([
           { label: "Member Name", value: memberName },
           { label: "Member Number", value: memberNumber },
           { label: "Application ID", value: applicationId },
         ])}
         <div style="display:none">
           <p>Amount: <strong>${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))}</strong></p>
         </div>`,
        institutionName,
        { badge: "Staff Notice", badgeVariant: "info" }
      )
    }

    case "loan.approved_staff": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      const staffName = String(data.staffName || "Team member")
      return layout(
        "Loan approved",
        `<p style="margin:0 0 12px;">Hello ${esc(staffName)},</p>
         <p style="margin:0 0 14px;"><strong>${esc(memberName)}</strong>'s loan (<strong>${esc(applicationId)}</strong>) for ${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))} has been approved.</p>
         ${renderDetailTable([
           { label: "Member Name", value: memberName },
           { label: "Application ID", value: applicationId },
           { label: "Approved Amount", value: formatCurrency(amount, currency, { fractionDigits: 2 }), isHighlight: true },
         ])}`,
        institutionName,
        { badge: "Approved", badgeVariant: "success" }
      )
    }

    case "loan.rejected_staff": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      const staffName = String(data.staffName || "Team member")
      return layout(
        "Loan rejected",
        `<p style="margin:0 0 12px;">Hello ${esc(staffName)},</p>
         <p style="margin:0 0 14px;"><strong>${esc(memberName)}</strong>'s loan application (<strong>${esc(applicationId)}</strong>) for ${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))} was rejected.</p>
         ${renderDetailTable([
           { label: "Member Name", value: memberName },
           { label: "Application ID", value: applicationId },
           { label: "Requested Amount", value: formatCurrency(amount, currency, { fractionDigits: 2 }) },
         ])}`,
        institutionName,
        { badge: "Rejected", badgeVariant: "danger" }
      )
    }

    case "loan.partially_disbursed_staff": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      const staffName = String(data.staffName || "Team member")
      return layout(
        "Loan partially disbursed",
        `<p style="margin:0 0 12px;">Hello ${esc(staffName)},</p>
         <p style="margin:0 0 14px;"><strong>${esc(memberName)}</strong>'s loan (<strong>${esc(applicationId)}</strong>) has been partially disbursed (${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))}).</p>
         ${renderDetailTable([
           { label: "Member Name", value: memberName },
           { label: "Application ID", value: applicationId },
           { label: "Disbursed Amount", value: formatCurrency(amount, currency, { fractionDigits: 2 }), isHighlight: true },
         ])}`,
        institutionName,
        { badge: "Partially Disbursed", badgeVariant: "primary" }
      )
    }

    case "loan.fully_disbursed_staff": {
      const amount = Number(data.principalAmount || 0)
      const applicationId = String(data.applicationId || "")
      const staffName = String(data.staffName || "Team member")
      return layout(
        "Loan fully disbursed",
        `<p style="margin:0 0 12px;">Hello ${esc(staffName)},</p>
         <p style="margin:0 0 14px;"><strong>${esc(memberName)}</strong>'s loan (<strong>${esc(applicationId)}</strong>) for ${esc(formatCurrency(amount, currency, { fractionDigits: 2 }))} has been fully disbursed.</p>
         ${renderDetailTable([
           { label: "Member Name", value: memberName },
           { label: "Application ID", value: applicationId },
           { label: "Total Disbursed", value: formatCurrency(amount, currency, { fractionDigits: 2 }), isHighlight: true },
         ])}`,
        institutionName,
        { badge: "Fully Disbursed", badgeVariant: "success" }
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
          ? `<div style="margin:16px 0;">
               <p style="margin:0 0 8px;font-weight:700;color:#0f172a;font-size:14px;">Savings opening balances</p>
               ${renderDetailTable(
                 savingsAccounts.flatMap((account, idx) => [
                   ...(account.accountNumber ? [{ label: `Account #${idx + 1} No.`, value: account.accountNumber }] : []),
                   ...(account.accountType ? [{ label: `Account #${idx + 1} Type`, value: account.accountType }] : []),
                   { label: `Account #${idx + 1} Balance`, value: formatCurrency(account.openingBalance, currency), isHighlight: true },
                 ])
               )}
               <ul style="display:none;">${savingsAccounts
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
                 .join("")}</ul>
             </div>`
          : ""

      const loanLines: string[] = []
      const loanTableRows: Array<{ label: string; value: string | number; isHighlight?: boolean }> = []
      if (loanRaw && loanOutstanding != null) {
        const applicationId = String(loanRaw.applicationId || "").trim()
        const productName = String(loanRaw.productName || "").trim()
        const principalAmount = Number(loanRaw.principalAmount)
        const amountPaid = Number(loanRaw.amountPaid)

        if (applicationId) {
          loanLines.push(`Loan application: <strong>${esc(applicationId)}</strong>`)
          loanTableRows.push({ label: "Loan Application", value: applicationId })
        }
        if (productName) {
          loanLines.push(`Loan product: <strong>${esc(productName)}</strong>`)
          loanTableRows.push({ label: "Loan Product", value: productName })
        }
        if (Number.isFinite(principalAmount) && principalAmount > 0) {
          loanLines.push(
            `Original principal: <strong>${esc(formatCurrency(principalAmount, currency))}</strong>`,
          )
          loanTableRows.push({ label: "Original Principal", value: formatCurrency(principalAmount, currency) })
        }
        if (Number.isFinite(amountPaid) && amountPaid > 0) {
          loanLines.push(`Amount paid: <strong>${esc(formatCurrency(amountPaid, currency))}</strong>`)
          loanTableRows.push({ label: "Amount Paid", value: formatCurrency(amountPaid, currency) })
        }
        loanLines.push(
          `Outstanding balance: <strong>${esc(formatCurrency(loanOutstanding, currency))}</strong>`,
        )
        loanTableRows.push({ label: "Outstanding Balance", value: formatCurrency(loanOutstanding, currency), isHighlight: true })
      }

      const loanHtml =
        loanLines.length > 0
          ? `<div style="margin:16px 0;">
               <p style="margin:0 0 8px;font-weight:700;color:#0f172a;font-size:14px;">Loan opening balance</p>
               ${renderDetailTable(loanTableRows)}
               <ul style="display:none;"><li>${loanLines.join("<br/>")}</li></ul>
             </div>`
          : ""

      return layout(
        "Opening balances recorded",
        `<p style="margin:0 0 12px;">Hello ${esc(memberName)},</p>
         <p style="margin:0 0 14px;">Your opening balance migration has been recorded:</p>
         ${savingsHtml}
         ${loanHtml}`,
        institutionName,
        { badge: "Migration Record", badgeVariant: "info" }
      )
    }

    case "email.test":
      return layout(
        "Test email",
        `<p style="margin:0 0 14px;">This is a test message from <strong>${esc(institutionName)}</strong>.</p>
         ${renderNotice("If you received this, branch email delivery is configured correctly.", "success")}`,
        institutionName,
        { badge: "Email Configuration Test", badgeVariant: "info" }
      )

    default:
      return layout(
        "Notification",
        `<p style="margin:0 0 12px;">Hello ${esc(memberName)},</p>
         <p style="margin:0 0 14px;">You have a new notification from <strong>${esc(institutionName)}</strong>.</p>`,
        institutionName,
        { badge: "Notification", badgeVariant: "primary" }
      )
  }
}

