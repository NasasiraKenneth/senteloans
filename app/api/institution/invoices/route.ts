import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runWithAuth } from "@/lib/db";
import { apiLog, getApiPath } from "@/lib/api/api-log";

type InvoiceRow = {
  id: string;
  institution_id: string;
  member_id: string | null;
  client_id: string | null;
  branch_id: string;
  invoice_number: string;
  invoice_date: string;
  invoice_due: string | null;
  subtotal: string | number;
  vat: string | number;
  total_amount: string | number;
  inwords: string | null;
  invoice_type: string;
  status: string;
  created_by: string;
  created_at: string;
  modified_by: string | null;
  updated_at: string;
};

type InvoiceItemRow = {
  id: string;
  invoice_id: string;
  unit: string | null;
  description: string;
  quantity: string | number;
  unit_price: string | number;
  total_price: string | number;
  vatinclusive: boolean;
};

type ActorContext = {
  id: string;
  institution_id: string;
  branch_id: string | null;
  role_id: string | null;
  role: string | null;
};

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
     FROM senteloans_users u
     LEFT JOIN senteloans_roles r ON r.id = u.role_id
     WHERE u.supabase_user_id = $1
     LIMIT 1`,
    [authUserId],
  );
  return actorRes.rows[0] || null;
}

async function hasPermission(client: any, actor: ActorContext, permission: string): Promise<boolean> {
  const role = String(actor.role || "").trim().toLowerCase();
  if (role === "super_admin") return true;
  if (!actor.role_id || !actor.branch_id) return false;

  const permRes = await client.query(
    `SELECT 1
     FROM senteloans_role_permissions rp
     JOIN senteloans_permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1
       AND rp.branch_id = $2
       AND p.name = $3
     LIMIT 1`,
    [actor.role_id, actor.branch_id, permission],
  );
  return permRes.rowCount > 0;
}

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

const generateInvoiceNumber = async (
  client: {
    query: (
      text: string,
      params?: unknown[],
    ) => Promise<{ rows: Array<{ invoice_number: string }> }>;
  },
  invoiceDate: string,
): Promise<string> => {
  const datePart = invoiceDate.replaceAll("-", "");
  for (let i = 0; i < 20; i++) {
    const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
    const candidate = `INV-${datePart}-${randomPart}`;
    const exists = await client.query(
      `SELECT invoice_number FROM senteloans_invoices WHERE invoice_number = $1 LIMIT 1`,
      [candidate],
    );
    if (exists.rows.length === 0) return candidate;
  }
  return `INV-${datePart}-${Date.now().toString().slice(-6)}`;
};

export async function GET(req: Request) {
  const apiPath = getApiPath(req);
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.authUserId)
      apiLog("warn", "invoices.list.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" });
    if (!session?.user?.authUserId)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (session.user.type !== "staff")
      apiLog("warn", "invoices.list.denied", { method: "GET", apiPath, status: 403, error: "not_staff", authUserId: session.user.authUserId });
    if (session.user.type !== "staff")
      return NextResponse.json({ error: "not_staff" }, { status: 403 });

    const url = new URL(req.url);
    const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1);
    const pageSize = Math.min(
      Math.max(parseInt(url.searchParams.get("pageSize") || "10", 10), 1),
      100,
    );
    const status = (url.searchParams.get("status") || "").trim();
    const invoiceType = (url.searchParams.get("invoice_type") || "").trim();
    const targetType = (url.searchParams.get("target_type") || "").trim().toLowerCase();
    const search = (url.searchParams.get("search") || "").trim();
    const clientId = (url.searchParams.get("client_id") || "").trim();
    const invoiceId = (url.searchParams.get("invoice_id") || "").trim();
    const dateFrom = (url.searchParams.get("date_from") || "").trim();
    const dateTo = (url.searchParams.get("date_to") || "").trim();
    const branchesRaw = (url.searchParams.get("branches") || "").trim();
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : [];
    const dueFrom = (
      url.searchParams.get("due_from") ||
      url.searchParams.get("invoice_due_from") ||
      ""
    ).trim();
    const dueTo = (
      url.searchParams.get("due_to") ||
      url.searchParams.get("invoice_due_to") ||
      ""
    ).trim();
    const includeItems =
      (url.searchParams.get("include_items") || "").trim().toLowerCase() ===
        "true" || !!invoiceId;

    const result = await runWithAuth(
      session.user.authUserId,
      async (client) => {
        const actor = await resolveActorContext(client, session.user.authUserId as string);
        if (!actor?.institution_id) return { error: "user_not_linked" as const };
        const allowed = await hasPermission(client, actor, "view_invoices");
        if (!allowed) return { error: "missing_permission:view_invoices" as const };
        const isSuperAdmin = String(actor.role || "").trim().toLowerCase() === "super_admin";
        if (!isSuperAdmin && !actor.branch_id) return { error: "actor_branch_missing" as const };

        let where =
          "i.institution_id = $1";
        const params: unknown[] = [actor.institution_id];
        let idx = 2;

        if (!isSuperAdmin) {
          where += ` AND i.branch_id = $${idx++}`;
          params.push(actor.branch_id);
        } else if (selectedBranchIds.length > 0) {
          where += ` AND i.branch_id = ANY($${idx++}::uuid[])`;
          params.push(selectedBranchIds);
        }

        if (invoiceId) {
          where += ` AND i.id = $${idx++}`;
          params.push(invoiceId);
        }
        if (clientId) {
          where += ` AND (i.member_id = $${idx} OR i.client_id = $${idx})`;
          params.push(clientId);
          idx++;
        }
        if (status) {
          where += ` AND LOWER(i.status) = LOWER($${idx++})`;
          params.push(status);
        }
        if (invoiceType) {
          where += ` AND LOWER(i.invoice_type) = LOWER($${idx++})`;
          params.push(invoiceType);
        }
        if (targetType === "member") {
          where += ` AND i.member_id IS NOT NULL AND i.client_id IS NULL`;
        } else if (targetType === "client") {
          where += ` AND i.client_id IS NOT NULL AND i.member_id IS NULL`;
        }
        if (dateFrom) {
          where += ` AND i.invoice_date >= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`;
          params.push(dateFrom);
          idx++;
        }
        if (dateTo) {
          where += ` AND i.invoice_date <= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`;
          params.push(dateTo);
          idx++;
        }
        if (dueFrom) {
          where += ` AND i.invoice_due >= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`;
          params.push(dueFrom);
          idx++;
        }
        if (dueTo) {
          where += ` AND i.invoice_due <= (($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')::date)`;
          params.push(dueTo);
          idx++;
        }
        if (search) {
          where += ` AND (
          i.invoice_number ILIKE $${idx}
          OR i.inwords ILIKE $${idx}
          OR m.full_name ILIKE $${idx}
          OR m.member_number ILIKE $${idx}
          OR c.name ILIKE $${idx}
        )`;
          params.push(`%${search}%`);
          idx++;
        }

        const countRes = await client.query<{ c: number }>(
          `SELECT COUNT(*)::int AS c
         FROM senteloans_invoices i
         LEFT JOIN senteloans_members m ON m.id = i.member_id
         LEFT JOIN senteloans_clients c ON c.id = i.client_id
         WHERE ${where}`,
          params,
        );
        const total = Number(countRes.rows[0]?.c || 0);

        const from = (page - 1) * pageSize;
        const dataParams = [...params, pageSize, from];
        const dataRes = await client.query<InvoiceRow>(
          `SELECT
          i.id, i.institution_id, i.member_id, i.client_id, i.branch_id, i.invoice_number, i.invoice_date, i.invoice_due,
          i.subtotal, i.vat, i.total_amount, i.inwords, i.invoice_type, i.status,
          i.created_by, i.created_at, i.modified_by, i.updated_at
         FROM senteloans_invoices i
         LEFT JOIN senteloans_members m ON m.id = i.member_id
         LEFT JOIN senteloans_clients c ON c.id = i.client_id
         LEFT JOIN senteloans_users u ON u.id = i.created_by
         WHERE ${where}
         ORDER BY i.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
          dataParams,
        );

        const invoices = dataRes.rows;
        const clientIds = [
          ...new Set(invoices.map((i) => i.member_id).filter(Boolean)),
        ];
        let clientMap: Record<
          string,
          { name: string; client_number: string | null }
        > = {};

        if (clientIds.length > 0) {
          const clientsRes = await client.query<{
            id: string;
            full_name: string;
            member_number: string | null;
          }>(
            `SELECT id, full_name, member_number FROM senteloans_members WHERE id = ANY($1::uuid[])`,
            [clientIds],
          );
          clientMap = Object.fromEntries(
            clientsRes.rows.map((c) => [
              c.id,
              { name: c.full_name, client_number: c.member_number },
            ]),
          );
        }

        const externalClientIds = [...new Set(invoices.map((i) => i.client_id).filter(Boolean))];
        let externalClientMap: Record<string, { name: string }> = {};
        if (externalClientIds.length > 0) {
          const extClientsRes = await client.query<{ id: string; name: string }>(
            `SELECT id, name FROM senteloans_clients WHERE id = ANY($1::uuid[])`,
            [externalClientIds],
          );
          externalClientMap = Object.fromEntries(
            extClientsRes.rows.map((c) => [c.id, { name: c.name }]),
          );
        }

        const userIds = invoices.map(i => i.created_by).filter(Boolean);
        let userMap: Record<string, { full_name: string }> = {};

        if (userIds.length > 0) {
          const usersRes = await client.query<{ id: string; full_name: string }>(
            `SELECT id, full_name FROM senteloans_users WHERE id = ANY($1::uuid[])`,
            [userIds],
          );
          userMap = Object.fromEntries(
            usersRes.rows.map(u => [u.id, { full_name: u.full_name }])
          );
        }

        const invoiceIds = invoices.map((i) => i.id);
        let itemsMap: Record<string, InvoiceItemRow[]> = {};

        if (includeItems && invoiceIds.length > 0) {
          const itemsRes = await client.query<InvoiceItemRow>(
            `SELECT id, invoice_id, unit, description, quantity, unit_price, total_price, vatinclusive
           FROM senteloans_invoice_items
           WHERE invoice_id = ANY($1::uuid[])
           ORDER BY id ASC`,
            [invoiceIds],
          );
          itemsMap = itemsRes.rows.reduce<Record<string, InvoiceItemRow[]>>(
            (acc, row) => {
              if (!acc[row.invoice_id]) acc[row.invoice_id] = [];
              acc[row.invoice_id].push(row);
              return acc;
            },
            {},
          );
        }

        const mapped = invoices.map((row) => ({
          id: row.id,
          institution_id: row.institution_id,
          client_id: row.client_id,
          member_id: row.member_id,
          target_type: row.member_id ? "member" : "client",
          client_name: row.member_id
            ? clientMap[row.member_id]?.name || ""
            : externalClientMap[row.client_id || ""]?.name || "",
          client_number: clientMap[row.member_id]?.client_number || null,
          staff_name: userMap[row.created_by]?.full_name || "",
          invoice_number: row.invoice_number,
          invoice_date: row.invoice_date,
          invoice_due: row.invoice_due,
          subtotal: Number(row.subtotal || 0),
          vat: Number(row.vat || 0),
          total_amount: Number(row.total_amount || 0),
          inwords: row.inwords || "",
          invoice_type: row.invoice_type,
          status: row.status,
          created_by: row.created_by,
          created_at: row.created_at,
          modified_by: row.modified_by,
          updated_at: row.updated_at,
          items: includeItems
            ? (itemsMap[row.id] || []).map((it) => ({
                id: it.id,
                invoice_id: it.invoice_id,
                unit: it.unit,
                description: it.description,
                quantity: Number(it.quantity || 0),
                unit_price: Number(it.unit_price || 0),
                total_price: Number(it.total_price || 0),
                vatinclusive: Boolean(it.vatinclusive),
              }))
            : undefined,
        }));

        return { items: mapped, total, page, pageSize };
      },
    );

    if (result && "error" in result) {
      const statusCode =
        result.error === "missing_permission:view_invoices" || result.error === "user_not_linked" ? 403 : 400;
      apiLog("warn", "invoices.list.denied", { method: "GET", apiPath, status: statusCode, error: result.error, authUserId: session.user.authUserId });
      return NextResponse.json({ error: result.error }, { status: statusCode });
    }

    apiLog("info", "invoices.list.success", { method: "GET", apiPath, status: 200, count: result.items?.length || 0, authUserId: session.user.authUserId });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const err = e as Error;
    apiLog("error", "invoices.list.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" });
    return NextResponse.json(
      { error: err?.message || "Unexpected error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const apiPath = getApiPath(req);
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.authUserId)
      apiLog("warn", "invoices.create.denied", { method: "POST", apiPath, status: 401, error: "unauthorized" });
    if (!session?.user?.authUserId)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (session.user.type !== "staff")
      apiLog("warn", "invoices.create.denied", { method: "POST", apiPath, status: 403, error: "not_staff", authUserId: session.user.authUserId });
    if (session.user.type !== "staff")
      return NextResponse.json({ error: "not_staff" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const memberId = String(body.member_id || "").trim();
    const clientId = String(body.client_id || "").trim();
    const invoiceDate = normalizeDate(body.invoice_date);
    const invoiceDue = normalizeDate(body.invoice_due);
    const status = normalizeStatusInput(body.status);
    if (!allowedStatuses.has(status)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }
    const inwords = typeof body.inwords === "string" ? body.inwords.trim() : "";
    const invoiceType =
      typeof body.invoice_type === "string" ? body.invoice_type.trim() : "";
    const items = Array.isArray(body.items)
      ? (body.items as Array<Record<string, unknown>>)
      : [];

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
    if (invoiceType.length > 10)
      return NextResponse.json(
        { error: "invalid_invoice_type" },
        { status: 400 },
      );
    if (items.length === 0)
      return NextResponse.json({ error: "items_required" }, { status: 400 });

    const result = await runWithAuth(
      session.user.authUserId,
      async (client) => {
        const actor = await resolveActorContext(client, session.user.authUserId as string);
        if (!actor) return { error: "user_not_linked" as const };
        const allowed = await hasPermission(client, actor, "add_invoice");
        if (!allowed) return { error: "missing_permission:add_invoice" as const };
        if (!actor.branch_id) return { error: "actor_branch_missing" as const };

        if (memberId) {
          const memberRes = await client.query<{ id: string }>(
            `SELECT id FROM senteloans_members WHERE id = $1 AND institution_id = $2`,
            [memberId, actor.institution_id],
          );
          if (memberRes.rows.length === 0) return { error: "member_not_found" as const };
        } else {
          const extClientRes = await client.query<{ id: string }>(
            `SELECT id FROM senteloans_clients WHERE id = $1 AND institution_id = $2`,
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
          const invoiceNumber = await generateInvoiceNumber(
            client as any,
            invoiceDate,
          );
          const insertInvoiceRes = await client.query<{
            id: string;
            invoice_number: string;
          }>(
            `INSERT INTO senteloans_invoices (
            institution_id, branch_id, member_id, client_id, invoice_number, invoice_date, invoice_due,
            subtotal, vat, total_amount, inwords, invoice_type, status,
            created_by
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11, $12,
            $13, $14
          ) RETURNING id, invoice_number`,
            [
              actor.institution_id,
              actor.branch_id,
              memberId || null,
              clientId || null,
              invoiceNumber,
              invoiceDate,
              invoiceDue,
              computedSubtotal,
              round2(vat),
              totalAmount,
              inwords,
              invoiceType,
              status,
              actor.id,
            ],
          );

          const invoice = insertInvoiceRes.rows[0];
          for (const item of normalizedItems) {
            await client.query(
              `INSERT INTO senteloans_invoice_items (
              invoice_id, unit, description, quantity, unit_price, total_price, vatinclusive
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                invoice.id,
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
          await client.query(
            `INSERT INTO senteloans_audit_logs
              (institution_id, branch_id, user_id, table_name, operation, record_id, new_values)
             VALUES ($1, $2, $3, 'senteloans_invoices', 'INSERT', $4, $5)`,
            [
              actor.institution_id,
              actor.branch_id,
              actor.id,
              invoice.id,
              JSON.stringify({
                member_id: memberId || null,
                client_id: clientId || null,
                invoice_number: invoice.invoice_number,
                invoice_date: invoiceDate,
                invoice_due: invoiceDue,
                status,
                invoice_type: invoiceType,
                subtotal: computedSubtotal,
                vat: round2(vat),
                total_amount: totalAmount,
                item_count: normalizedItems.length,
              }),
            ],
          );
          return {
            ok: true,
            id: invoice.id,
            invoice_number: invoice.invoice_number,
          };
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      },
    );

    if (result && "error" in result) {
      const statusCode =
        result.error === "member_not_found" || result.error === "client_not_found"
          ? 404
          : result.error === "user_not_linked" || result.error === "missing_permission:add_invoice"
            ? 403
            : 400;
      apiLog("warn", "invoices.create.denied", { method: "POST", apiPath, status: statusCode, error: result.error, authUserId: session.user.authUserId });
      return NextResponse.json({ error: result.error }, { status: statusCode });
    }

    apiLog("info", "invoices.create.success", { method: "POST", apiPath, status: 201, invoiceId: result.id, authUserId: session.user.authUserId });
    return NextResponse.json(result, { status: 201 });
  } catch (e: unknown) {
    const err = e as Error;
    if (
      err.message.includes("duplicate key value") &&
      err.message.includes("invoice_number")
    ) {
      return NextResponse.json(
        { error: "invoice_number_conflict" },
        { status: 409 },
      );
    }
    apiLog("error", "invoices.create.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" });
    return NextResponse.json(
      { error: err?.message || "Unexpected error" },
      { status: 500 },
    );
  }
}
