import { NextResponse } from "next/server";
import { runWithAuth } from "@/lib/db";
import { apiLog, getApiPath } from "@/lib/api/api-log";
import { expenseFundingStatusBlock } from "@/lib/api/expense-funding-guard";
import {
  createExpenseFundingSource,
  isExpenseFundingSourceType,
} from "@/lib/expenses/create-expense";
import { requireStaffSession } from "@/lib/api/rbac";
import {
  assertExpenseWriteAccess,
  expenseScopeWhere,
  mapExpenseMutationErrorResponse,
} from "@/lib/api/expense-access";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const apiPath = getApiPath(req);
  const { id: expenseId } = await params;
  if (!expenseId) {
    return NextResponse.json({ error: "id_required" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const sourceType = String(body.type || body.source_type || "")
    .trim()
    .toLowerCase();
  const amount = Number(body.amount ?? 0);
  const loanIdRaw = body.loanId ?? body.loan_id;
  const loanId =
    loanIdRaw != null && String(loanIdRaw).trim() !== ""
      ? String(loanIdRaw).trim()
      : null;

  if (!isExpenseFundingSourceType(sourceType)) {
    return NextResponse.json(
      { error: "invalid_funding_type" },
      { status: 400 },
    );
  }
  if (Number.isNaN(amount) || amount <= 0) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }
  if (sourceType === "loan" && !loanId) {
    return NextResponse.json({ error: "loan_id_required" }, { status: 400 });
  }

  try {
    const sess = await requireStaffSession();
    if (!sess.ok) {
      apiLog("warn", "expenses.funding.create.denied", {
        method: "POST",
        apiPath,
        status: sess.status,
        error: sess.error,
      });
      return NextResponse.json({ error: sess.error }, { status: sess.status });
    }

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const access = await assertExpenseWriteAccess(client, sess.authUserId, "add_expense_funding");
      if (!access.ok) {
        return {
          error: access.error,
          message: access.message,
          staffStatus: access.staffStatus,
          branchStatus: access.branchStatus,
        };
      }
      const { actor } = access;

      const { where, values } = expenseScopeWhere(actor, expenseId);
      const ex = await client.query<{
        id: string;
        status: string;
        branch_id: string;
      }>(
        `SELECT e.id, e.status, e.branch_id FROM expenses e WHERE ${where} LIMIT 1`,
        values,
      );
      const expense = ex.rows[0];
      if (!expense) return { error: "not_found" as const };
      const expenseBranchId = String(expense.branch_id || "");
      const blocked = expenseFundingStatusBlock(String(expense.status || ""));
      if (blocked) return blocked;

      if (sourceType === "loan" && loanId) {
        const lr = await client.query(
          `SELECT id FROM institution_loans
           WHERE id = $1::uuid AND institution_id = $2::uuid
           LIMIT 1`,
          [loanId, actor.institution_id],
        );
        if ((lr.rowCount ?? 0) === 0) return { error: "invalid_loan" as const };
      }

      try {
        const created = await createExpenseFundingSource(
          client,
          {
            expenseId,
            sourceType,
            amount,
            loanId: sourceType === "loan" ? loanId : null,
          },
          { actor, branchId: expenseBranchId },
        )
        return {
          id: created.id,
          source_type: created.sourceType,
          loan_id: created.loanId,
          amount: created.amount,
          created_at: created.createdAt ?? "",
        }
      } catch {
        return { error: "insert_failed" as const }
      }
    });

    if (result && "error" in result) {
      const code = String(result.error || "");
      const { status, body } = mapExpenseMutationErrorResponse(
        {
          error: code,
          message: "message" in result ? String(result.message || "") : undefined,
          staffStatus: "staffStatus" in result ? result.staffStatus : undefined,
          branchStatus: "branchStatus" in result ? result.branchStatus : undefined,
        },
        {
          expense_already_completed: 409,
          expense_already_rejected: 409,
          insert_failed: 500,
        },
      );
      apiLog("warn", "expenses.funding.create.denied", {
        method: "POST",
        apiPath,
        status,
        error: code,
      });
      return NextResponse.json(body, { status });
    }

    apiLog("info", "expenses.funding.create.success", {
      method: "POST",
      apiPath,
      status: 201,
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (e: unknown) {
    const err = e as Error;
    apiLog("error", "expenses.funding.create.error", {
      method: "POST",
      apiPath,
      status: 500,
      error: err?.message || "Unexpected error",
    });
    return NextResponse.json(
      { error: err?.message || "Unexpected error" },
      { status: 500 },
    );
  }
}
