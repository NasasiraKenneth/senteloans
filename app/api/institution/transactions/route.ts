import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithAuth } from "@/lib/db"
import { insertTransactionInsertAuditLog } from "@/lib/audit/transaction-insert-audit"
import { apiLog, getApiPath } from "@/lib/api/api-log"
import { insertWithTransactionNumberRetry } from "@/lib/transactions/transaction-number-retry"
import { requireStaffSession, resolveActorContext, hasPermission, scopeWhere, isSuperAdmin, normalizeRole } from "@/lib/api/rbac"
import { decodeCursor, encodeCursor } from "@/lib/api/keyset"

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
    const mode = (url.searchParams.get("mode") || "").trim()
    const dateFrom = (url.searchParams.get("date_from") || "").trim()
    const dateTo = (url.searchParams.get("date_to") || "").trim()
    const search = (url.searchParams.get("search") || "").trim()
    const memberId = (url.searchParams.get("member_id") || "").trim()
    const clientId = (url.searchParams.get("client_id") || "").trim()
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
      if (clientId) {
        where += ` AND t.client_id = $${idx++}`
        params.push(clientId)
      }
      if (type) {
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
         FROM senteloans_transactions t
         LEFT JOIN senteloans_members m ON m.id = t.member_id
         LEFT JOIN senteloans_clients c ON c.id = t.client_id
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
           t.client_id,
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
           c.name AS client_name
         FROM senteloans_transactions t
         LEFT JOIN senteloans_members m ON m.id = t.member_id
         LEFT JOIN senteloans_clients c ON c.id = t.client_id
         WHERE ${where}
         ORDER BY t.created_at DESC, t.id DESC
         LIMIT $${idx}${cursor ? "" : ` OFFSET $${idx + 1}`}`,
        params
      )
      const data = dataRes.rows

      const accountIds = [...new Set(data.map((r: { account_id: string }) => r.account_id).filter(Boolean))]
      let accountMap: Record<string, string> = {}
      if (accountIds.length > 0) {
        const aRes = await client.query(`SELECT id, account_number FROM senteloans_savings_accounts WHERE id = ANY($1::uuid[])`, [accountIds])
        accountMap = Object.fromEntries(aRes.rows.map((a: { id: string; account_number: string }) => [a.id, a.account_number]))
      }

      const items = data.map((row: Record<string, unknown>) => ({
        id: row.id,
        transaction_number: row.transaction_number,
        memberName: row.member_name || row.client_name || "",
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
        `SELECT t.id, t.transaction_number, t.type, t.amount, t.mode, t.balance_after, t.transaction_date, t.account_id, t.member_id, t.client_id, t.description, m.full_name AS member_name, c.name AS client_name
         FROM senteloans_transactions t
         LEFT JOIN senteloans_members m ON m.id = t.member_id
         LEFT JOIN senteloans_clients c ON c.id = t.client_id
         WHERE ${recentWhereParts.join(" AND ")}
         ORDER BY t.created_at DESC
         LIMIT 10`,
        recentParams
      )
      const recentTx = recentRes.rows
      const recentAccountIds = [...new Set(recentTx.map((t: { account_id: string }) => t.account_id).filter(Boolean))]
      let recentAccountMap: Record<string, string> = {}
      if (recentAccountIds.length > 0) {
        const raRes = await client.query(`SELECT id, account_number FROM senteloans_savings_accounts WHERE id = ANY($1::uuid[])`, [recentAccountIds])
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
        memberName: t.member_name || t.client_name || "",
        accountNumber: recentAccountMap[t.account_id as string] || "",
      }))

      return { items, total, page, pageSize: take, nextCursor, recentTransactions: recent }
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

    const result = await runWithAuth(session.user.authUserId, async (client) => {
      const actor = await resolveActorContext(client, session.user.authUserId as string)
      if (!actor?.institution_id) return { error: "no_app_user_profile" as const }
      const allowed = await hasPermission(client, actor, "create_transaction")
      if (!allowed) return { error: "missing_permission:create_transaction" as const }

      const actorRole = String(actor.role || "").trim().toLowerCase()
      if (actorRole !== "super_admin" && !actor.branch_id) return { error: "actor_branch_missing" as const }

      const sourceQuery = client.query(
        `SELECT id, institution_id, branch_id, member_id, status, available_balance, total_balance FROM senteloans_savings_accounts WHERE id = $1`,
        [account_id],
      )
      const transferDestQuery =
        String(type) === "Transfer"
          ? client.query(
              `SELECT id, institution_id, branch_id, member_id, status, available_balance, total_balance FROM senteloans_savings_accounts WHERE id = $1`,
              [transferred_to_id],
            )
          : Promise.resolve({ rows: [] as any[] })

      const [memberRes, accountRes, transferDestRes] = await Promise.all([
        client.query(`SELECT id, institution_id, branch_id, status FROM senteloans_members WHERE id = $1`, [member_id]),
        sourceQuery,
        transferDestQuery,
      ])
      const memberRow = memberRes.rows[0]
      const account = accountRes.rows[0]
      const transferDest = transferDestRes.rows[0]
      if (!memberRow) return { error: "member_not_found" as const }
      if (!account) return { error: "account_not_found" as const }
      if (memberRow.institution_id !== actor.institution_id || account.institution_id !== actor.institution_id) {
        return { error: "cross_tenant_operation_forbidden" as const }
      }
      if (String(account.member_id) !== String(member_id)) return { error: "account_member_mismatch" as const }
      if (actorRole !== "super_admin" && (memberRow.branch_id !== actor.branch_id || account.branch_id !== actor.branch_id)) {
        return { error: "cross_branch_operation_forbidden" as const }
      }
      if (String(account.status) !== "Active") return { error: "account_not_active" as const }
      if (String(type) === "Transfer") {
        if (!transferDest) return { error: "transferred_to_account_not_found" as const }
        if (String(transferDest.id) === String(account.id)) return { error: "transfer_to_same_account_forbidden" as const }
        if (transferDest.institution_id !== actor.institution_id) return { error: "cross_tenant_operation_forbidden" as const }
        if (actorRole !== "super_admin" && transferDest.branch_id !== actor.branch_id) {
          return { error: "cross_branch_operation_forbidden" as const }
        }
        if (String(transferDest.status) !== "Active") return { error: "transferred_to_account_not_active" as const }
      }

      const balance_before = Number(account.available_balance || 0)
      let balance_after = balance_before
      if (type === "Deposit") balance_after = balance_before + amount
      else if (type === "Withdrawal") {
        if (amount > balance_before) return { error: "insufficient_funds" as const }
        balance_after = balance_before - amount
      } else if (type === "Transfer") {
        if (amount > balance_before) return { error: "insufficient_funds" as const }
        balance_after = balance_before - amount
      }

      const txDate = transaction_date ? new Date(transaction_date).toISOString() : new Date().toISOString()

      await client.query("BEGIN")
      try {
        await client.query(
          `UPDATE senteloans_savings_accounts SET available_balance = $1, total_balance = $2, last_transaction_date = $3 WHERE id = $4`,
          [balance_after, balance_after, txDate.slice(0, 10), account_id]
        )
        if (String(type) === "Transfer") {
          const destBefore = Number(transferDest.available_balance || 0)
          const destAfter = destBefore + amount
          await client.query(
            `UPDATE senteloans_savings_accounts SET available_balance = $1, total_balance = $2, last_transaction_date = $3 WHERE id = $4`,
            [destAfter, destAfter, txDate.slice(0, 10), transferred_to_id],
          )
        }

        const inserted = await insertWithTransactionNumberRetry(
          (transaction_number) =>
            client.query(
              `INSERT INTO senteloans_transactions (institution_id, branch_id, member_id, account_id, transferred_to_id, loan_id, transaction_number, type, amount, mode, description, reference_number, balance_before, balance_after, processed_by, transaction_date, status)
               VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'Completed') RETURNING id`,
              [
                actor.institution_id,
                account.branch_id,
                member_id,
                account_id,
                transferred_to_id || null,
                transaction_number,
                type,
                amount,
                mode,
                description,
                reference_number || transaction_number,
                balance_before,
                balance_after,
                actor.id,
                txDate,
              ],
            ),
          { prefix: "TXN" },
        )
        if (!inserted) throw new Error("transaction_number_generation_failed")

        const { row: txRow, transactionNumber } = inserted

        await insertTransactionInsertAuditLog(client, {
          institutionId: actor.institution_id,
          branchId: account.branch_id,
          userId: actor.id,
          transactionId: txRow.id,
          newValues: { transaction_number: transactionNumber, type, amount, member_id, account_id, transferred_to_id: transferred_to_id || null },
        })

        let destinationTx: { id: string; transaction_number: string } | null = null
        if (String(type) === "Transfer") {
          const destBefore = Number(transferDest.available_balance || 0)
          const destAfter = destBefore + amount
          const destinationDescription =
            description && String(description).trim().length > 0
              ? `Transfer deposit: ${description}`
              : "Transfer deposit"

          const destInserted = await insertWithTransactionNumberRetry(
            (transaction_number) =>
              client.query(
                `INSERT INTO senteloans_transactions (institution_id, branch_id, member_id, account_id, transferred_to_id, loan_id, transaction_number, type, amount, mode, description, reference_number, balance_before, balance_after, processed_by, transaction_date, status)
                 VALUES ($1, $2, $3, $4, NULL, NULL, $5, 'Deposit', $6, $7, $8, $9, $10, $11, $12, $13, 'Completed') RETURNING id`,
                [
                  actor.institution_id,
                  transferDest.branch_id,
                  transferDest.member_id,
                  transferDest.id,
                  transaction_number,
                  amount,
                  mode,
                  destinationDescription,
                  reference_number || transaction_number,
                  destBefore,
                  destAfter,
                  actor.id,
                  txDate,
                ],
              ),
            { prefix: "TXN" },
          )
          if (!destInserted) throw new Error("transaction_number_generation_failed")
          destinationTx = { id: destInserted.row.id, transaction_number: destInserted.transactionNumber }

          await insertTransactionInsertAuditLog(client, {
            institutionId: actor.institution_id,
            branchId: transferDest.branch_id,
            userId: actor.id,
            transactionId: destInserted.row.id,
            newValues: {
              transaction_number: destInserted.transactionNumber,
              type: "Deposit",
              amount,
              member_id: transferDest.member_id,
              account_id: transferDest.id,
              transferred_to_id: null,
            },
          })
        }

        await client.query("COMMIT")
        return {
          ok: true,
          id: txRow.id,
          transaction_number: transactionNumber,
          balance_after,
          destination_transaction_id: destinationTx?.id || null,
          destination_transaction_number: destinationTx?.transaction_number || null,
        }
      } catch (e: unknown) {
        await client.query("ROLLBACK")
        const message = String((e as Error)?.message || "")
        if (message === "transaction_number_generation_failed") {
          return { error: "transaction_number_generation_failed" as const }
        }
        throw e
      }
    })

    if (result && "error" in result) {
      const errorCode = String(result.error || "")
      const status =
        errorCode.startsWith("missing_permission:") ? 403 :
        errorCode === "cross_tenant_operation_forbidden" || errorCode === "cross_branch_operation_forbidden" ? 403 :
        errorCode === "member_not_found" || errorCode === "account_not_found" || errorCode === "transferred_to_account_not_found" ? 404 : 400
      apiLog("warn", "transactions.create.denied", { method: "POST", apiPath, status, error: errorCode })
      return NextResponse.json({ error: errorCode }, { status })
    }
    apiLog("info", "transactions.create.success", { method: "POST", apiPath, status: 201, accountId: account_id, memberId: member_id })
    return NextResponse.json(result, { status: 201 })
  } catch (e: unknown) {
    const err = e as Error
    apiLog("error", "transactions.create.error", { method: "POST", apiPath, status: 500, error: err?.message || "Unexpected error" })
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
