import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import {
  assertNotSuperAdmin,
  hasPermission,
  isSuperAdmin,
  resolveActorContext,
} from "@/lib/api/rbac"
import {
  dispatchInvoiceStatusSideEffects,
  loadInvoiceStatusSideEffectsContext,
  type InvoiceStatusSideEffectsPostCommit,
  type InvoiceStatusSideEffectsResult,
} from "@/lib/invoices/invoice-status-side-effects"
import {
  auditInvoiceUpdate,
  invoiceSnapshot,
} from "@/lib/audit/invoice-audit"
import { assertBranchActive } from "@/lib/branches/branch-status"
import { assertActorActive } from "@/lib/staff/staff-status"
import {
  canEditInvoice,
  getInvoiceEditBlockedReason,
  getInvoiceStatusNotificationKind,
  getInvoiceStatusTransitionBlockedReason,
  isAllowedInvoiceStatus,
  isInvoiceStatusTransitionAllowed,
  normalizeInvoiceStatus,
} from "@/lib/invoices/status"

const normalizeDate = (value: unknown): string | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
};

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

function logInvoiceStatusSideEffects(
  method: string,
  apiPath: string,
  invoiceId: string,
  kind: InvoiceStatusSideEffectsPostCommit["kind"],
  result: InvoiceStatusSideEffectsResult,
): void {
  const eventPrefix =
    kind === "sent"
      ? "invoice.sent"
      : kind === "cancelled"
        ? "invoice.cancelled"
        : "invoice.overdue"

  apiLog(
    result.notify.ok ? "info" : "warn",
    result.notify.ok
      ? `${eventPrefix}.notifications_dispatched`
      : `${eventPrefix}.notifications_partial`,
    {
      method,
      apiPath,
      invoiceId,
      memberNotifications: result.notify.memberNotifications,
      staffNotifications: result.notify.staffNotifications,
      ...(result.notify.errors.length ? { errors: result.notify.errors } : {}),
    },
  )

  if (result.email) {
    apiLog(
      result.email.errors.length ? "warn" : "info",
      result.email.errors.length
        ? `${eventPrefix}.email_enqueue_partial`
        : `${eventPrefix}.email_enqueued`,
      {
        method,
        apiPath,
        invoiceId,
        enqueued: result.email.enqueued,
        skipped: result.email.skipped,
        ...(result.email.errors.length ? { errors: result.email.errors } : {}),
      },
    )
  }
}

async function runInvoiceStatusSideEffects(
  method: string,
  apiPath: string,
  invoiceId: string,
  postCommit: InvoiceStatusSideEffectsPostCommit | null,
): Promise<void> {
  if (!postCommit) return
  try {
    const sideEffects = await dispatchInvoiceStatusSideEffects(
      postCommit.kind,
      postCommit.ctx,
    )
    logInvoiceStatusSideEffects(
      method,
      apiPath,
      invoiceId,
      postCommit.kind,
      sideEffects,
    )
  } catch (sideEffectErr) {
    apiLog("error", "invoice.status.side_effects_failed", {
      method,
      apiPath,
      invoiceId,
      kind: postCommit.kind,
      error: (sideEffectErr as Error)?.message || "side_effects_failed",
    })
  }
}

