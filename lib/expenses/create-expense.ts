import type { PoolClient } from "pg"
import type { ActorContext } from "@/lib/api/rbac"
import {
  auditCashflowInsert,
  auditCashflowPaymentInsert,
  auditExpenseInsert,
  auditFundingInsert,
  cashflowPaymentSnapshot,
  cashflowSnapshot,
  expenseSnapshot,
  fundingSnapshot,
} from "@/lib/audit/expense-audit"
import { insertWithExpenseNumberRetry, type ExpenseInsertRow } from "./expense-number-retry"

export const EXPENSE_FUNDING_SOURCE_TYPES = [
  "savings",
  "shares",
  "reserves",
  "loan",
  "grant",
] as const

export type ExpenseFundingSourceType = (typeof EXPENSE_FUNDING_SOURCE_TYPES)[number]

/** Columns on `expenses` per schema (no category). */
export interface CreateExpenseParams {
  institutionId: string
  branchId: string
  createdBy: string
  name: string
  type?: string | null
  description?: string | null
  status?: string
  completedBy?: string | null
  completedAt?: Date | string | null
  /** When set, skips collision-safe number generation. */
  expenseNumber?: string
}

export interface CreatedExpense {
  id: string
  expenseNumber: string
  name: string
  status: string
  type: string | null
  description: string | null
  createdAt: string | null
}

export interface CreateExpenseFundingSourceParams {
  expenseId: string
  sourceType: ExpenseFundingSourceType
  amount: number
  /** Required when `sourceType` is `loan`. */
  loanId?: string | null
}

export interface CreatedExpenseFundingSource {
  id: string
  expenseId: string
  sourceType: string
  loanId: string | null
  amount: number
  createdAt: string | null
}

export interface CreateExpenseCashflowParams {
  expenseId: string
  amount: number
  /** YYYY-MM-DD */
  date?: string | null
  staffId?: string | null
  thirdPartyAgentId?: string | null
  paymentMethod?: string | null
  description?: string | null
  transactionId?: string | null
  status?: string
  completedBy?: string | null
  completedAt?: Date | string | null
}
 
export interface CreatedExpenseCashflow {
  id: string
  expenseId: string
  amount: number
  description: string | null
  status: string
  date: string | null
  paymentMethod: string | null
  staffId: string | null
  thirdPartyAgentId: string | null
  transactionId: string | null
  createdAt: string | null
}

export interface CreateExpensePaymentParams {
  expenseId: string
  amount: number
  /** YYYY-MM-DD */
  date?: string | null
  expenseCashflowId?: string | null
  transactionId?: string | null
  paymentMethod?: string | null
  createdBy?: string | null
}

export interface CreatedExpensePayment {
  id: string
  expenseId: string
  expenseCashflowId: string | null
  transactionId: string | null
  amount: number
  paymentMethod: string | null
  date: string | null
  createdBy: string | null
  createdAt: string | null
}

type AuditActor = Pick<ActorContext, "id" | "institution_id" | "branch_id">

type ExpenseInsertResult = ExpenseInsertRow & {
  expense_number?: string
  name?: string
  status?: string
  type?: string | null
  description?: string | null
  created_at?: string | Date | null
}

const EXPENSE_INSERT_SQL = `INSERT INTO expenses (
  institution_id, branch_id, expense_number, name, status, type, description, created_by, completed_by, completed_at
)
VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::uuid, $9::uuid, $10::timestamptz)
RETURNING id, expense_number, name, status, type, description, created_at`

function mapExpenseRow(row: ExpenseInsertResult, expenseNumber: string): CreatedExpense {
  return {
    id: String(row.id),
    expenseNumber: String(row.expense_number || expenseNumber),
    name: String(row.name || ""),
    status: String(row.status || "Pending"),
    type: row.type != null ? String(row.type) : null,
    description: row.description != null ? String(row.description) : null,
    createdAt: row.created_at != null ? String(row.created_at) : null,
  }
}

/**
 * Insert an expense header row with collision-safe `EXP-*` numbering.
 * Must run inside an open DB transaction owned by the caller.
 */
