import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth, runWithoutAuth } from "@/lib/db"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { createTransaction } from "@/lib/transactions/create-transaction"
import {
  assertNotSuperAdmin,
  requireStaffSession,
  resolveActorContext,
  hasPermission,
  scopeWhere,
  isSuperAdmin,
  normalizeRole,
} from "@/lib/api/rbac"
import { decodeCursor, encodeCursor } from "@/lib/api/keyset"
import { isBankRoutedPaymentMode } from "@/lib/finances/payment-mode"
import {
  PaymentSettlementFailure,
  settlePaymentByMode,
  validatePaymentModeInput,
} from "@/lib/finances/settle-payment-mode"
import { assertBranchActive } from "@/lib/branches/branch-status"
import { assertMemberActive } from "@/lib/members/member-status"
import { assertActorActive } from "@/lib/staff/staff-status"
import {
  assertSavingsAccountActive,
  savingsAccountWriteGateHttpStatus,
} from "@/lib/savings/savings-account-status"
import { createExpense, createExpenseCashflow, createExpensePayment } from "@/lib/expenses/create-expense"
import { notifySavingsTransaction } from "@/lib/notifications/transaction-events"
import type { SavingsTransactionType } from "@/lib/notifications/transaction-events"
import { enqueueSavingsTransactionEmails } from "@/lib/email/transaction-emails"

