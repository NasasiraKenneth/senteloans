import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runWithAuth, runWithoutAuth } from "@/lib/db";
import { apiLog, getApiPath } from "@/lib/api/api-log";
import {
  assertNotSuperAdmin,
  hasPermission,
  isSuperAdmin,
  resolveActorContext,
} from "@/lib/api/rbac";
import { enqueueInvoiceSentEmail } from "@/lib/email/invoice-emails";
import { createInvoiceWithItems } from "@/lib/invoices/create-invoice";
import { resolveInvoiceBranchId } from "@/lib/invoices/resolve-invoice-branch";
import {
  expandStatusFilter,
  isAllowedInvoiceStatus,
  normalizeInvoiceStatus,
  normalizeTargetTypeFilter,
} from "@/lib/invoices/status";
import { notifyInvoiceCreated } from "@/lib/notifications/invoice-events";
import { assertBranchActive } from "@/lib/branches/branch-status"
import { assertActorActive } from "@/lib/staff/staff-status"

type InvoiceCreatePostCommit = {
  actorId: string;
  institutionId: string;
  branchId: string;
  institutionName: string;
  currency: string;
  status: string;
  invoice: {
    id: string;
    invoice_number: string;
    total_amount: number;
    invoice_due: string | null;
    status: string;
  };
  member?: {
    id: string;
    full_name: string;
    member_number: string;
    email: string;
  } | null;
  thirdPartyAgent?: {
    id: string;
    name: string;
  } | null;
};