export async function createExpense(
  client: PoolClient,
  params: CreateExpenseParams,
  options?: {
    audit?: boolean
    actor?: AuditActor
    branchId?: string | null
  },
): Promise<CreatedExpense> {
  const {
    institutionId,
    branchId,
    createdBy,
    name,
    type = null,
    description = null,
    status = "Pending",
    completedBy = null,
    completedAt = null,
    expenseNumber,
  } = params

  const audit = options?.audit ?? true
  const auditBranchId = options?.branchId ?? branchId
  const completedAtIso =
    completedAt == null
      ? null
      : typeof completedAt === "string"
        ? completedAt
        : completedAt.toISOString()

  const buildValues = (number: string) => [
    institutionId,
    branchId,
    number,
    name,
    status,
    type,
    description,
    createdBy,
    completedBy,
    completedAtIso,
  ]

  let row: ExpenseInsertResult
  let finalNumber: string

  if (expenseNumber) {
    const res = await client.query<ExpenseInsertResult>(EXPENSE_INSERT_SQL, buildValues(expenseNumber))
    if (!res.rows[0]?.id) throw new Error("expense_insert_failed")
    row = res.rows[0]
    finalNumber = expenseNumber
  } else {
    const inserted = await insertWithExpenseNumberRetry<ExpenseInsertResult>(
      (number) => client.query<ExpenseInsertResult>(EXPENSE_INSERT_SQL, buildValues(number)),
      { client },
    )
    if (!inserted) throw new Error("expense_number_generation_failed")
    row = inserted.row
    finalNumber = inserted.expenseNumber
  }

  if (audit && options?.actor) {
    await auditExpenseInsert(
      client,
      options.actor,
      String(row.id),
      expenseSnapshot({
        expense_number: finalNumber,
        name,
        status,
        type,
        description,
        branch_id: branchId,
        completed_by: completedBy,
        completed_at: completedAtIso,
      }),
      auditBranchId,
    )
  }

  return mapExpenseRow(row, finalNumber)
}

/**
 * Insert a row into `expense_funding_sources`.
 */
export async function createExpenseFundingSource(
  client: PoolClient,
  params: CreateExpenseFundingSourceParams,
  options?: {
    audit?: boolean
    actor?: AuditActor
    branchId?: string | null
  },
): Promise<CreatedExpenseFundingSource> {
  const { expenseId, sourceType, amount, loanId = null } = params
  const normalizedLoanId = sourceType === "loan" ? loanId : null

  const res = await client.query<Record<string, unknown>>(
    `INSERT INTO expense_funding_sources (expense_id, source_type, loan_id, amount)
     VALUES ($1::uuid, $2, $3::uuid, $4)
     RETURNING id, expense_id, source_type, loan_id, amount::float, created_at`,
    [expenseId, sourceType, normalizedLoanId, amount],
  )
  const row = res.rows[0]
  if (!row?.id) throw new Error("expense_funding_insert_failed")

  if ((options?.audit ?? true) && options?.actor) {
    await auditFundingInsert(
      client,
      options.actor,
      String(row.id),
      fundingSnapshot(row),
      options.branchId,
    )
  }

  return {
    id: String(row.id),
    expenseId: String(row.expense_id),
    sourceType: String(row.source_type || ""),
    loanId: row.loan_id != null ? String(row.loan_id) : null,
    amount: Number(row.amount || 0),
    createdAt: row.created_at != null ? String(row.created_at) : null,
  }
}

/**
 * Insert a row into `expense_cashflows`.
 */
