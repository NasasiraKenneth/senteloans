import type { PoolClient } from "pg"
import { runWithoutAuth } from "@/lib/db"
import { enqueueInvoiceSentEmail } from "@/lib/email/invoice-emails"
import type { EnqueuedEmailsResult } from "@/lib/email/invoice-emails"
import {
  notifyInvoiceCreated,
  notifyInvoiceStatusChange,
  type NotifyInvoiceCreatedResult,
} from "@/lib/notifications/invoice-events"
import type { InvoiceStatusNotificationTarget } from "@/lib/notifications/invoice-events"

export type InvoiceStatusSideEffectsKind =
  | "sent"
  | "cancelled"
  | "overdue"

export type InvoiceStatusSideEffectsContext = {
  actorId: string
  institutionId: string
  branchId: string
  institutionName: string
  currency: string
  invoice: {
    id: string
    invoice_number: string
    total_amount: number
    invoice_due: string | null
  }
  member?: {
    id: string
    full_name: string
    member_number: string
    email: string
  } | null
  thirdPartyAgent?: {
    id: string
    name: string
  } | null
}

export type InvoiceStatusSideEffectsPostCommit = {
  kind: InvoiceStatusSideEffectsKind
  ctx: InvoiceStatusSideEffectsContext
}

export type InvoiceStatusSideEffectsResult = {
  notify: NotifyInvoiceCreatedResult
  email: EnqueuedEmailsResult | null
}

export async function loadInvoiceStatusSideEffectsContext(
  client: PoolClient,
  params: {
    actorId: string
    institutionId: string
    branchId: string
    invoiceId: string
    invoiceNumber: string
    totalAmount: number
    invoiceDue: string | null
    memberId: string | null
    thirdPartyAgentId: string | null
  },
): Promise<InvoiceStatusSideEffectsContext | null> {
  const instRes = await client.query<{ name: string }>(
    `SELECT name FROM institutions WHERE id = $1`,
    [params.institutionId],
  )
  const currencyRes = await client.query<{ currency: string | null }>(
    `SELECT currency FROM config WHERE branch_id = $1 LIMIT 1`,
    [params.branchId],
  )

  let member: InvoiceStatusSideEffectsContext["member"] = null
  let thirdPartyAgent: InvoiceStatusSideEffectsContext["thirdPartyAgent"] = null

  if (params.memberId) {
    const memberRes = await client.query<{
      id: string
      full_name: string
      member_number: string
      email: string | null
    }>(
      `SELECT id, full_name, member_number, email
       FROM members WHERE id = $1 AND institution_id = $2`,
      [params.memberId, params.institutionId],
    )
    const row = memberRes.rows[0]
    if (!row) return null
    member = {
      id: row.id,
      full_name: String(row.full_name || ""),
      member_number: String(row.member_number || ""),
      email: row.email ? String(row.email) : "",
    }
  } else if (params.thirdPartyAgentId) {
    const agentRes = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM third_party_agents WHERE id = $1 AND institution_id = $2`,
      [params.thirdPartyAgentId, params.institutionId],
    )
    const row = agentRes.rows[0]
    if (!row) return null
    thirdPartyAgent = {
      id: row.id,
      name: String(row.name || ""),
    }
  }

  return {
    actorId: params.actorId,
    institutionId: params.institutionId,
    branchId: params.branchId,
    institutionName: instRes.rows[0]?.name || "",
    currency: currencyRes.rows[0]?.currency || "UGX",
    invoice: {
      id: params.invoiceId,
      invoice_number: params.invoiceNumber,
      total_amount: params.totalAmount,
      invoice_due: params.invoiceDue,
    },
    member,
    thirdPartyAgent,
  }
}

function actorFromContext(ctx: InvoiceStatusSideEffectsContext) {
  return {
    id: ctx.actorId,
    institution_id: ctx.institutionId,
    branch_id: ctx.branchId,
  }
}

function memberFromContext(ctx: InvoiceStatusSideEffectsContext) {
  return ctx.member
    ? {
        id: ctx.member.id,
        full_name: ctx.member.full_name,
        member_number: ctx.member.member_number,
      }
    : null
}

/**
 * Best-effort notifications (and sent email) after a manual invoice status change.
 */
export async function dispatchInvoiceStatusSideEffects(
  kind: InvoiceStatusSideEffectsKind,
  ctx: InvoiceStatusSideEffectsContext,
): Promise<InvoiceStatusSideEffectsResult> {
  if (kind === "sent") {
    const notify = await runWithoutAuth((client) =>
      notifyInvoiceCreated({
        client,
        actor: actorFromContext(ctx),
        invoice: { ...ctx.invoice, status: "sent" },
        member: memberFromContext(ctx),
        thirdPartyAgent: ctx.thirdPartyAgent,
        currency: ctx.currency,
      }),
    )

    let email: EnqueuedEmailsResult | null = null
    if (ctx.member) {
      email = await enqueueInvoiceSentEmail({
        member: ctx.member,
        institutionName: ctx.institutionName,
        currency: ctx.currency,
        invoice: ctx.invoice,
        context: {
          institutionId: ctx.institutionId,
          branchId: ctx.branchId,
          actorId: ctx.actorId,
        },
      })
    }

    return { notify, email }
  }

  const statusTarget = kind as InvoiceStatusNotificationTarget
  const notify = await runWithoutAuth((client) =>
    notifyInvoiceStatusChange({
      client,
      actor: actorFromContext(ctx),
      invoice: ctx.invoice,
      statusTarget,
      member: memberFromContext(ctx),
      thirdPartyAgent: ctx.thirdPartyAgent,
    }),
  )

  return { notify, email: null }
}

/** @deprecated Use InvoiceStatusSideEffectsContext */
export type InvoiceSentSideEffectsContext = InvoiceStatusSideEffectsContext

/** @deprecated Use dispatchInvoiceStatusSideEffects(kind, ctx) */
export async function dispatchInvoiceSentSideEffects(
  ctx: InvoiceStatusSideEffectsContext,
): Promise<InvoiceStatusSideEffectsResult> {
  return dispatchInvoiceStatusSideEffects("sent", ctx)
}
