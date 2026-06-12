import type { PoolClient } from "pg"
import { auditLogger } from "@/lib/audit/audit-logger"
import { insertWithInvoiceNumberRetry } from "./invoice-number-retry"
import { numberToWords } from "./utils"

export type InvoiceStatus = "draft" | "sent" | "partially paid" | "fully paid" | "overdue" | "cancelled"

const normalizeInvoiceStatus = (value?: string): InvoiceStatus => {
  const s = String(value || "draft").trim().toLowerCase()
  const allowed: InvoiceStatus[] = ["draft", "sent", "partially paid", "fully paid", "overdue", "cancelled"]
  return allowed.includes(s as InvoiceStatus) ? (s as InvoiceStatus) : "draft"
}

export interface InvoiceItemInput {
  unit?: string | null
  description: string
  quantity: number
  unit_price: number
  /** Optional override; defaults to quantity * unit_price. */
  total_price?: number
  vatinclusive?: boolean
}

export type InvoiceTarget =
  | { member_id: string; third_party_agent_id?: undefined }
  | { third_party_agent_id: string; member_id?: undefined }

export interface CreateInvoiceInput {
  institutionId: string
  branchId: string
  /** Staff user id creating the invoice. */
  createdBy: string
  /** ISO date YYYY-MM-DD. */
  invoiceDate: string
  /** Optional ISO due date YYYY-MM-DD. */
  invoiceDue?: string | null
  /**
   * Short type tag (max 10 chars in schema, e.g. "MEMBER", "LOAN", "INVENT").
   */
  invoiceType: string
  status?: InvoiceStatus
  inwords?: string
  /** VAT amount (in currency). Subtotal is computed from items. */
  vat?: number
  items: InvoiceItemInput[]
  target: InvoiceTarget
}

export interface CreatedInvoice {
  id: string
  invoice_number: string
  invoice_due: string | null
  subtotal: number
  vat: number
  total_amount: number
}

const round2 = (n: number): number =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100

/**
 * Insert an invoice + line items + audit log in one go on the provided client.
 *
 * The caller is expected to manage the surrounding transaction (BEGIN/COMMIT)
 * — this keeps the helper composable with multi-step write paths like member
 * registration (member + savings + invoice all in one transaction).
 *
 * Throws on db errors so the caller can ROLLBACK; returns a structured row on
 * success.
 */
export async function createInvoiceWithItems(
  client: PoolClient,
  input: CreateInvoiceInput,
): Promise<CreatedInvoice> {
  if (!input.items || input.items.length === 0) {
    throw new Error("invoice_items_required")
  }
  if (!input.invoiceDate) {
    throw new Error("invoice_date_required")
  }

  const normalizedItems = input.items.map((it) => {
    const quantity = Math.max(0, Number(it.quantity || 0))
    const unitPrice = Math.max(0, Number(it.unit_price || 0))
    const totalPrice = round2(
      typeof it.total_price === "number" && Number.isFinite(it.total_price)
        ? it.total_price
        : quantity * unitPrice,
    )
    return {
      unit: it.unit ? String(it.unit).slice(0, 15) : null,
      description: String(it.description || "").trim().slice(0, 120),
      quantity: round2(quantity),
      unit_price: round2(unitPrice),
      total_price: totalPrice,
      vatinclusive: Boolean(it.vatinclusive),
    }
  })

  const validItems = normalizedItems.filter(
    (it) => it.description.length > 0 && it.quantity > 0,
  )
  if (validItems.length === 0) {
    throw new Error("invoice_items_invalid")
  }

  const subtotal = round2(
    validItems.reduce((sum, it) => sum + it.total_price, 0),
  )
  const vat = round2(Math.max(0, Number(input.vat || 0)))
  const totalAmount = round2(subtotal + vat)
  const status = normalizeInvoiceStatus(input.status)

  // Default the amount-in-words to the total when the caller doesn't supply one
  // so every invoice (shares, registration, etc.) carries a populated inwords.
  const inwords =
    typeof input.inwords === "string" && input.inwords.trim()
      ? input.inwords.trim()
      : numberToWords(totalAmount)

  // Insert with SAVEPOINT-based retry on invoice_number collisions
  // (mirrors how transactions handles transaction_number).
  const inserted = await insertWithInvoiceNumberRetry(
    (invoiceNumber) =>
      client.query<{ id: string; invoice_number: string }>(
        `INSERT INTO invoices (
           institution_id, branch_id, member_id, third_party_agent_id,
           invoice_number, invoice_date, invoice_due,
           subtotal, vat, total_amount, inwords, invoice_type, status, created_by
         ) VALUES (
           $1, $2, $3, $4,
           $5, $6, $7,
           $8, $9, $10, $11, $12, $13, $14
         )
         RETURNING id, invoice_number`,
        [
          input.institutionId,
          input.branchId,
          input.target.member_id ?? null,
          input.target.third_party_agent_id ?? null,
          invoiceNumber,
          input.invoiceDate,
          input.invoiceDue ?? null,
          subtotal,
          vat,
          totalAmount,
          inwords,
          String(input.invoiceType || "").slice(0, 10),
          status,
          input.createdBy,
        ],
      ),
    { client },
  )
  if (!inserted) throw new Error("invoice_number_generation_failed")
  const invoice = inserted.row

  for (const item of validItems) {
    await client.query(
      `INSERT INTO invoice_items (
         invoice_id, unit, description, quantity, unit_price, total_price, vatinclusive
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        invoice.id,
        item.unit,
        item.description,
        item.quantity,
        item.unit_price,
        item.total_price,
        item.vatinclusive,
      ],
    )
  }

  await auditLogger.logInsert(
    "invoices",
    invoice.id,
    {
      member_id: input.target.member_id ?? null,
      third_party_agent_id: input.target.third_party_agent_id ?? null,
      invoice_number: invoice.invoice_number,
      invoice_date: input.invoiceDate,
      invoice_due: input.invoiceDue ?? null,
      status,
      invoice_type: input.invoiceType,
      subtotal,
      vat,
      total_amount: totalAmount,
      item_count: validItems.length,
    },
    input.institutionId,
    input.createdBy,
    { branch_id: input.branchId },
    client,
  )

  return {
    id: invoice.id,
    invoice_number: invoice.invoice_number,
    invoice_due: input.invoiceDue ?? null,
    subtotal,
    vat,
    total_amount: totalAmount,
  }
}