export async function createExpenseCashflow(
  client: PoolClient,
  params: CreateExpenseCashflowParams,
  options?: {
    audit?: boolean
    actor?: AuditActor
    branchId?: string | null
  },
): Promise<CreatedExpenseCashflow> {
  const {
    expenseId,
    amount,
    date = null,
    staffId = null,
    thirdPartyAgentId = null,
    paymentMethod = null,
    description = null,
    transactionId = null,
    status = "Pending",
    completedBy = null,
    completedAt = null,
  } = params

  const completedAtIso =
    completedAt == null
      ? null
      : typeof completedAt === "string"
        ? completedAt
        : completedAt.toISOString()

  const res = await client.query<Record<string, unknown>>(
    `INSERT INTO expense_cashflows (
       expense_id,
       transaction_id,
       staff_id,
       third_party_agent_id,
       payment_method,
       amount,
       description,
       status,
       date,
       completed_by,
       completed_at
     )
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::payment_mode, $6, $7, $8, $9::date, $10::uuid, $11::timestamptz)
     RETURNING
       id,
       expense_id,
       amount::float,
       description,
       status,
       date::text AS date,
       payment_method::text AS payment_method,
       created_at,
       staff_id,
       third_party_agent_id,
       transaction_id,
       completed_by,
       completed_at`,
    [
      expenseId,
      transactionId,
      staffId,
      thirdPartyAgentId,
      paymentMethod,
      amount,
      description,
      status,
      date,
      completedBy,
      completedAtIso,
    ],
  )
  const row = res.rows[0]
  if (!row?.id) throw new Error("expense_cashflow_insert_failed")

  if ((options?.audit ?? true) && options?.actor) {
    await auditCashflowInsert(
      client,
      options.actor,
      String(row.id),
      cashflowSnapshot(row),
      options.branchId,
    )
  }

  return {
    id: String(row.id),
    expenseId: String(row.expense_id),
    amount: Number(row.amount || 0),
    description: row.description != null ? String(row.description) : null,
    status: String(row.status || "Pending"),
    date: row.date != null ? String(row.date) : null,
    paymentMethod: row.payment_method != null ? String(row.payment_method) : null,
    staffId: row.staff_id != null ? String(row.staff_id) : null,
    thirdPartyAgentId: row.third_party_agent_id != null ? String(row.third_party_agent_id) : null,
    transactionId: row.transaction_id != null ? String(row.transaction_id) : null,
    createdAt: row.created_at != null ? String(row.created_at) : null,
  }
}

/**
 * Insert a row into `expense_cashflows_payments` (a settled payment line for an expense).
 * Must run inside an open DB transaction owned by the caller.
 */
export async function createExpensePayment(
  client: PoolClient,
  params: CreateExpensePaymentParams,
  options?: {
    audit?: boolean
    actor?: AuditActor
    branchId?: string | null
  },
): Promise<CreatedExpensePayment> {
  const {
    expenseId,
    amount,
    date = null,
    expenseCashflowId = null,
    transactionId = null,
    paymentMethod = null,
    createdBy = null,
  } = params

  const resolvedCreatedBy = createdBy ?? options?.actor?.id ?? null

  const res = await client.query<Record<string, unknown>>(
    `INSERT INTO expense_cashflows_payments (
       expense_id,
       transaction_id,
       expense_cashflow_id,
       payment_method,
       amount,
       date,
       created_by
     )
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::payment_mode, $5, $6::date, $7::uuid)
     RETURNING
       id,
       expense_id,
       expense_cashflow_id,
       transaction_id,
       amount::float,
       payment_method::text AS payment_method,
       date::text AS date,
       created_by,
       created_at`,
    [
      expenseId,
      transactionId,
      expenseCashflowId,
      paymentMethod,
      amount,
      date,
      resolvedCreatedBy,
    ],
  )
  const row = res.rows[0]
  if (!row?.id) throw new Error("expense_payment_insert_failed")

  if ((options?.audit ?? true) && options?.actor) {
    await auditCashflowPaymentInsert(
      client,
      options.actor,
      String(row.id),
      cashflowPaymentSnapshot(row),
      options.branchId,
    )
  }

  return {
    id: String(row.id),
    expenseId: String(row.expense_id),
    expenseCashflowId: row.expense_cashflow_id != null ? String(row.expense_cashflow_id) : null,
    transactionId: row.transaction_id != null ? String(row.transaction_id) : null,
    amount: Number(row.amount || 0),
    paymentMethod: row.payment_method != null ? String(row.payment_method) : null,
    date: row.date != null ? String(row.date) : null,
    createdBy: row.created_by != null ? String(row.created_by) : null,
    createdAt: row.created_at != null ? String(row.created_at) : null,
  }
}

export function isExpenseFundingSourceType(value: string): value is ExpenseFundingSourceType {
  return (EXPENSE_FUNDING_SOURCE_TYPES as readonly string[]).includes(value)
}
