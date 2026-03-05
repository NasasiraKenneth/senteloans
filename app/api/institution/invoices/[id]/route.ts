import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { auditLogger } from "@/lib/audit/audit-logger"

function isElevated(role?: string | null) {
  return role === "institution_admin" || role === "manager"
}

const normalizeDate = (value: unknown): string | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
};

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;


/** GET /api/institution/invoices/[id] — fetch a single invoice and its details */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: "Missing invoice ID" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.type !== "staff")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actorRes = await client.query(
        `SELECT institution_id FROM senteloans_users WHERE supabase_user_id = $1`,
        [session!.user!.authUserId]
      )
      const actor = actorRes.rows[0]
      if (!actor) return { error: "user_not_linked" as const }

      const res = await client.query(
        `SELECT 
            i.id, i.institution_id, i.client_id, i.invoice_number, i.invoice_date, i.invoice_due,
            i.subtotal, i.vat, i.total_amount, i.inwords, i.invoice_type, i.status,
            i.created_by, i.created_at, i.modified_by, i.updated_at,

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

        FROM senteloans_invoices i
        LEFT JOIN senteloans_invoice_items p 
          ON i.id = p.invoice_id

        WHERE i.id = $1
        AND i.institution_id = $2

        GROUP BY i.id`,
        [id, actor.institution_id]
      )
      if (res.rows.length === 0) return { error: "invoice_not_found" as const }
      return { invoice: res.rows[0] }
    })

    if (result && "error" in result) {
      const status = result.error === "invoice_not_found" ? 404 : 400
      return NextResponse.json({ error: result.error }, { status })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PUT(req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {

    const { id } = await params
    if (!id) return NextResponse.json({ error: "Missing invoice ID" }, { status: 400 })

    const session = await getServerSession(authOptions);
    if (!session?.user?.authUserId)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (session.user.type !== "staff")
      return NextResponse.json({ error: "not_staff" }, { status: 403 });

    const url = new URL(req.url);
    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const invoiceId = String(id).trim();
    const clientId = String(body.client_id || "").trim();
    const invoiceDate = normalizeDate(body.invoice_date);
    const invoiceDue = normalizeDate(body.invoice_due);
    const status = String(body.status || "Draft").trim();
    const inwords = typeof body.inwords === "string" ? body.inwords.trim() : "";
    const invoiceType =
      typeof body.invoice_type === "string" ? body.invoice_type.trim() : ""
    const items = Array.isArray(body.items)
      ? (body.items as Array<Record<string, unknown>>)
      : [];

    if (!invoiceId)
      return NextResponse.json(
        { error: "invoice_id_required" },
        { status: 400 },
      );
    if (!clientId)
      return NextResponse.json(
        { error: "client_id_required" },
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
        const actorRes = await client.query<{
          id: string;
          institution_id: string;
        }>(
          `SELECT id, institution_id FROM senteloans_users WHERE supabase_user_id = $1`,
          [session!.user!.authUserId],
        );
        const actor = actorRes.rows[0];
        if (!actor) return { error: "user_not_linked" as const };

        const existingInvoiceRes = await client.query<{
          id: string;
          invoice_number: string;
        }>(
          `SELECT id, invoice_number
         FROM senteloans_invoices
         WHERE id = $1 AND institution_id = $2`,
          [invoiceId, actor.institution_id],
        );
        const existing = existingInvoiceRes.rows[0];
        if (!existing) return { error: "invoice_not_found" as const };

        const clientRes = await client.query<{ id: string }>(
          `SELECT id FROM senteloans_clients WHERE id = $1 AND institution_id = $2`,
          [clientId, actor.institution_id],
        );
        if (clientRes.rows.length === 0)
          return { error: "client_not_found" as const };

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
            `UPDATE senteloans_invoices
           SET client_id = $1,
               invoice_date = $2,
               invoice_due = $3,
               subtotal = $4,
               vat = $5,
               total_amount = $6,
               inwords = $7,
               invoice_type = $8,
               status = $9,
               modified_by = $10,
               updated_at = NOW()
           WHERE id = $11`,
            [
              clientId,
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
            ],
          );

          await client.query(
            `DELETE FROM senteloans_invoice_items WHERE invoice_id = $1`,
            [invoiceId],
          );
          for (const item of normalizedItems) {
            await client.query(
              `INSERT INTO senteloans_invoice_items (
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
        result.error === "client_not_found"
          ? 404
          : result.error === "user_not_linked"
            ? 403
            : 400;
      return NextResponse.json({ error: result.error }, { status: statusCode });
    }

    return NextResponse.json(result);
  } catch (e: unknown) {
    const err = e as Error;
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
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "invoice_id_required" }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (session.user.type !== "staff") {
      return NextResponse.json({ error: "not_staff" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const nextStatus = String(body.status || "")
      .trim()
      .toLowerCase();
    const allowedStatuses = new Set([
      "draft",
      "sent",
      "paid",
      "overdue",
      "cancelled",
    ]);

    if (!allowedStatuses.has(nextStatus)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actorRes = await client.query<{ id: string; institution_id: string }>(
        `SELECT id, institution_id FROM senteloans_users WHERE supabase_user_id = $1`,
        [session!.user!.authUserId],
      );
      const actor = actorRes.rows[0];
      if (!actor) return { error: "user_not_linked" as const };

      const updateRes = await client.query<{ id: string }>(
        `UPDATE senteloans_invoices
         SET status = $1, modified_by = $2, updated_at = NOW()
         WHERE id = $3 AND institution_id = $4
         RETURNING id`,
        [nextStatus, actor.id, id, actor.institution_id],
      );
      if (updateRes.rows.length === 0) return { error: "invoice_not_found" as const };

      return { ok: true, id, status: nextStatus };
    });

    if (result && "error" in result) {
      const statusCode =
        result.error === "invoice_not_found"
          ? 404
          : result.error === "user_not_linked"
            ? 403
            : 400;
      return NextResponse.json({ error: result.error }, { status: statusCode });
    }

    return NextResponse.json(result);
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json(
      { error: err?.message || "Unexpected error" },
      { status: 500 },
    );
  }
}
