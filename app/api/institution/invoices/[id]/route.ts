import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"


const normalizeDate = (value: unknown): string | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
};

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const normalizeStatusInput = (value: unknown): string => String(value || "draft").trim().toLowerCase()
const allowedStatuses = new Set(["draft", "sent", "paid", "overdue", "cancelled"])

type ActorContext = {
  id: string;
  institution_id: string;
  branch_id: string | null;
  role_id: string | null;
  role: string | null;
}

async function resolveActorContext(client: any, authUserId: string): Promise<ActorContext | null> {
  const actorRes = await client.query(
    `SELECT
       u.id,
       u.institution_id,
       u.branch_id,
       u.role_id,
       CASE
         WHEN r.name = 'System Admin' THEN 'system_admin'
         WHEN r.name = 'Super Admin' THEN 'super_admin'
         WHEN r.name = 'Admin' THEN 'institution_admin'
         WHEN r.name IS NOT NULL THEN regexp_replace(lower(r.name), '[^a-z0-9]+', '_', 'g')
         ELSE NULL
       END AS role
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.supabase_user_id = $1
     LIMIT 1`,
    [authUserId]
  )
  return actorRes.rows[0] || null
}

async function hasPermission(client: any, actor: ActorContext, permission: string): Promise<boolean> {
  const role = String(actor.role || "").trim().toLowerCase()
  if (role === "super_admin") return true
  if (!actor.role_id || !actor.branch_id) return false

  const permRes = await client.query(
    `SELECT 1
     FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1
       AND rp.branch_id = $2
       AND p.name = $3
     LIMIT 1`,
    [actor.role_id, actor.branch_id, permission]
  )
  return permRes.rowCount > 0
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
      const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const res = await client.query(
        `SELECT 
            i.id, i.institution_id, i.member_id, i.client_id, i.invoice_number, i.invoice_date, i.invoice_due,
            i.subtotal, i.vat, i.total_amount, i.inwords, i.invoice_type, i.status,
            i.created_by, i.created_at, i.modified_by, i.updated_at,
            COALESCE((
              SELECT SUM(ip.amount) FROM invoice_payments ip WHERE ip.invoice_id = i.id
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
        LEFT JOIN clients c ON c.id = i.client_id
        LEFT JOIN invoice_items p 
          ON i.id = p.invoice_id

        WHERE i.id = $1
        AND i.institution_id = $2
        ${isSuperAdmin ? "" : "AND i.branch_id = $3"}

        GROUP BY i.id`,
        isSuperAdmin ? [id, actor.institution_id] : [id, actor.institution_id, actor.branch_id]
      )
      if (res.rows.length === 0) return { error: "invoice_not_found" as const }
      const invoice = res.rows[0]
      const total = Number(invoice.total_amount || 0)
      const paid_amount = Number(invoice.paid_amount || 0)
      const outstanding = Math.max(total - paid_amount, 0)
      return {
        invoice: {
          ...invoice,
          client_id: invoice.client_id,
          member_id: invoice.member_id,
          target_type: invoice.member_id ? "member" : "client",
          customer_name: invoice.member_name || invoice.client_name || "",
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
    const clientId = String(body.client_id || "").trim();
    const invoiceDate = normalizeDate(body.invoice_date);
    const invoiceDue = normalizeDate(body.invoice_due);
    const status = normalizeStatusInput(body.status);
    const inwords = typeof body.inwords === "string" ? body.inwords.trim() : "";
    const invoiceType =
      typeof body.invoice_type === "string" ? body.invoice_type.trim() : ""
    if (!allowedStatuses.has(status))
      return NextResponse.json(
        { error: "invalid_status" },
        { status: 400 },
      );
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
    if ((memberId ? 1 : 0) + (clientId ? 1 : 0) !== 1)
      return NextResponse.json(
        { error: "exactly_one_of_member_id_or_client_id_required" },
        { status: 400 },
      );
    if (!invoiceDate)
      return NextResponse.json(
        { error: "invoice_date_required" },
        { status: 400 },
      );
    if (items.length === 0)
      return NextResponse.json({ error: "items_required" }, { status: 400 });

    const result = await runWithAuth(
      session.user.authUserId,
      async (client) => {
        const actor = await resolveActorContext(client, session.user.authUserId as string)
        if (!actor) return { error: "user_not_linked" as const };
        const allowed = await hasPermission(client, actor, "edit_invoice")
        if (!allowed) return { error: "missing_permission:edit_invoice" as const }
        const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
        if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const };

        const existingInvoiceRes = await client.query<{
          id: string
          invoice_number: string
          branch_id: string | null
          member_id: string | null
          client_id: string | null
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
             i.client_id,
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
           ${isSuperAdmin ? "" : "AND i.branch_id = $3"}`,
          isSuperAdmin ? [invoiceId, actor.institution_id] : [invoiceId, actor.institution_id, actor.branch_id],
        )
        const existing = existingInvoiceRes.rows[0]
        if (!existing) return { error: "invoice_not_found" as const }

        const oldValuesJson = JSON.stringify({
          member_id: existing.member_id,
          client_id: existing.client_id,
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
            `SELECT id FROM clients WHERE id = $1 AND institution_id = $2`,
            [clientId, actor.institution_id],
          );
          if (extClientRes.rows.length === 0) return { error: "client_not_found" as const };
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
               client_id = $2,
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
             ${isSuperAdmin ? "" : "AND branch_id = $14"}`,
            [
              memberId || null,
              clientId || null,
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
              ...(isSuperAdmin ? [] : [actor.branch_id]),
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
          const newValuesJson = JSON.stringify({
            member_id: memberId || null,
            client_id: clientId || null,
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
          await client.query(
            `INSERT INTO audit_logs
              (institution_id, branch_id, user_id, table_name, category, operation, record_id, old_values, new_values)
             VALUES ($1, $2, $3, 'invoices', 'invoices', 'UPDATE', $4, $5, $6)`,
            [
              actor.institution_id,
              existing.branch_id ?? actor.branch_id,
              actor.id,
              invoiceId,
              oldValuesJson,
              newValuesJson,
            ],
          );
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
      const statusCode =
        result.error === "invoice_not_found" ||
        result.error === "member_not_found" || result.error === "client_not_found"
          ? 404
          : result.error === "user_not_linked" || result.error === "missing_permission:edit_invoice"
            ? 403
            : 400;
      apiLog("warn", "invoice.update.denied", { method: "PUT", apiPath, status: statusCode, error: result.error, invoiceId, authUserId: session.user.authUserId });
      return NextResponse.json({ error: result.error }, { status: statusCode });
    }

    apiLog("info", "invoice.update.success", { method: "PUT", apiPath, status: 200, invoiceId, authUserId: session.user.authUserId });
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
    const nextStatus = String(body.status || "")
      .trim()
      .toLowerCase();
    if (!allowedStatuses.has(nextStatus)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor) return { error: "user_not_linked" as const };
      const allowed = await hasPermission(client, actor, "edit_invoice_status")
      if (!allowed) return { error: "missing_permission:edit_invoice_status" as const }
      const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin"
      if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const prevRes = await client.query<{ status: string; branch_id: string }>(
        `SELECT status, branch_id
         FROM invoices
         WHERE id = $1 AND institution_id = $2
         ${isSuperAdmin ? "" : "AND branch_id = $3"}`,
        isSuperAdmin ? [id, actor.institution_id] : [id, actor.institution_id, actor.branch_id],
      )
      if (prevRes.rowCount === 0) return { error: "invoice_not_found" as const }
      const previousStatus = String(prevRes.rows[0]?.status || "").trim().toLowerCase()
      const invoiceBranchId = prevRes.rows[0]?.branch_id || actor.branch_id

      const updateRes = await client.query<{ id: string; branch_id: string }>(
        `UPDATE invoices
         SET status = $1, modified_by = $2, updated_at = NOW()
         WHERE id = $3 AND institution_id = $4
         ${isSuperAdmin ? "" : "AND branch_id = $5"}
         RETURNING id, branch_id`,
        isSuperAdmin
          ? [nextStatus, actor.id, id, actor.institution_id]
          : [nextStatus, actor.id, id, actor.institution_id, actor.branch_id],
      );
      if (updateRes.rows.length === 0) return { error: "invoice_not_found" as const };

      await client.query(
        `INSERT INTO audit_logs
          (institution_id, branch_id, user_id, table_name, category, operation, record_id, old_values, new_values)
         VALUES
          ($1, $2, $3, 'invoices', 'invoices', 'UPDATE', $4, $5, $6)`,
        [
          actor.institution_id,
          invoiceBranchId,
          actor.id,
          id,
          JSON.stringify({ status: previousStatus }),
          JSON.stringify({ status: nextStatus }),
        ],
      )

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
      return NextResponse.json({ error: result.error }, { status: statusCode });
    }

    apiLog("info", "invoice.status.success", { method: "PATCH", apiPath, status: 200, invoiceId: id, authUserId: session.user.authUserId })
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