type InvoiceRow = {
  id: string;
  institution_id: string;
  member_id: string | null;
  third_party_agent_id: string | null;
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

type InvoicePaymentListRow = {
  id: string;
  invoice_id: string;
  amount: string | number;
  payment_date: string;
  transaction_number: string | null;
  mode: string | null;
  reference_number: string | null;
  processed_by_name: string | null;
  source: string;
};

const normalizeDate = (value: unknown): string | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
};

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

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
    const targetType = normalizeTargetTypeFilter(url.searchParams.get("target_type") || "");
    const search = (url.searchParams.get("search") || "").trim();
    const thirdPartyAgentId = (url.searchParams.get("third_party_agent_id") || "").trim();
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
    const includePayments =
      (url.searchParams.get("include_payments") || "").trim().toLowerCase() ===
      "true";

    const result = await runWithAuth(
      session.user.authUserId,
      async (client) => {
        const actor = await resolveActorContext(client, session.user.authUserId as string);
        if (!actor?.institution_id) return { error: "user_not_linked" as const };
        const allowed = await hasPermission(client, actor, "view_invoices");
        if (!allowed) return { error: "missing_permission:view_invoices" as const };
        const isSuperAdminActor = isSuperAdmin(actor);
        if (!isSuperAdminActor && !actor.branch_id) return { error: "actor_branch_missing" as const };

        let where =
          "i.institution_id = $1";
        const params: unknown[] = [actor.institution_id];
        let idx = 2;

        if (!isSuperAdminActor) {
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
        if (thirdPartyAgentId) {
          where += ` AND (i.member_id = $${idx} OR i.third_party_agent_id = $${idx})`;
          params.push(thirdPartyAgentId);
          idx++;
        }
        if (status) {
          const statusValues = expandStatusFilter(status);
          if (statusValues.length === 1) {
            where += ` AND LOWER(i.status) = LOWER($${idx++})`;
            params.push(statusValues[0]);
          } else if (statusValues.length > 1) {
            where += ` AND LOWER(i.status) = ANY($${idx++}::text[])`;
            params.push(statusValues.map((s) => s.toLowerCase()));
          }
        }
        if (invoiceType) {
          where += ` AND LOWER(i.invoice_type) = LOWER($${idx++})`;
          params.push(invoiceType);
        }
        if (targetType === "member") {
          where += ` AND i.member_id IS NOT NULL AND i.third_party_agent_id IS NULL`;
        } else if (targetType === "third_party_agent") {
          where += ` AND i.third_party_agent_id IS NOT NULL AND i.member_id IS NULL`;
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
         FROM invoices i
         LEFT JOIN members m ON m.id = i.member_id
         LEFT JOIN third_party_agents c ON c.id = i.third_party_agent_id
         WHERE ${where}`,
          params,
        );
        const total = Number(countRes.rows[0]?.c || 0);

        const from = (page - 1) * pageSize;
        const dataParams = [...params, pageSize, from];
        const dataRes = await client.query<InvoiceRow>(
          `SELECT
          i.id, i.institution_id, i.member_id, i.third_party_agent_id, i.branch_id, i.invoice_number, i.invoice_date, i.invoice_due,
          i.subtotal, i.vat, i.total_amount, i.inwords, i.invoice_type, i.status,
          i.created_by, i.created_at, i.modified_by, i.updated_at
         FROM invoices i
         LEFT JOIN members m ON m.id = i.member_id
         LEFT JOIN third_party_agents c ON c.id = i.third_party_agent_id
         LEFT JOIN users u ON u.id = i.created_by
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
            `SELECT id, full_name, member_number FROM members WHERE id = ANY($1::uuid[])`,
            [clientIds],
          );
          clientMap = Object.fromEntries(
            clientsRes.rows.map((c) => [
              c.id,
              { name: c.full_name, client_number: c.member_number },
            ]),
          );
        }

        const externalClientIds = [...new Set(invoices.map((i) => i.third_party_agent_id).filter(Boolean))];
        let externalClientMap: Record<string, { name: string }> = {};
        if (externalClientIds.length > 0) {
          const extClientsRes = await client.query<{ id: string; name: string }>(
            `SELECT id, name FROM third_party_agents WHERE id = ANY($1::uuid[])`,
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
            `SELECT id, full_name FROM users WHERE id = ANY($1::uuid[])`,
            [userIds],
          );
          userMap = Object.fromEntries(
            usersRes.rows.map(u => [u.id, { full_name: u.full_name }])
          );
        }

        const invoiceIds = invoices.map((i) => i.id);
        let paidMap: Record<string, number> = {};
        if (invoiceIds.length > 0) {
          const paidRes = await client.query<{ invoice_id: string; paid: string }>(
            `SELECT invoice_id, COALESCE(SUM(amount), 0)::numeric AS paid
               FROM invoice_payments
              WHERE invoice_id = ANY($1::uuid[])
              GROUP BY invoice_id`,
            [invoiceIds],
          );
          paidMap = Object.fromEntries(
            paidRes.rows.map((r) => [r.invoice_id, Number(r.paid || 0)]),
          );
        }

        let itemsMap: Record<string, InvoiceItemRow[]> = {};

        if (includeItems && invoiceIds.length > 0) {
          const itemsRes = await client.query<InvoiceItemRow>(
            `SELECT id, invoice_id, unit, description, quantity, unit_price, total_price, vatinclusive
           FROM invoice_items
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

        let paymentsMap: Record<string, InvoicePaymentListRow[]> = {};
        if (includePayments && invoiceIds.length > 0) {
          const paymentsRes = await client.query<InvoicePaymentListRow>(
            `SELECT
               ip.id,
               ip.invoice_id,
               ip.amount,
               ip.payment_date,
               COALESCE(t.transaction_number, mt.transaction_number) AS transaction_number,
               COALESCE(t.mode, mt.mode) AS mode,
               COALESCE(t.reference_number, mt.reference_number) AS reference_number,
               u.full_name AS processed_by_name,
               CASE
                 WHEN ip.membership_fee_id IS NOT NULL THEN 'membership_fee'
                 ELSE 'transaction'
               END AS source
             FROM invoice_payments ip
             LEFT JOIN transactions t ON t.id = ip.transaction_id
             LEFT JOIN membership_fees mf ON mf.id = ip.membership_fee_id
             LEFT JOIN transactions mt ON mt.id = mf.transaction_id AND ip.transaction_id IS NULL
             LEFT JOIN users u ON u.id = ip.processed_by
             WHERE ip.invoice_id = ANY($1::uuid[])
             ORDER BY ip.payment_date ASC, ip.created_at ASC`,
            [invoiceIds],
          );
          paymentsMap = paymentsRes.rows.reduce<Record<string, InvoicePaymentListRow[]>>(
            (acc, row) => {
              if (!acc[row.invoice_id]) acc[row.invoice_id] = [];
              acc[row.invoice_id].push(row);
              return acc;
            },
            {},
          );
        }

        const mapped = invoices.map((row) => {
          const total = Number(row.total_amount || 0);
          const paid_amount = paidMap[row.id] ?? 0;
          const outstanding = Math.max(total - paid_amount, 0);
          const customerName = row.member_id
            ? clientMap[row.member_id]?.name || ""
            : externalClientMap[row.third_party_agent_id || ""]?.name || "";
          return {
          id: row.id,
          institution_id: row.institution_id,
          third_party_agent_id: row.third_party_agent_id,
          member_id: row.member_id,
          target_type: row.member_id ? "member" : "third_party_agent",
          customer_name: customerName,
          client_name: customerName,
          third_party_agent_name: row.member_id
            ? ""
            : externalClientMap[row.third_party_agent_id || ""]?.name || "",
          client_number: row.member_id ? clientMap[row.member_id]?.client_number || null : null,
          staff_name: userMap[row.created_by]?.full_name || "",
          invoice_number: row.invoice_number,
          invoice_date: row.invoice_date,
          invoice_due: row.invoice_due,
          subtotal: Number(row.subtotal || 0),
          vat: Number(row.vat || 0),
          total_amount: total,
          paid_amount,
          outstanding,
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
          payments: includePayments
            ? (paymentsMap[row.id] || []).map((p) => ({
                id: p.id,
                amount: Number(p.amount || 0),
                payment_date: p.payment_date,
                transaction_number: p.transaction_number,
                mode: p.mode,
                reference_number: p.reference_number,
                processed_by_name: p.processed_by_name,
                source: p.source,
              }))
            : undefined,
        };
        });

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
    const items = Array.isArray(body.items)
      ? (body.items as Array<Record<string, unknown>>)
      : [];

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

        const staffCheck = await assertActorActive(client, actor)
        if (!staffCheck.ok) {
          return {
            error: staffCheck.error,
            staffStatus: staffCheck.error === "staff_inactive" ? staffCheck.status : undefined,
          }
        }

        const writeGuard = assertNotSuperAdmin(actor);
        if (!writeGuard.ok) {
          return { error: writeGuard.error, message: writeGuard.message };
        }

        const allowed = await hasPermission(client, actor, "add_invoice");
        if (!allowed) return { error: "missing_permission:add_invoice" as const };

        let memberRow: {
          id: string;
          full_name: string;
          member_number: string;
          email: string | null;
        } | null = null;
        let thirdPartyAgentRow: { id: string; name: string } | null = null;

        if (memberId) {
          const memberRes = await client.query<{
            id: string;
            full_name: string;
            member_number: string;
            email: string | null;
          }>(
            `SELECT id, full_name, member_number, email
             FROM members WHERE id = $1 AND institution_id = $2`,
            [memberId, actor.institution_id],
          );
          if (memberRes.rows.length === 0) return { error: "member_not_found" as const };
          memberRow = memberRes.rows[0];
        } else {
          const extClientRes = await client.query<{ id: string; name: string }>(
            `SELECT id, name FROM third_party_agents WHERE id = $1 AND institution_id = $2`,
            [thirdPartyAgentId, actor.institution_id],
          );
          if (extClientRes.rows.length === 0) return { error: "third_party_agent_not_found" as const };
          thirdPartyAgentRow = extClientRes.rows[0];
        }

        const branchId = await resolveInvoiceBranchId(
          client,
          actor.institution_id,
          actor.branch_id,
          memberId || undefined,
          thirdPartyAgentId || undefined,
        );
        if (!branchId) return { error: "actor_branch_missing" as const };

        const branchCheck = await assertBranchActive(client, branchId)
        if (!branchCheck.ok) {
          return {
            error: branchCheck.error as "branch_not_found" | "branch_inactive",
            branchStatus:
              branchCheck.error === "branch_inactive" ? branchCheck.status : undefined,
          }
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

        const vat = Math.max(0, Number(body.vat || 0));

        await client.query("BEGIN");
        try {
          const invoice = await createInvoiceWithItems(client, {
            institutionId: actor.institution_id,
            branchId,
            createdBy: actor.id,
            invoiceDate,
            invoiceDue,
            invoiceType,
            status,
            inwords: inwords || undefined,
            vat,
            items: normalizedItems,
            target: memberId
              ? { member_id: memberId }
              : { third_party_agent_id: thirdPartyAgentId },
          });

          let postCommit: InvoiceCreatePostCommit | null = null;

          if (status === "draft" || status === "sent") {
            const instRes = await client.query<{ name: string }>(
              `SELECT name FROM institutions WHERE id = $1`,
              [actor.institution_id],
            );
            const currencyRes = await client.query<{ currency: string | null }>(
              `SELECT currency FROM config WHERE branch_id = $1 LIMIT 1`,
              [branchId],
            );
            postCommit = {
              actorId: actor.id,
              institutionId: actor.institution_id,
              branchId,
              institutionName: instRes.rows[0]?.name || "",
              currency: currencyRes.rows[0]?.currency || "UGX",
              status,
              invoice: {
                id: invoice.id,
                invoice_number: invoice.invoice_number,
                total_amount: invoice.total_amount,
                invoice_due: invoice.invoice_due,
                status,
              },
              member: memberRow
                ? {
                    id: memberRow.id,
                    full_name: String(memberRow.full_name || ""),
                    member_number: String(memberRow.member_number || ""),
                    email: memberRow.email ? String(memberRow.email) : "",
                  }
                : null,
              thirdPartyAgent: thirdPartyAgentRow
                ? {
                    id: thirdPartyAgentRow.id,
                    name: String(thirdPartyAgentRow.name || ""),
                  }
                : null,
            };
          }

          await client.query("COMMIT");
          return {
            ok: true,
            id: invoice.id,
            invoice_number: invoice.invoice_number,
            postCommit,
          };
        } catch (error) {
          await client.query("ROLLBACK");
          const message = error instanceof Error ? error.message : "";
          if (message === "invoice_number_generation_failed") {
            return { error: "invoice_number_generation_failed" as const };
          }
          if (message === "invoice_items_invalid" || message === "invoice_items_required") {
            return { error: "invalid_items" as const };
          }
          throw error;
        }
      },
    );

    if (result && "error" in result) {
      const errorCode = String(result.error || "")
      const statusCode =
        errorCode === "member_not_found" || errorCode === "third_party_agent_not_found"
          ? 404
          : errorCode === "user_not_linked" ||
              errorCode === "missing_permission:add_invoice" ||
              errorCode === "super_admin_write_blocked"
            ? 403
            : errorCode === "invoice_number_generation_failed"
              ? 500
              : 400;
      apiLog(
        statusCode >= 500 ? "error" : "warn",
        "invoices.create.denied",
        { method: "POST", apiPath, status: statusCode, error: result.error, authUserId: session.user.authUserId },
      );
      return NextResponse.json({ error: result.error }, { status: statusCode });
    }

    apiLog("info", "invoices.create.success", { method: "POST", apiPath, status: 201, invoiceId: result.id, authUserId: session.user.authUserId });

    const ctx = "postCommit" in result ? result.postCommit : null;
    if (ctx) {
      try {
        const notifyRes = await runWithoutAuth((notifyClient) =>
          notifyInvoiceCreated({
            client: notifyClient,
            actor: {
              id: ctx.actorId,
              institution_id: ctx.institutionId,
              branch_id: ctx.branchId,
            },
            invoice: ctx.invoice,
            member: ctx.member
              ? {
                  id: ctx.member.id,
                  full_name: ctx.member.full_name,
                  member_number: ctx.member.member_number,
                }
              : null,
            thirdPartyAgent: ctx.thirdPartyAgent,
            currency: ctx.currency,
          }),
        );
        apiLog(
          notifyRes.ok ? "info" : "warn",
          notifyRes.ok
            ? "invoices.create.notifications_dispatched"
            : "invoices.create.notifications_partial",
          {
            method: "POST",
            apiPath,
            status: 201,
            invoiceId: result.id,
            memberNotifications: notifyRes.memberNotifications,
            staffNotifications: notifyRes.staffNotifications,
            ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
          },
        );
      } catch (notifyErr) {
        apiLog("error", "invoices.create.notifications_failed", {
          method: "POST",
          apiPath,
          status: 201,
          invoiceId: result.id,
          error: (notifyErr as Error)?.message || "notify_failed",
        });
      }

      if (ctx.invoice.status === "sent" && ctx.member) {
        try {
          const emailRes = await enqueueInvoiceSentEmail({
            member: ctx.member,
            institutionName: ctx.institutionName,
            currency: ctx.currency,
            invoice: {
              id: ctx.invoice.id,
              invoice_number: ctx.invoice.invoice_number,
              total_amount: ctx.invoice.total_amount,
              invoice_due: ctx.invoice.invoice_due,
            },
            context: {
              institutionId: ctx.institutionId,
              branchId: ctx.branchId,
              actorId: ctx.actorId,
            },
          });
          apiLog(
            emailRes.errors.length ? "warn" : "info",
            emailRes.errors.length
              ? "invoices.create.email_enqueue_partial"
              : "invoices.create.email_enqueued",
            {
              method: "POST",
              apiPath,
              status: 201,
              invoiceId: result.id,
              enqueued: emailRes.enqueued,
              skipped: emailRes.skipped,
              ...(emailRes.errors.length ? { errors: emailRes.errors } : {}),
            },
          );
        } catch (emailErr) {
          apiLog("error", "invoices.create.email_enqueue_failed", {
            method: "POST",
            apiPath,
            status: 201,
            invoiceId: result.id,
            error: (emailErr as Error)?.message || "email_enqueue_failed",
          });
        }
      }
    }

    const { postCommit: _postCommit, ...responseBody } = result;
    return NextResponse.json(responseBody, { status: 201 });
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