export async function GET(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const sess = await requireStaffSession()
    if (!sess.ok) {
      apiLog("warn", "transactions.list.denied", { method: "GET", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: sess.error }, { status: sess.status })
    }

    const url = new URL(req.url)
    const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1)
    const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") || "10", 10), 1), 100)
    const cursor = decodeCursor(url.searchParams.get("cursor"))
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "", 10) || pageSize, 1), 100)
    const type = (url.searchParams.get("type") || "").trim()
    const txKind = (url.searchParams.get("tx_kind") || "").trim().toLowerCase()
    const savingsOnly = ["1", "true", "yes"].includes((url.searchParams.get("savings_only") || "").trim().toLowerCase())
    const includeSummary = ["1", "true", "yes"].includes((url.searchParams.get("include_summary") || "").trim().toLowerCase())
    const mode = (url.searchParams.get("mode") || "").trim()
    const dateFrom = (url.searchParams.get("date_from") || "").trim()
    const dateTo = (url.searchParams.get("date_to") || "").trim()
    const search = (url.searchParams.get("search") || "").trim()
    const memberId = (url.searchParams.get("member_id") || "").trim()
    const clientId = (url.searchParams.get("client_id") || "").trim()
    const thirdPartyAgentId = (url.searchParams.get("third_party_agent_id") || "").trim()
    const agentFilterId = thirdPartyAgentId || clientId
    const branchesRaw = (url.searchParams.get("branches") || "").trim()
    const selectedBranchIds = branchesRaw ? branchesRaw.split(",").map((v) => v.trim()).filter(Boolean) : []

    const result = await runWithAuth(sess.authUserId, async (client) => {
      const actor = await resolveActorContext(client, sess.authUserId)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "view_transactions")
      if (!allowed) return { error: "missing_permission:view_transactions" as const }

      const actorRole = normalizeRole(actor.role)
      if (!isSuperAdmin(actor) && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const scoped = scopeWhere({ tableAlias: "t", actor, selectedBranchIds, startIndex: 1 })
      let where = scoped.where
      const params: unknown[] = [...scoped.values]
      let idx = scoped.nextIndex

      if (memberId) {
        where += ` AND t.member_id = $${idx++}`
        params.push(memberId)
      }
      if (agentFilterId) {
        where += ` AND t.third_party_agent_id = $${idx++}`
        params.push(agentFilterId)
      }
      if (savingsOnly) {
        if (memberId) {
          where += ` AND EXISTS (SELECT 1 FROM savings_accounts sa WHERE sa.id = t.account_id AND sa.member_id = $${idx++})`
          params.push(memberId)
        } else {
          where += ` AND EXISTS (SELECT 1 FROM savings_accounts sa WHERE sa.id = t.account_id)`
        }
      }

      const summaryWhere = where
      const summaryParams = [...params]

      if (txKind === "deposit") {
        where += ` AND t.type IN ('Deposit', 'Opening Balance')`
      } else if (txKind === "withdrawal") {
        where += ` AND t.type = 'Withdrawal'`
      } else if (txKind === "transfer") {
        where += ` AND t.type = 'Transfer'`
      } else if (type) {
        where += ` AND t.type = $${idx++}`
        params.push(type)
      }
      if (mode) {
        where += ` AND t.mode = $${idx++}`
        params.push(mode)
      }
      if (dateFrom) {
        where += ` AND t.transaction_date >= ($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')`
        params.push(dateFrom)
        idx++
      }
      if (dateTo) {
        where += ` AND t.transaction_date <= ($${idx}::timestamp AT TIME ZONE 'Africa/Nairobi')`
        params.push(dateTo)
        idx++
      }
      if (search) {
        where += ` AND (
          t.description ILIKE $${idx}
          OR t.transaction_number ILIKE $${idx}
          OR m.full_name ILIKE $${idx}
          OR m.member_number ILIKE $${idx}
          OR c.name ILIKE $${idx}
          OR su.full_name ILIKE $${idx}
        )`
        params.push(`%${search}%`)
        idx++
      }

      if (cursor) {
        // keyset pagination: created_at desc, id desc
        where += ` AND (t.created_at, t.id) < ($${idx}::timestamptz, $${idx + 1}::uuid)`
        params.push(cursor.t, cursor.id)
        idx += 2
      }

      const countRes = await client.query(
        `SELECT COUNT(*)::int AS c
         FROM transactions t
         LEFT JOIN members m ON m.id = t.member_id
         LEFT JOIN third_party_agents c ON c.id = t.third_party_agent_id
         LEFT JOIN users su ON su.id = t.staff_id
         WHERE ${where}`,
        params
      )
      const total = countRes.rows[0]?.c ?? 0

      const from = (page - 1) * pageSize
      const take = cursor ? limit : pageSize
      if (!cursor) params.push(take, from)
      else params.push(take)
      const dataRes = await client.query(
        `SELECT
           t.id,
           t.member_id,
           t.third_party_agent_id,
           t.account_id,
           t.loan_id,
           t.transaction_number,
           t.type,
           t.amount,
           t.mode,
           t.description,
           t.reference_number,
           t.balance_after,
           t.transaction_date,
           m.full_name AS member_name,
           c.name AS client_name,
           su.full_name AS staff_name
         FROM transactions t
         LEFT JOIN members m ON m.id = t.member_id
         LEFT JOIN third_party_agents c ON c.id = t.third_party_agent_id
         LEFT JOIN users su ON su.id = t.staff_id
         WHERE ${where}
         ORDER BY t.created_at DESC, t.id DESC
         LIMIT $${idx}${cursor ? "" : ` OFFSET $${idx + 1}`}`,
        params
      )
      const data = dataRes.rows

      const accountIds = [...new Set(data.map((r: { account_id: string }) => r.account_id).filter(Boolean))]
      let accountMap: Record<string, string> = {}
      if (accountIds.length > 0) {
        const aRes = await client.query(`SELECT id, account_number FROM savings_accounts WHERE id = ANY($1::uuid[])`, [accountIds])
        accountMap = Object.fromEntries(aRes.rows.map((a: { id: string; account_number: string }) => [a.id, a.account_number]))
      }

      const items = data.map((row: Record<string, unknown>) => ({
        id: row.id,
        transaction_number: row.transaction_number,
        memberName: row.member_name || row.client_name || row.staff_name || "",
        description: row.description || "",
        amount: row.amount,
        mode: row.mode,
        date: row.transaction_date,
        type: row.type,
        balance: row.balance_after,
        accountNumber: accountMap[row.account_id as string] || "",
      }))

      const last = data[data.length - 1] as Record<string, unknown> | undefined
      const nextCursor =
        cursor && last?.created_at && last?.id
          ? encodeCursor({ t: String(last.created_at), id: String(last.id) })
          : !cursor && last?.created_at && last?.id
            ? encodeCursor({ t: String(last.created_at), id: String(last.id) })
            : null

      const recentWhereParts = ["t.institution_id = $1"] as string[]
      const recentParams: unknown[] = [actor.institution_id]
      let ridx = 2
      if (actorRole !== "super_admin") {
        recentWhereParts.push(`t.branch_id = $${ridx}`)
        recentParams.push(actor.branch_id)
        ridx++
      } else if (selectedBranchIds.length > 0) {
        recentWhereParts.push(`t.branch_id = ANY($${ridx}::uuid[])`)
        recentParams.push(selectedBranchIds)
        ridx++
      }

      const recentRes = await client.query(
        `SELECT t.id, t.transaction_number, t.type, t.amount, t.mode, t.balance_after, t.transaction_date, t.account_id, t.member_id, t.third_party_agent_id, t.description, m.full_name AS member_name, c.name AS client_name, su.full_name AS staff_name
         FROM transactions t
         LEFT JOIN members m ON m.id = t.member_id
         LEFT JOIN third_party_agents c ON c.id = t.third_party_agent_id
         LEFT JOIN users su ON su.id = t.staff_id
         WHERE ${recentWhereParts.join(" AND ")}
         ORDER BY t.created_at DESC
         LIMIT 10`,
        recentParams
      )
      const recentTx = recentRes.rows
      const recentAccountIds = [...new Set(recentTx.map((t: { account_id: string }) => t.account_id).filter(Boolean))]
      let recentAccountMap: Record<string, string> = {}
      if (recentAccountIds.length > 0) {
        const raRes = await client.query(`SELECT id, account_number FROM savings_accounts WHERE id = ANY($1::uuid[])`, [recentAccountIds])
        recentAccountMap = Object.fromEntries(raRes.rows.map((a: { id: string; account_number: string }) => [a.id, a.account_number]))
      }
      const recent = recentTx.map((t: Record<string, unknown>) => ({
        id: t.id,
        transaction_number: t.transaction_number,
        type: t.type,
        amount: t.amount,
        mode: t.mode,
        balance: t.balance_after,
        date: t.transaction_date,
        description: t.description || "",
        memberName: t.member_name || t.client_name || t.staff_name || "",
        accountNumber: recentAccountMap[t.account_id as string] || "",
      }))

      let summary: { totalDeposits: number; totalWithdrawals: number; monthlyNet: number } | undefined
      if (includeSummary) {
        const summaryRes = await client.query(
          `SELECT
             COALESCE(SUM(CASE WHEN t.type IN ('Deposit', 'Opening Balance') THEN t.amount::numeric ELSE 0 END), 0) AS total_deposits,
             COALESCE(SUM(CASE WHEN t.type IN ('Withdrawal', 'Transfer') THEN t.amount::numeric ELSE 0 END), 0) AS total_withdrawals,
             COALESCE(SUM(
               CASE
                 WHEN t.transaction_date >= date_trunc('month', timezone('Africa/Nairobi', now()))
                  AND t.transaction_date < date_trunc('month', timezone('Africa/Nairobi', now())) + interval '1 month'
                 THEN CASE
                   WHEN t.type IN ('Deposit', 'Opening Balance') THEN t.amount::numeric
                   WHEN t.type IN ('Withdrawal', 'Transfer') THEN -t.amount::numeric
                   ELSE 0
                 END
                 ELSE 0
               END
             ), 0) AS monthly_net
           FROM transactions t
           LEFT JOIN members m ON m.id = t.member_id
           LEFT JOIN third_party_agents c ON c.id = t.third_party_agent_id
           LEFT JOIN users su ON su.id = t.staff_id
           WHERE ${summaryWhere}`,
          summaryParams,
        )
        const summaryRow = summaryRes.rows[0] as Record<string, unknown> | undefined
        summary = {
          totalDeposits: Number(summaryRow?.total_deposits || 0),
          totalWithdrawals: Number(summaryRow?.total_withdrawals || 0),
          monthlyNet: Number(summaryRow?.monthly_net || 0),
        }
      }

      return { items, total, page, pageSize: take, nextCursor, recentTransactions: recent, summary }
    })

    if (result && "error" in result) {
      const errorCode = String(result.error || "")
      const statusCode =
        errorCode.startsWith("missing_permission:") ? 403 :
        errorCode === "actor_branch_missing" ? 400 :
        errorCode === "no_app_user_profile" ? 403 : 400
      apiLog("warn", "transactions.list.denied", { method: "GET", apiPath, status: statusCode, error: errorCode })
      return NextResponse.json({ error: errorCode }, { status: statusCode })
    }
    apiLog("info", "transactions.list.success", { method: "GET", apiPath, status: 200, page, pageSize })
    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "transactions.list.error", { method: "GET", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const apiPath = getApiPath(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) {
      apiLog("warn", "transactions.create.denied", { method: "POST", apiPath, status: 401, error: "unauthorized" })
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (session.user.type !== "staff") {
      apiLog("warn", "transactions.create.denied", { method: "POST", apiPath, status: 403, error: "no_app_user_profile" })
      return NextResponse.json({ error: "no_app_user_profile" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const member_id = String(body.member_id || body.client_id || "").trim()
    const account_id = String(body.account_id || "").trim()
    const type = body.type as string
    const transferred_to_id = String(body.transferred_to_id || "").trim()
    const amount = Number(body.amount)
    const mode = body.mode as string
    const description = typeof body.description === "string" ? body.description : ""
    const reference_number = typeof body.reference_number === "string" ? body.reference_number : ""
    const transaction_date = body.transaction_date as string | undefined
    const bank_account_id = String(body.bank_account_id || "").trim()
    const chargesRaw = body.charges
    const charges =
      chargesRaw !== undefined && chargesRaw !== null && chargesRaw !== ""
        ? Number(chargesRaw)
        : null

    if (!member_id) {
      apiLog("warn", "transactions.create.invalid", { method: "POST", apiPath, status: 400, error: "member_id_required" })
      return NextResponse.json({ error: "member_id_required" }, { status: 400 })
    }
    if (!account_id) {
      apiLog("warn", "transactions.create.invalid", { method: "POST", apiPath, status: 400, error: "account_id_required" })
      return NextResponse.json({ error: "account_id_required" }, { status: 400 })
    }
    if (!type || !["Deposit", "Withdrawal", "Transfer"].includes(String(type))) {
      apiLog("warn", "transactions.create.invalid", { method: "POST", apiPath, status: 400, error: "invalid_type" })
      return NextResponse.json({ error: "invalid_type" }, { status: 400 })
    }
    if (String(type) === "Transfer" && !transferred_to_id) {
      apiLog("warn", "transactions.create.invalid", { method: "POST", apiPath, status: 400, error: "transferred_to_id_required" })
      return NextResponse.json({ error: "transferred_to_id_required" }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      apiLog("warn", "transactions.create.invalid", { method: "POST", apiPath, status: 400, error: "invalid_amount" })
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 })
    }
    const validModes = ["Cash", "Mobile Money", "Bank Transfer", "Cheque", "Card"]
    if (!mode || !validModes.includes(String(mode))) {
      apiLog("warn", "transactions.create.invalid", { method: "POST", apiPath, status: 400, error: "invalid_mode" })
      return NextResponse.json({ error: "invalid_mode" }, { status: 400 })
    }
    if (isBankRoutedPaymentMode(String(mode)) && !bank_account_id) {
      apiLog("warn", "transactions.create.invalid", { method: "POST", apiPath, status: 400, error: "bank_account_required" })
      return NextResponse.json({ error: "bank_account_required" }, { status: 400 })
    }
    if (charges !== null && (!Number.isFinite(charges) || charges < 0)) {
      apiLog("warn", "transactions.create.invalid", { method: "POST", apiPath, status: 400, error: "invalid_charges" })
      return NextResponse.json({ error: "invalid_charges" }, { status: 400 })
    }
    if (charges !== null && charges > 0 && String(type) !== "Withdrawal") {
      apiLog("warn", "transactions.create.invalid", { method: "POST", apiPath, status: 400, error: "invalid_charges" })
      return NextResponse.json({ error: "invalid_charges" }, { status: 400 })
    }

    const isTransfer = String(type) === "Transfer"
    if (!isTransfer) {
      const modeValidation = validatePaymentModeInput({
        mode: String(mode),
        referenceNumber: reference_number,
        bankAccountId: bank_account_id,
      })
      if (modeValidation) {
        apiLog("warn", "transactions.create.invalid", { method: "POST", apiPath, status: 400, error: modeValidation })
        return NextResponse.json({ error: modeValidation }, { status: 400 })
      }
    }

    type SavingsTransactionPostCommit = {
      actorId: string
      institutionId: string
      branchId: string
      institutionName: string
      currency: string
      member: {
        id: string
        full_name: string
        member_number: string
        email: string
      }
      account: {
        id: string
        account_number: string
      }
      transaction: {
        id: string
        transaction_number: string
        amount: number
        balance_after: number
        type: SavingsTransactionType
        mode: string
        charges: number | null
        transaction_date: string
      }
      destination: {
        member: {
          id: string
          full_name: string
          member_number: string
          email: string
        }
        account: {
          id: string
          account_number: string
        }
        transaction: {
          id: string
          transaction_number: string
          amount: number
          balance_after: number
        }
      } | null
    }

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string, { activeOnly: false })
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }

      const staffCheck = await assertActorActive(client, actor)
      if (!staffCheck.ok) {
        return {
          error: staffCheck.error,
          staffStatus: staffCheck.error === "staff_inactive" ? staffCheck.status : undefined,
        }
      }

      const writeGuard = assertNotSuperAdmin(actor)
      if (!writeGuard.ok) {
        return { error: writeGuard.error, message: writeGuard.message }
      }

      const allowed = await hasPermission(client, actor, "create_transaction")
      if (!allowed) return { error: "missing_permission:create_transaction" as const }
      if (!actor.branch_id) return { error: "actor_branch_missing" as const }

      const branchCheck = await assertBranchActive(client, actor.branch_id)
      if (!branchCheck.ok) {
        return {
          error: branchCheck.error,
          branchStatus: branchCheck.error === "branch_inactive" ? branchCheck.status : undefined,
        }
      }

      const memberCheck = await assertMemberActive(client, member_id, actor.institution_id)
      if (!memberCheck.ok) {
        return {
          error: memberCheck.error,
          memberStatus: memberCheck.error === "member_inactive" ? memberCheck.status : undefined,
        }
      }
      const memberRow = memberCheck.member

      const sourceAccountCheck = await assertSavingsAccountActive(
        client,
        account_id,
        actor.institution_id,
      )
      if (!sourceAccountCheck.ok) {
        return {
          error: sourceAccountCheck.error,
          accountStatus:
            sourceAccountCheck.error === "savings_account_inactive"
              ? sourceAccountCheck.status
              : undefined,
        }
      }
      const sourceAccount = sourceAccountCheck.account

      if (String(sourceAccount.member_id) !== String(member_id)) {
        return { error: "account_member_mismatch" as const }
      }
      if (memberRow.branch_id !== actor.branch_id || sourceAccount.branch_id !== actor.branch_id) {
        return { error: "cross_branch_operation_forbidden" as const }
      }

      let transferDestAccount: typeof sourceAccount | null = null
      if (isTransfer) {
        const destAccountCheck = await assertSavingsAccountActive(
          client,
          transferred_to_id,
          actor.institution_id,
        )
        if (!destAccountCheck.ok) {
          const destError =
            destAccountCheck.error === "savings_account_not_found"
              ? ("transferred_to_account_not_found" as const)
              : destAccountCheck.error === "savings_account_inactive"
                ? ("transferred_to_account_not_active" as const)
                : destAccountCheck.error
          return {
            error: destError,
            accountStatus:
              destAccountCheck.error === "savings_account_inactive"
                ? destAccountCheck.status
                : undefined,
          }
        }
        transferDestAccount = destAccountCheck.account
        if (String(transferDestAccount.id) === String(sourceAccount.id)) {
          return { error: "transfer_to_same_account_forbidden" as const }
        }
        if (transferDestAccount.branch_id !== actor.branch_id) {
          return { error: "cross_branch_operation_forbidden" as const }
        }
      }

      const balanceQueryIds = isTransfer ? [account_id, transferred_to_id] : [account_id]
      const balanceRes = await client.query<{ id: string; available_balance: string }>(
        `SELECT id, available_balance FROM savings_accounts WHERE id = ANY($1::uuid[])`,
        [balanceQueryIds],
      )
      const balanceById = Object.fromEntries(
        balanceRes.rows.map((row) => [String(row.id), Number(row.available_balance || 0)]),
      )

      let resolvedBankAccountId: string | null = null
      if (!isTransfer && isBankRoutedPaymentMode(String(mode))) {
        const bankRes = await client.query(
          `SELECT id, institution_id, branch_id FROM bank_accounts WHERE id = $1`,
          [bank_account_id],
        )
        const bankRow = bankRes.rows[0]
        if (!bankRow) return { error: "bank_account_not_found" as const }
        if (bankRow.institution_id !== actor.institution_id) return { error: "cross_tenant_operation_forbidden" as const }
        if (bankRow.branch_id !== actor.branch_id) {
          return { error: "cross_branch_operation_forbidden" as const }
        }
        resolvedBankAccountId = String(bankRow.id)
      }

      const balance_before = balanceById[account_id] ?? 0
      let balance_after = balance_before
      if (type === "Deposit") balance_after = balance_before + amount
      else if (type === "Withdrawal") {
        if (amount > balance_before) return { error: "insufficient_funds" as const }
        balance_after = balance_before - amount
      } else if (type === "Transfer") {
        if (amount > balance_before) return { error: "insufficient_funds" as const }
        balance_after = balance_before - amount
      }

      const destBalanceBefore = isTransfer ? (balanceById[transferred_to_id] ?? 0) : 0

      const txDate = transaction_date ? new Date(transaction_date).toISOString() : new Date().toISOString()

      const resolvedReference = reference_number.trim() || null
      const settlementCharges = charges && charges > 0 ? charges : null
      const branchId = String(sourceAccount.branch_id)
      const isWithdrawal = String(type) === "Withdrawal"
      const txDateStr = txDate.slice(0, 10)

      await client.query("BEGIN")
      try {
        if (!isTransfer) {
          try {
            await settlePaymentByMode(client, {
              institutionId: actor.institution_id,
              branchId,
              amount,
              charges: isWithdrawal ? settlementCharges : null,
              mode: String(mode),
              flow: String(type) === "Deposit" ? "inflow" : "outflow",
              actor,
              bankAccountId: resolvedBankAccountId,
              referenceNumber: resolvedReference,
            })
          } catch (e: unknown) {
            if (e instanceof PaymentSettlementFailure) {
              if (e.code === "insufficient_bank_balance") {
                return { error: "bank_account_insufficient_funds" as const }
              }
              return { error: e.code as typeof e.code }
            }
            throw e
          }
        }

        await client.query(
          `UPDATE savings_accounts SET available_balance = $1, total_balance = $2, last_transaction_date = $3 WHERE id = $4`,
          [balance_after, balance_after, txDate.slice(0, 10), account_id],
        )
        if (isTransfer && transferDestAccount) {
          const destAfter = destBalanceBefore + amount
          await client.query(
            `UPDATE savings_accounts SET available_balance = $1, total_balance = $2, last_transaction_date = $3 WHERE id = $4`,
            [destAfter, destAfter, txDate.slice(0, 10), transferred_to_id],
          )
        }

        let tx
        try {
          tx = await createTransaction(client, {
            institutionId: actor.institution_id,
            branchId,
            memberId: member_id,
            accountId: account_id,
            transferredToId: isTransfer ? transferred_to_id : null,
            bankAccountId: resolvedBankAccountId,
            type: String(type),
            amount,
            mode: String(mode),
            description: description || null,
            referenceNumber: resolvedReference,
            balanceBefore: balance_before,
            balanceAfter: balance_after,
            charges: settlementCharges || null,
            processedBy: actor.id,
            transactionDate: txDate,
            prefix: "TXN",
          })
        } catch (e: unknown) {
          const message = String((e as Error)?.message || "")
          if (message === "transaction_insert_failed") {
            return { error: "transaction_number_generation_failed" as const }
          }
          throw e
        }

        if (isWithdrawal && settlementCharges) {
          const accountLabel = sourceAccount.account_number || account_id.slice(0, 8)
          const chargesExpenseDescription = `Savings withdrawal charges for account ${accountLabel}`

          const chargesTx = await createTransaction(client, {
            institutionId: actor.institution_id,
            branchId,
            bankAccountId: resolvedBankAccountId,
            type: "Expense Payment",
            amount: settlementCharges,
            mode: String(mode),
            description: chargesExpenseDescription,
            referenceNumber: resolvedReference,
            charges: null,
            processedBy: actor.id,
            transactionDate: txDate,
            prefix: "TXN",
          })

          const expense = await createExpense(
            client,
            {
              institutionId: actor.institution_id,
              branchId,
              createdBy: actor.id,
              name: "Transaction charges",
              status: "Completed",
              type: "Operating-expenses",
              description: chargesExpenseDescription,
              completedBy: actor.id,
              completedAt: new Date(),
            },
            { actor, branchId },
          )

          const cashflow = await createExpenseCashflow(
            client,
            {
              expenseId: expense.id,
              transactionId: chargesTx.id,
              amount: settlementCharges,
              paymentMethod: String(mode),
              description: "Savings withdrawal charges",
              status: "Fully Paid",
              date: txDateStr,
              completedBy: actor.id,
              completedAt: new Date(),
            },
            { actor, branchId },
          )

          await createExpensePayment(
            client,
            {
              expenseId: expense.id,
              expenseCashflowId: cashflow.id,
              transactionId: chargesTx.id,
              amount: settlementCharges,
              paymentMethod: String(mode),
              date: txDateStr,
              createdBy: actor.id,
            },
            { actor, branchId },
          )
        }

        let destinationTx: { id: string; transaction_number: string } | null = null
        if (isTransfer && transferDestAccount) {
          const destAfter = destBalanceBefore + amount
          const destinationDescription =
            description && String(description).trim().length > 0
              ? `Transfer deposit: ${description}`
              : "Transfer deposit"

          let destTx
          try {
            destTx = await createTransaction(client, {
              institutionId: actor.institution_id,
              branchId: String(transferDestAccount.branch_id),
              memberId: String(transferDestAccount.member_id),
              accountId: String(transferDestAccount.id),
              type: "Deposit",
              amount,
              mode: String(mode),
              description: destinationDescription,
              referenceNumber: resolvedReference,
              balanceBefore: destBalanceBefore,
              balanceAfter: destAfter,
              processedBy: actor.id,
              transactionDate: txDate,
              prefix: "TXN",
            })
          } catch (e: unknown) {
            const message = String((e as Error)?.message || "")
            if (message === "transaction_insert_failed") {
              return { error: "transaction_number_generation_failed" as const }
            }
            throw e
          }
          destinationTx = { id: destTx.id, transaction_number: destTx.transactionNumber }
        }

        await client.query("COMMIT")

        const instRes = await client.query<{ name: string }>(`SELECT name FROM institutions WHERE id = $1`, [actor.institution_id])
        const cfgRes = await client.query<{ currency: string }>(
          `SELECT currency FROM config WHERE branch_id = $1 LIMIT 1`,
          [branchId],
        )
        const destMemberRes =
          isTransfer && transferDestAccount
            ? await client.query<{ id: string; full_name: string; member_number: string; email: string | null }>(
                `SELECT id, full_name, member_number, email FROM members WHERE id = $1`,
                [transferDestAccount.member_id],
              )
            : { rows: [] as Array<{ id: string; full_name: string; member_number: string; email: string | null }> }
        const institutionName = instRes.rows[0]?.name || ""
        const currency = cfgRes.rows[0]?.currency || "UGX"
        const destMemberRow = destMemberRes.rows[0]
        const destAfter = isTransfer ? destBalanceBefore + amount : 0

        const postCommitContext: SavingsTransactionPostCommit = {
          actorId: actor.id,
          institutionId: actor.institution_id,
          branchId,
          institutionName,
          currency,
          member: {
            id: String(memberRow.id),
            full_name: String(memberRow.full_name || ""),
            member_number: String(memberRow.member_number || ""),
            email: memberRow.email ? String(memberRow.email) : "",
          },
          account: {
            id: String(sourceAccount.id),
            account_number: String(sourceAccount.account_number || ""),
          },
          transaction: {
            id: tx.id,
            transaction_number: tx.transactionNumber,
            amount,
            balance_after,
            type: String(type) as SavingsTransactionType,
            mode: String(mode),
            charges: settlementCharges,
            transaction_date: txDateStr,
          },
          destination:
            isTransfer && transferDestAccount && destinationTx && destMemberRow
              ? {
                  member: {
                    id: String(destMemberRow.id),
                    full_name: String(destMemberRow.full_name || ""),
                    member_number: String(destMemberRow.member_number || ""),
                    email: destMemberRow.email ? String(destMemberRow.email) : "",
                  },
                  account: {
                    id: String(transferDestAccount.id),
                    account_number: String(transferDestAccount.account_number || ""),
                  },
                  transaction: {
                    id: destinationTx.id,
                    transaction_number: destinationTx.transaction_number,
                    amount,
                    balance_after: destAfter,
                  },
                }
              : null,
        }

        return {
          ok: true,
          id: tx.id,
          transaction_number: tx.transactionNumber,
          balance_after,
          destination_transaction_id: destinationTx?.id || null,
          destination_transaction_number: destinationTx?.transaction_number || null,
          postCommit: postCommitContext,
        }
      } catch (e: unknown) {
        await client.query("ROLLBACK")
        throw e
      }
    })

    if (result && "error" in result) {
      const errorCode = String(result.error || "")
      const savingsGateStatus = savingsAccountWriteGateHttpStatus(errorCode)
      const status =
        errorCode.startsWith("missing_permission:") ? 403 :
        errorCode === "savings_account_not_found" ||
        errorCode === "savings_account_inactive" ? savingsGateStatus :
        errorCode === "super_admin_write_blocked" ||
        errorCode === "cross_tenant_operation_forbidden" ||
        errorCode === "cross_branch_operation_forbidden" ||
        errorCode === "member_inactive" ||
        errorCode === "staff_inactive" ||
        errorCode === "branch_inactive" ||
        errorCode === "transferred_to_account_not_active" ? 403 :
        errorCode === "member_not_found" ||
        errorCode === "transferred_to_account_not_found" ||
        errorCode === "bank_account_not_found" ||
        errorCode === "branch_not_found" ? 404 : 400
      apiLog("warn", "transactions.create.denied", { method: "POST", apiPath, status, error: errorCode })
      return NextResponse.json({ error: errorCode }, { status })
    }
    apiLog("info", "transactions.create.success", { method: "POST", apiPath, status: 201, accountId: account_id, memberId: member_id })

    const ctx = "postCommit" in result ? result.postCommit : null
    if (ctx) {
      try {
        const notifyRes = await runWithoutAuth((notifyClient) =>
          notifySavingsTransaction({
            client: notifyClient,
            actor: { id: ctx.actorId, institution_id: ctx.institutionId, branch_id: ctx.branchId },
            member: ctx.member,
            account: ctx.account,
            transaction: ctx.transaction,
            destination: ctx.destination,
            currency: ctx.currency,
          }),
        )
        apiLog(
          notifyRes.ok ? "info" : "warn",
          notifyRes.ok ? "transactions.create.notifications_dispatched" : "transactions.create.notifications_partial",
          {
            method: "POST",
            apiPath,
            status: 201,
            memberId: member_id,
            memberNotifications: notifyRes.memberNotifications,
            staffNotifications: notifyRes.staffNotifications,
            ...(notifyRes.errors.length ? { errors: notifyRes.errors } : {}),
          },
        )
      } catch (notifyErr) {
        apiLog("error", "transactions.create.notifications_failed", {
          method: "POST",
          apiPath,
          status: 201,
          memberId: member_id,
          error: (notifyErr as Error)?.message || "notify_failed",
        })
      }

      try {
        const emailRes = await enqueueSavingsTransactionEmails({
          member: ctx.member,
          institutionName: ctx.institutionName,
          currency: ctx.currency,
          type: ctx.transaction.type,
          account: ctx.account,
          transaction: ctx.transaction,
          destination: ctx.destination,
          context: { institutionId: ctx.institutionId, branchId: ctx.branchId, actorId: ctx.actorId },
        })
        if (emailRes.errors.length > 0) {
          apiLog("warn", "transactions.create.email_enqueue_partial", {
            method: "POST",
            apiPath,
            status: 201,
            memberId: member_id,
            errors: emailRes.errors,
          })
        }
      } catch (emailErr) {
        apiLog("error", "transactions.create.email_enqueue_failed", {
          method: "POST",
          apiPath,
          status: 201,
          memberId: member_id,
          error: (emailErr as Error)?.message || "email_failed",
        })
      }
    }

    const { postCommit: _postCommit, ...responseBody } = result
    return NextResponse.json(responseBody, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "transactions.create.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
