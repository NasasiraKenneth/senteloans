import type { Buffer } from "node:buffer"
import type { PoolClient } from "pg"
import {
  renderTransactionDetailPdfBuffer,
  type TransactionPdfData,
} from "@/app/api/institution/transactions/[id]/pdf/transaction-detail-pdf"
import { resolveTransactionAssignedParty } from "./resolve-assigned-party"

export type GenerateTransactionPdfInput = {
  transactionId: string
  institutionId: string
  branchId?: string | null
}

export type GenerateTransactionPdfResult =
  | { ok: true; buffer: Buffer; transactionNumber: string }
  | { ok: false; error: string }

function toPdfAssignedType(
  type: "member" | "third_party_agent" | "staff" | null,
): TransactionPdfData["assigned_to_type"] {
  if (type === "third_party_agent") return "client"
  return type
}

const PLACEHOLDER_TEXT = new Set(["-", "—", "–", "n/a", "na", "null", "none", "."])

function pdfText(value: unknown): string {
  if (value == null) return ""
  const text = String(value).trim()
  if (!text || PLACEHOLDER_TEXT.has(text.toLowerCase())) return ""
  return text
}

/**
 * Load transaction data and render a receipt PDF buffer.
 * Shared by the HTTP PDF route, email attachments, and future callers.
 */
export async function generateTransactionPdfBuffer(
  client: PoolClient,
  input: GenerateTransactionPdfInput,
): Promise<GenerateTransactionPdfResult> {
  const { transactionId, institutionId, branchId } = input

  const txRes = await client.query(
    `SELECT
       t.id,
       t.transaction_number,
       t.type,
       t.amount,
       t.mode,
       t.description,
       t.reference_number,
       t.balance_before,
       t.balance_after,
       t.charges,
       t.transaction_date,
       t.status,
       t.member_id,
       t.third_party_agent_id,
       t.staff_id,
       t.account_id,
       t.transferred_to_id,
       t.processed_by,
       t.bank_account_id,
       COALESCE(tpa.name, '') AS bank_name,
       COALESCE(ba.bank_account_number, '') AS bank_account_number,
       COALESCE(ins.name, '') AS sacco_name,
       COALESCE(ins.logo, '') AS sacco_logo,
       COALESCE(b.name, '') AS branch_name,
       COALESCE(b.phone_number, '') AS branch_phone,
       COALESCE(b.address, '') AS branch_address
     FROM transactions t
     LEFT JOIN institutions ins ON ins.id = t.institution_id
     LEFT JOIN branches b ON b.id = t.branch_id
     LEFT JOIN bank_accounts ba ON ba.id = t.bank_account_id
     LEFT JOIN third_party_agents tpa ON tpa.id = ba.third_party_agent_id
     WHERE t.id = $1
       AND t.institution_id = $2
       ${branchId ? "AND t.branch_id = $3" : ""}
     LIMIT 1`,
    branchId ? [transactionId, institutionId, branchId] : [transactionId, institutionId],
  )

  const tx = txRes.rows[0]
  if (!tx) return { ok: false, error: "transaction_not_found" }

  const assigned = await resolveTransactionAssignedParty(client, tx)

  let accountNumber = ""
  let accountType = ""
  if (tx.account_id) {
    const aRes = await client.query(
      `SELECT sa.account_number, COALESCE(at.account_name, 'Voluntary') AS account_type
       FROM savings_accounts sa
       LEFT JOIN account_type at ON at.id = sa.account_type_id
       WHERE sa.id = $1`,
      [tx.account_id],
    )
    accountNumber = pdfText(aRes.rows[0]?.account_number)
    accountType = pdfText(aRes.rows[0]?.account_type)
  }

  let processedByName = ""
  if (tx.processed_by) {
    const uRes = await client.query(`SELECT full_name FROM users WHERE id = $1`, [tx.processed_by])
    processedByName = String(uRes.rows[0]?.full_name || "")
  }

  let transferToAccountNumber = ""
  let transferToMemberNumber = ""
  let transferToMemberName = ""
  if (tx.transferred_to_id) {
    const taRes = await client.query(
      `SELECT sa.account_number, m.member_number, m.full_name
       FROM savings_accounts sa
       LEFT JOIN members m ON m.id = sa.member_id
       WHERE sa.id = $1
       LIMIT 1`,
      [tx.transferred_to_id],
    )
    transferToAccountNumber = pdfText(taRes.rows[0]?.account_number)
    transferToMemberNumber = pdfText(taRes.rows[0]?.member_number)
    transferToMemberName = pdfText(taRes.rows[0]?.full_name)
  }

  const pdfAssignedType = toPdfAssignedType(assigned.assigned_to_type)
  const buffer = await renderTransactionDetailPdfBuffer({
    sacco_name: String(tx.sacco_name || ""),
    sacco_logo: String(tx.sacco_logo || ""),
    branch_name: String(tx.branch_name || ""),
    branch_phone: String(tx.branch_phone || ""),
    branch_address: String(tx.branch_address || ""),
    transaction_number: String(tx.transaction_number || ""),
    type: String(tx.type || ""),
    amount: Number(tx.amount || 0),
    mode: String(tx.mode || ""),
    description: String(tx.description || ""),
    reference_number: String(tx.reference_number || ""),
    balance_before: tx.balance_before != null ? Number(tx.balance_before) : null,
    balance_after: tx.balance_after != null ? Number(tx.balance_after) : null,
    charges: tx.charges != null ? Number(tx.charges) : null,
    transaction_date: tx.transaction_date || null,
    status: String(tx.status || ""),
    assigned_to: assigned.assigned_to,
    assigned_to_type: pdfAssignedType,
    assigned_to_number: assigned.assigned_to_number,
    account_type: accountType,
    account_number: accountNumber,
    transfer_to_account_number: transferToAccountNumber,
    transfer_to_member_number: transferToMemberNumber,
    transfer_to_member_name: transferToMemberName,
    processed_by_name: pdfText(processedByName),
    processed_by_id: pdfText(tx.processed_by),
    bank_name: pdfText(tx.bank_name),
    bank_account_number: pdfText(tx.bank_account_number),
  })

  return {
    ok: true,
    buffer,
    transactionNumber: String(tx.transaction_number || tx.id || "receipt"),
  }
}