/** GET /api/institution/invoices/[id] — fetch a single invoice and its details */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiPath = getApiPath(req)
  try {
    const { id } = await params
    if (!id) {
      apiLog("warn", "invoice.detail.invalid_request", { method: "GET", apiPath, status: 400, error: "missing_invoice_id" })
      return NextResponse.json({ error: "Missing invoice ID" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "invoice.detail.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "invoice.detail.denied", { method: "GET", apiPath, status: 403, error: "forbidden", authUserId: session.user.authUserId })
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor) return { error: "user_not_linked" as const }
      const allowed = await hasPermission(client, actor, "view_invoices")
      if (!allowed) return { error: "missing_permission:view_invoices" as const }
      const isSuperAdminActor = isSuperAdmin(actor)
      if (!isSuperAdminActor && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const res = await client.query(
        `SELECT 
            i.id, i.institution_id, i.member_id, i.third_party_agent_id, i.invoice_number, i.invoice_date, i.invoice_due,
            i.subtotal, i.vat, i.total_amount, i.inwords, i.invoice_type, i.status,
            i.created_by, i.created_at, i.modified_by, i.updated_at,
            COALESCE((
              SELECT SUM(ip.amount) FROM invoice_payments ip WHERE ip.invoice_id = i.id AND LOWER(COALESCE(ip.status, 'completed')) NOT IN ('cancelled', 'reversed')
            ), 0)::numeric AS paid_amount,
            MAX(m.full_name) AS member_name,
            MAX(c.name) AS client_name,

            COALESCE(
              json_agg(
                json_build_object(
                  'id', p.id,
                  'invoice_id', p.invoice_id,
                  'unit', p.unit,
                  'description', p.description,
                  'quantity', COALESCE(p.quantity, 0),
                  'unit_price', COALESCE(p.unit_price, 0),
                  'total_price', COALESCE(p.total_price, 0),
                  'vatinclusive', p.vatinclusive
                ) ORDER BY p.id
              ) FILTER (WHERE p.id IS NOT NULL),
              '[]'::json
            ) AS items

        FROM invoices i
        LEFT JOIN members m ON m.id = i.member_id
        LEFT JOIN third_party_agents c ON c.id = i.third_party_agent_id
        LEFT JOIN invoice_items p 
          ON i.id = p.invoice_id

        WHERE i.id = $1
        AND i.institution_id = $2
        ${isSuperAdminActor ? "" : "AND i.branch_id = $3"}

        GROUP BY i.id`,
        isSuperAdminActor ? [id, actor.institution_id] : [id, actor.institution_id, actor.branch_id]
      )
      if (res.rows.length === 0) return { error: "invoice_not_found" as const }
      const invoice = res.rows[0]
      const total = Number(invoice.total_amount || 0)
      const paid_amount = Number(invoice.paid_amount || 0)
      const outstanding = Math.max(total - paid_amount, 0)
      const customerName = invoice.member_name || invoice.third_party_agent_name || invoice.client_name || ""
      return {
        invoice: {
          ...invoice,
          third_party_agent_id: invoice.third_party_agent_id,
          member_id: invoice.member_id,
          target_type: invoice.member_id ? "member" : "third_party_agent",
          customer_name: customerName,
          client_name: customerName,
          paid_amount,
          outstanding,
        },
      }
    })

    if (result && "error" in result) {
      const status =
        result.error === "invoice_not_found" ? 404 :
        result.error === "user_not_linked" || result.error === "missing_permission:view_invoices" ? 403 : 400
      apiLog("warn", "invoice.detail.denied", { method: "GET", apiPath, status, error: result.error, invoiceId: id, authUserId: session.user.authUserId })
      return NextResponse.json({ error: result.error }, { status })
    }

    apiLog("info", "invoice.detail.success", { method: "GET", apiPath, status: 200, invoiceId: id, authUserId: session.user.authUserId })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "invoice.detail.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PUT(req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiPath = getApiPath(req)
  try {

    const { id } = await params
    if (!id) {
      apiLog("warn", "invoice.update.invalid_request", { method: "PUT", apiPath, status: 400, error: "missing_invoice_id" })
      return NextResponse.json({ error: "Missing invoice ID" }, { status: 400 })
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.authUserId) {
      apiLog("warn", "invoice.update.denied", { method: "PUT", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "invoice.update.denied", { method: "PUT", apiPath, status: 403, error: "not_staff", authUserId: session.user.authUserId })
      return NextResponse.json({ error: "not_staff" }, { status: 403 });
    }
    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const invoiceId = String(id).trim();
    const memberId = String(body.member_id || "").trim();
    const thirdPartyAgentId = String(body.third_party_agent_id || "").trim();
    const invoiceDate = normalizeDate(body.invoice_date);
    const invoiceDue = normalizeDate(body.invoice_due);
    if (!isAllowedInvoiceStatus(body.status)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }
    const status = normalizeInvoiceStatus(body.status);
    const inwords = typeof body.inwords === "string" ? body.inwords.trim() : "";
    const invoiceType =
      typeof body.invoice_type === "string" ? body.invoice_type.trim() : "";
    if (invoiceType.length > 10)
      return NextResponse.json(
        { error: "invalid_invoice_type" },
        { status: 400 },
      );
    const items = Array.isArray(body.items)
      ? (body.items as Array<Record<string, unknown>>)
      : [];

    if (!invoiceId)
      return NextResponse.json(
        { error: "invoice_id_required" },
        { status: 400 },
      );
    if ((memberId ? 1 : 0) + (thirdPartyAgentId ? 1 : 0) !== 1)
      return NextResponse.json(
        { error: "exactly_one_of_member_id_or_third_party_agent_id_required" },
        { status: 400 },
      );
    if (!invoiceDate)
      return NextResponse.json(
        { error: "invoice_date_required" },
        { status: 400 },
      );
    if (items.length === 0)
      return NextResponse.json({ error: "items_required" }, { status: 400 });

    let statusSideEffectsPostCommit: InvoiceStatusSideEffectsPostCommit | null = null;

    const result = await runWithAuth(
      session.user.authUserId,
      async (client) => {
        const actor = await resolveActorContext(client, session.user.authUserId as string)
        if (!actor) return { error: "user_not_linked" as const };

        const writeGuard = assertNotSuperAdmin(actor);
        if (!writeGuard.ok) {
          return { error: writeGuard.error, message: writeGuard.message };
        }

        const allowed = await hasPermission(client, actor, "edit_invoice")
        if (!allowed) return { error: "missing_permission:edit_invoice" as const }
        const isSuperAdminActor = isSuperAdmin(actor)
        if (!isSuperAdminActor && !actor.branch_id) return { error: "actor_branch_missing" as const };

        const staffCheck = await assertActorActive(client, actor)
        if (!staffCheck.ok) {
          return {
            error: staffCheck.error,
            staffStatus: staffCheck.error === "staff_inactive" ? staffCheck.status : undefined,
          }
        }

        const existingInvoiceRes = await client.query<{
          id: string
          invoice_number: string
          branch_id: string | null
          member_id: string | null
          third_party_agent_id: string | null
          invoice_date: string
          invoice_due: string | null
          subtotal: string | number
          vat: string | number
          total_amount: string | number
          inwords: string | null
          invoice_type: string
          status: string
          item_count: string | number
        }>(
          `SELECT
             i.id,
             i.invoice_number,
             i.branch_id,
             i.member_id,
             i.third_party_agent_id,
             i.invoice_date::text AS invoice_date,
             i.invoice_due::text AS invoice_due,
             i.subtotal,
             i.vat,
             i.total_amount,
             i.inwords,
             i.invoice_type,
             i.status,
             (SELECT COUNT(*)::int FROM invoice_items ii WHERE ii.invoice_id = i.id) AS item_count
           FROM invoices i
           WHERE i.id = $1 AND i.institution_id = $2
           ${isSuperAdminActor ? "" : "AND i.branch_id = $3"}`,
          isSuperAdminActor ? [invoiceId, actor.institution_id] : [invoiceId, actor.institution_id, actor.branch_id],
        )
        const existing = existingInvoiceRes.rows[0]
        if (!existing) return { error: "invoice_not_found" as const }

        const branchCheck = await assertBranchActive(
          client,
          String(existing.branch_id || actor.branch_id || ""),
        )
        if (!branchCheck.ok) {
          return {
            error: branchCheck.error as "branch_not_found" | "branch_inactive",
            branchStatus:
              branchCheck.error === "branch_inactive" ? branchCheck.status : undefined,
          }
        }

        if (!canEditInvoice(existing.status)) {
          return {
            error: "invoice_not_editable" as const,
            message: getInvoiceEditBlockedReason(existing.status) || undefined,
          }
        }

        const previousStatus = normalizeInvoiceStatus(existing.status)
        if (
          status !== previousStatus &&
          !isInvoiceStatusTransitionAllowed(previousStatus, status)
        ) {
          return {
            error: "invalid_status_transition" as const,
            message:
              getInvoiceStatusTransitionBlockedReason(previousStatus, status) ||
              undefined,
          }
        }

        const oldValues = invoiceSnapshot({
          member_id: existing.member_id,
          third_party_agent_id: existing.third_party_agent_id,
          invoice_date: existing.invoice_date,
          invoice_due: existing.invoice_due,
          subtotal: Number(existing.subtotal || 0),
          vat: Number(existing.vat || 0),
          total_amount: Number(existing.total_amount || 0),
          inwords: existing.inwords,
          invoice_type: existing.invoice_type,
          status: existing.status,
          item_count: Number(existing.item_count || 0),
        })

        if (memberId) {
          const memberRes = await client.query<{ id: string }>(
            `SELECT id FROM members WHERE id = $1 AND institution_id = $2`,
            [memberId, actor.institution_id],
          );
          if (memberRes.rows.length === 0) return { error: "member_not_found" as const };
        } else {
          const extClientRes = await client.query<{ id: string }>(
            `SELECT id FROM third_party_agents WHERE id = $1 AND institution_id = $2`,
            [thirdPartyAgentId, actor.institution_id],
          );
          if (extClientRes.rows.length === 0) return { error: "third_party_agent_not_found" as const };
        }

        const normalizedItems = items
          .map((item) => {
            const quantity = Math.max(0, Number(item.quantity || 0));
            const unitPrice = Math.max(
              0,
              Number(item.unit_price ?? item.unitPrice ?? 0),
            );
            const inputTotal = Number(
              item.total_price ?? item.totalPrice ?? quantity * unitPrice,
            );
            const totalPrice = round2(
              Number.isFinite(inputTotal) ? inputTotal : quantity * unitPrice,
            );
            return {
              unit: typeof item.unit === "string" ? item.unit.slice(0, 15) : "",
              description: String(item.description || "")
                .trim()
                .slice(0, 120),
              quantity: round2(quantity),
              unit_price: round2(unitPrice),
              total_price: totalPrice,
              vatinclusive: Boolean(item.vatinclusive ?? item.onVat),
            };
          })
          .filter((it) => it.description && it.quantity > 0);
        if (normalizedItems.length === 0)
          return { error: "invalid_items" as const };

        const computedSubtotal = round2(
          normalizedItems.reduce(
            (sum, item) => sum + Number(item.total_price || 0),
            0,
          ),
        );
        const vat = Math.max(0, Number(body.vat || 0));
        const totalAmount = round2(
          Number(
            body.total_amount || body.totalAmount || computedSubtotal + vat,
          ),
        );

        await client.query("BEGIN");
        try {
          await client.query(
            `UPDATE invoices
           SET member_id = $1,
               third_party_agent_id = $2,
               invoice_date = $3,
               invoice_due = $4,
               subtotal = $5,
               vat = $6,
               total_amount = $7,
               inwords = $8,
              invoice_type = $9,
               status = $10,
               modified_by = $11,
               updated_at = NOW()
           WHERE id = $12
             AND institution_id = $13
             ${isSuperAdminActor ? "" : "AND branch_id = $14"}`,
            [
              memberId || null,
              thirdPartyAgentId || null,
              invoiceDate,
              invoiceDue,
              computedSubtotal,
              round2(vat),
              totalAmount,
              inwords,
              invoiceType,
              status,
              actor.id,
              invoiceId,
              actor.institution_id,
              ...(isSuperAdminActor ? [] : [actor.branch_id]),
            ],
          );

          await client.query(
            `DELETE FROM invoice_items WHERE invoice_id = $1`,
            [invoiceId],
          );
          for (const item of normalizedItems) {
            await client.query(
              `INSERT INTO invoice_items (
              invoice_id, unit, description, quantity, unit_price, total_price, vatinclusive
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                invoiceId,
                item.unit || null,
                item.description,
                item.quantity,
                item.unit_price,
                item.total_price,
                item.vatinclusive,
              ],
            );
          }

          await client.query("COMMIT");
          const newValues = invoiceSnapshot({
            member_id: memberId || null,
            third_party_agent_id: thirdPartyAgentId || null,
            invoice_date: invoiceDate,
            invoice_due: invoiceDue,
            status,
            invoice_type: invoiceType,
            subtotal: computedSubtotal,
            vat: round2(vat),
            total_amount: totalAmount,
            inwords,
            item_count: normalizedItems.length,
          })
          await auditInvoiceUpdate(
            client,
            actor,
            invoiceId,
            oldValues,
            newValues,
            existing.branch_id ?? actor.branch_id,
          )

          const notificationKind = getInvoiceStatusNotificationKind(
            previousStatus,
            status,
          )
          if (notificationKind) {
            const ctx = await loadInvoiceStatusSideEffectsContext(client, {
              actorId: actor.id,
              institutionId: actor.institution_id,
              branchId: existing.branch_id ?? actor.branch_id ?? "",
              invoiceId,
              invoiceNumber: existing.invoice_number,
              totalAmount,
              invoiceDue,
              memberId: memberId || null,
              thirdPartyAgentId: thirdPartyAgentId || null,
            })
            if (ctx) {
              statusSideEffectsPostCommit = { kind: notificationKind, ctx }
            }
          }

          return {
            ok: true,
            id: invoiceId,
            invoice_number: existing.invoice_number,
          };
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      },
    );

    if (result && "error" in result) {
      const errorCode = String(result.error || "")
      const statusCode =
        errorCode === "invoice_not_found" ||
        errorCode === "member_not_found" ||
        errorCode === "third_party_agent_not_found"
          ? 404
          : errorCode === "user_not_linked" ||
              errorCode === "missing_permission:edit_invoice" ||
              errorCode === "super_admin_write_blocked"
            ? 403
            : 400;
      apiLog("warn", "invoice.update.denied", { method: "PUT", apiPath, status: statusCode, error: result.error, invoiceId, authUserId: session.user.authUserId });
      const payload: Record<string, unknown> = { error: result.error }
      if ("message" in result && result.message) payload.message = result.message
      return NextResponse.json(payload, { status: statusCode });
    }

    apiLog("info", "invoice.update.success", { method: "PUT", apiPath, status: 200, invoiceId, authUserId: session.user.authUserId });

    await runInvoiceStatusSideEffects(
      "PUT",
      apiPath,
      invoiceId,
      statusSideEffectsPostCommit,
    )

    return NextResponse.json(result);
  } catch (e: unknown) {
    const err = e as Error;
    apiLog("error", "invoice.update.error", { method: "PUT", apiPath, status: 500, error: err?.message || "Unexpected error" });
    return NextResponse.json(
      { error: err?.message || "Unexpected error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const apiPath = getApiPath(req)
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "invoice_id_required" }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.authUserId) {
      apiLog("warn", "invoice.status.denied", { method: "PATCH", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "invoice.status.denied", { method: "PATCH", apiPath, status: 403, error: "not_staff", authUserId: session.user.authUserId })
      return NextResponse.json({ error: "not_staff" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (!isAllowedInvoiceStatus(body.status)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }
    const nextStatus = normalizeInvoiceStatus(body.status);

    let statusSideEffectsPostCommit: InvoiceStatusSideEffectsPostCommit | null = null;

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor) return { error: "user_not_linked" as const };

      const writeGuard = assertNotSuperAdmin(actor);
      if (!writeGuard.ok) {
        return { error: writeGuard.error, message: writeGuard.message };
      }

      const allowed = await hasPermission(client, actor, "edit_invoice_status")
      if (!allowed) return { error: "missing_permission:edit_invoice_status" as const }
      const isSuperAdminActor = isSuperAdmin(actor)
      if (!isSuperAdminActor && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const staffCheck = await assertActorActive(client, actor)
      if (!staffCheck.ok) {
        return {
          error: staffCheck.error,
          staffStatus: staffCheck.error === "staff_inactive" ? staffCheck.status : undefined,
        }
      }

      const prevRes = await client.query<{
        status: string
        branch_id: string
        invoice_number: string
        total_amount: string | number
        invoice_due: string | null
        member_id: string | null
        third_party_agent_id: string | null
      }>(
        `SELECT status, branch_id, invoice_number, total_amount, invoice_due,
                member_id, third_party_agent_id
         FROM invoices
         WHERE id = $1 AND institution_id = $2
         ${isSuperAdminActor ? "" : "AND branch_id = $3"}`,
        isSuperAdminActor ? [id, actor.institution_id] : [id, actor.institution_id, actor.branch_id],
      )
      if (prevRes.rowCount === 0) return { error: "invoice_not_found" as const }
      const previous = prevRes.rows[0]
      const previousStatus = normalizeInvoiceStatus(previous?.status)
      const invoiceBranchId = previous?.branch_id || actor.branch_id

      const branchCheck = await assertBranchActive(client, String(invoiceBranchId || ""))
      if (!branchCheck.ok) {
        return {
          error: branchCheck.error as "branch_not_found" | "branch_inactive",
          branchStatus:
            branchCheck.error === "branch_inactive" ? branchCheck.status : undefined,
        }
      }

      if (!isInvoiceStatusTransitionAllowed(previousStatus, nextStatus)) {
        return {
          error: "invalid_status_transition" as const,
          message:
            getInvoiceStatusTransitionBlockedReason(previousStatus, nextStatus) ||
            undefined,
        }
      }

      const updateRes = await client.query<{ id: string; branch_id: string }>(
        `UPDATE invoices
         SET status = $1, modified_by = $2, updated_at = NOW()
         WHERE id = $3 AND institution_id = $4
         ${isSuperAdminActor ? "" : "AND branch_id = $5"}
         RETURNING id, branch_id`,
        isSuperAdminActor
          ? [nextStatus, actor.id, id, actor.institution_id]
          : [nextStatus, actor.id, id, actor.institution_id, actor.branch_id],
      );
      if (updateRes.rows.length === 0) return { error: "invoice_not_found" as const };

      await auditInvoiceUpdate(
        client,
        actor,
        id,
        { status: previousStatus },
        { status: nextStatus },
        invoiceBranchId,
      )

      const notificationKind = getInvoiceStatusNotificationKind(
        previousStatus,
        nextStatus,
      )
      if (notificationKind && previous) {
        const ctx = await loadInvoiceStatusSideEffectsContext(client, {
          actorId: actor.id,
          institutionId: actor.institution_id,
          branchId: invoiceBranchId ?? "",
          invoiceId: id,
          invoiceNumber: previous.invoice_number,
          totalAmount: Number(previous.total_amount || 0),
          invoiceDue: previous.invoice_due,
          memberId: previous.member_id,
          thirdPartyAgentId: previous.third_party_agent_id,
        })
        if (ctx) {
          statusSideEffectsPostCommit = { kind: notificationKind, ctx }
        }
      }

      return { ok: true, id, status: nextStatus };
    });

    if (result && "error" in result) {
      const statusCode =
        result.error === "invoice_not_found"
          ? 404
          : result.error === "user_not_linked" || result.error === "missing_permission:edit_invoice_status"
            ? 403
            : 400;
      apiLog("warn", "invoice.status.denied", { method: "PATCH", apiPath, status: statusCode, error: result.error, invoiceId: id, authUserId: session.user.authUserId })
      const payload: Record<string, unknown> = { error: result.error }
      if ("message" in result && result.message) payload.message = result.message
      return NextResponse.json(payload, { status: statusCode });
    }

    apiLog("info", "invoice.status.success", { method: "PATCH", apiPath, status: 200, invoiceId: id, authUserId: session.user.authUserId })

    await runInvoiceStatusSideEffects(
      "PATCH",
      apiPath,
      id,
      statusSideEffectsPostCommit,
    )

    return NextResponse.json(result);
  } catch (e: unknown) {
    const err = e as Error;
    apiLog("error", "invoice.status.error", { method: "PATCH", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json(
      { error: err?.message || "Unexpected error" },
      { status: 500 },
    );
  }
}
