import type { PoolClient } from "pg"
import {
  renderSingleInvoicePdfBuffer,
  type SingleInvoicePdfData,
} from "@/app/api/institution/invoices/[id]/pdf/invoice-single-pdf"

export type GenerateInvoicePdfInput = {
  invoiceId: string
  institutionId: string
  branchId?: string | null
}

export type GenerateInvoicePdfResult =
  | { ok: true; buffer: Buffer; invoiceNumber: string }
  | { ok: false; error: string }

/**
 * Load invoice data and render a single-invoice PDF buffer.
 * Shared by the HTTP PDF route, email attachments, and future callers.
 */
export async function generateInvoicePdfBuffer(
  client: PoolClient,
  input: GenerateInvoicePdfInput,
): Promise<GenerateInvoicePdfResult> {
  const { invoiceId, institutionId, branchId } = input

  const invoiceRes = await client.query(
    `SELECT
       i.id,
       i.branch_id,
       i.invoice_number,
       i.invoice_date,
       i.invoice_due,
       i.subtotal,
       i.vat,
       i.total_amount,
       i.inwords,
       i.invoice_type,
       i.status,
       COALESCE(ins.name, '') AS sacco_name,
       COALESCE(ins.logo, '') AS sacco_logo,
       COALESCE(b.name, '') AS branch_name,
       COALESCE(b.phone_number, '') AS branch_phone,
       COALESCE(b.email, '') AS branch_email,
       COALESCE(ins.website, '') AS website,
       COALESCE(b.address, '') AS branch_address,
       CASE
         WHEN i.member_id IS NOT NULL THEN COALESCE(m.full_name, '')
         ELSE COALESCE(tpa.name, '')
       END AS recipient_name,
       CASE
         WHEN i.member_id IS NOT NULL THEN COALESCE(m.phone_number, '')
         ELSE COALESCE(tpa.phone, '')
       END AS recipient_phone,
       CASE
         WHEN i.member_id IS NOT NULL THEN COALESCE(NULLIF(trim(concat_ws(', ', m.village, m.district)), ''), '')
         ELSE COALESCE(tpa.address, '')
       END AS recipient_address
     FROM invoices i
     LEFT JOIN institutions ins ON ins.id = i.institution_id
     LEFT JOIN branches b ON b.id = i.branch_id
     LEFT JOIN members m ON m.id = i.member_id
     LEFT JOIN third_party_agents tpa ON tpa.id = i.third_party_agent_id
     WHERE i.id = $1
       AND i.institution_id = $2
       ${branchId ? "AND i.branch_id = $3" : ""}
     LIMIT 1`,
    branchId ? [invoiceId, institutionId, branchId] : [invoiceId, institutionId],
  )

  const invoice = invoiceRes.rows[0]
  if (!invoice) return { ok: false, error: "invoice_not_found" }

  const itemsRes = await client.query(
    `SELECT unit, description, quantity, unit_price, total_price
     FROM invoice_items
     WHERE invoice_id = $1
     ORDER BY id`,
    [invoiceId],
  )

  const bankAccountsRes = await client.query(
    `SELECT bank_name, bank_account_number
     FROM bank_accounts
     WHERE institution_id = $1
       AND branch_id = $2
     ORDER BY created_at ASC`,
    [institutionId, String(invoice.branch_id || branchId || "")],
  )

  const pdfData: SingleInvoicePdfData = {
    invoice_number: String(invoice.invoice_number || ""),
    sacco_name: String(invoice.sacco_name || ""),
    sacco_logo: String(invoice.sacco_logo || ""),
    branch_name: String(invoice.branch_name || ""),
    branch_phone: String(invoice.branch_phone || ""),
    branch_email: String(invoice.branch_email || ""),
    website: String(invoice.website || ""),
    branch_address: String(invoice.branch_address || ""),
    bank_accounts: bankAccountsRes.rows
      .map(
        (r: Record<string, unknown>) =>
          `${String(r.bank_name || "").trim()} - ${String(r.bank_account_number || "").trim()}`,
      )
      .filter((v: string) => v !== "-" && v !== " - "),
    recipient_name: String(invoice.recipient_name || ""),
    recipient_phone: String(invoice.recipient_phone || ""),
    recipient_address: String(invoice.recipient_address || ""),
    status: String(invoice.status || ""),
    invoice_type: String(invoice.invoice_type || ""),
    invoice_date: invoice.invoice_date || null,
    invoice_due: invoice.invoice_due || null,
    subtotal: Number(invoice.subtotal || 0),
    vat: Number(invoice.vat || 0),
    total_amount: Number(invoice.total_amount || 0),
    inwords: String(invoice.inwords || ""),
    items: itemsRes.rows.map((r: Record<string, unknown>) => ({
      description: String(r.description || ""),
      unit: String(r.unit || ""),
      quantity: Number(r.quantity || 0),
      unit_price: Number(r.unit_price || 0),
      total_price: Number(r.total_price || 0),
    })),
  }

  const buffer = await renderSingleInvoicePdfBuffer(pdfData)
  return {
    ok: true,
    buffer,
    invoiceNumber: String(invoice.invoice_number || "invoice"),
  }
}
