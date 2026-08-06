import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { runWithoutAuth } from "@/lib/db"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: institutionId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "system_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const result = await runWithoutAuth(async (client) => {
      const res = await client.query(
        `SELECT
           b.id AS branch_id,
           b.name AS branch_name,
           b.branch_code,
           c.id AS config_id,
           COALESCE(c.chats, 'true') AS chats,
           COALESCE(c.mobile_money, 'true') AS mobile_money,
           COALESCE(c.loans, 'true') AS loans,
           COALESCE(c.savings, 'true') AS savings,
           COALESCE(c.shares, 'true') AS shares,
           COALESCE(c.auto_invoices, 'false') AS auto_invoices,
           COALESCE(c.currency, 'UGX') AS currency,
           es.id AS email_settings_id,
           COALESCE(es.provider, 'mailgun') AS provider,
           es.from_email,
           es.reply_to_email,
           es.domain,
           es.api_key,
           es.smtp_host,
           es.smtp_port,
           es.smtp_username,
           COALESCE(es.is_active, false) AS email_is_active
         FROM branches b
         LEFT JOIN config c ON c.branch_id = b.id
         LEFT JOIN email_settings es ON es.branch_id = b.id
         WHERE b.institution_id = $1
         ORDER BY b.created_at ASC`,
        [institutionId]
      )
      return { configs: res.rows }
    })

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: institutionId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.authUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "system_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = (await req.json().catch(() => ({}))) as Record<string, any>
    const { action, branch_id, module: moduleName, enabled } = body

    if (!branch_id) {
      return NextResponse.json({ error: "branch_id is required" }, { status: 400 })
    }

    const result = await runWithoutAuth(async (client) => {
      // Verify branch belongs to institution
      const branchCheck = await client.query(
        `SELECT id FROM branches WHERE id = $1 AND institution_id = $2`,
        [branch_id, institutionId]
      )
      if (branchCheck.rows.length === 0) {
        return { error: "Branch not found for this institution" as const }
      }

      if (action === "toggle_module") {
        const validModules = ["chats", "mobile_money", "loans", "savings", "shares", "auto_invoices"]
        if (!validModules.includes(moduleName)) {
          return { error: "Invalid module name" as const }
        }

        const strValue = enabled ? "true" : "false"

        // Ensure config row exists for branch
        const configCheck = await client.query(`SELECT id FROM config WHERE branch_id = $1`, [branch_id])

        if (configCheck.rows.length === 0) {
          await client.query(
            `INSERT INTO config (branch_id, ${moduleName}) VALUES ($1, $2)`,
            [branch_id, strValue]
          )
        } else {
          await client.query(
            `UPDATE config SET ${moduleName} = $1 WHERE branch_id = $2`,
            [strValue, branch_id]
          )
        }
        return { ok: true, action, branch_id, module: moduleName, enabled: Boolean(enabled) }
      }

      if (action === "toggle_email_active") {
        const isActive = Boolean(enabled)

        const esCheck = await client.query(`SELECT id FROM email_settings WHERE branch_id = $1`, [branch_id])

        if (esCheck.rows.length === 0) {
          await client.query(
            `INSERT INTO email_settings (institution_id, branch_id, provider, is_active)
             VALUES ($1, $2, 'mailgun', $3)`,
            [institutionId, branch_id, isActive]
          )
        } else {
          await client.query(
            `UPDATE email_settings SET is_active = $1, updated_at = NOW() WHERE branch_id = $2`,
            [isActive, branch_id]
          )
        }
        return { ok: true, action, branch_id, enabled: isActive }
      }

      if (action === "save_email_settings") {
        const provider = String(body.provider || "mailgun").trim().toLowerCase()
        const from_email = body.from_email ? String(body.from_email).trim() : null
        const reply_to_email = body.reply_to_email ? String(body.reply_to_email).trim() : null
        const domain = body.domain ? String(body.domain).trim() : null
        const api_key = body.api_key ? String(body.api_key).trim() : null
        const smtp_host = body.smtp_host ? String(body.smtp_host).trim() : null
        const smtp_port = body.smtp_port ? Number(body.smtp_port) : null
        const smtp_username = body.smtp_username ? String(body.smtp_username).trim() : null
        const smtp_password = body.smtp_password ? String(body.smtp_password).trim() : null
        const is_active = Boolean(body.is_active)

        await client.query(
          `INSERT INTO email_settings (
             institution_id, branch_id, provider, from_email, reply_to_email,
             domain, api_key, smtp_host, smtp_port, smtp_username, smtp_password, is_active
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (branch_id) DO UPDATE SET
             provider = EXCLUDED.provider,
             from_email = EXCLUDED.from_email,
             reply_to_email = EXCLUDED.reply_to_email,
             domain = EXCLUDED.domain,
             api_key = COALESCE(EXCLUDED.api_key, email_settings.api_key),
             smtp_host = EXCLUDED.smtp_host,
             smtp_port = EXCLUDED.smtp_port,
             smtp_username = EXCLUDED.smtp_username,
             smtp_password = COALESCE(EXCLUDED.smtp_password, email_settings.smtp_password),
             is_active = EXCLUDED.is_active,
             updated_at = NOW()`,
          [
            institutionId,
            branch_id,
            provider,
            from_email,
            reply_to_email,
            domain,
            api_key,
            smtp_host,
            smtp_port,
            smtp_username,
            smtp_password,
            is_active,
          ]
        )
        return { ok: true, action, branch_id }
      }

      return { error: "Unknown action" as const }
    })

    if (result && "error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const err = e as Error
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 })
  }
}
