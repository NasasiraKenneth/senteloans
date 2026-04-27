import type { PoolClient } from "pg"
import { runWithoutAuth } from "@/lib/db"

export interface AuditLogEntry {
  table_name: string
  category?: string
  operation: "INSERT" | "UPDATE" | "DELETE"
  record_id: string
  old_values?: Record<string, unknown>
  new_values?: Record<string, unknown>
  user_id?: string
  institution_id: string
  ip_address?: string
  user_agent?: string
  timestamp?: Date
}

function deriveCategory(tableName: string): string {
  const normalized = String(tableName || "")
    .trim()
    .toLowerCase()
    .replace(/^senteloans_/, "")

  if (!normalized) return "system"
  if (normalized.startsWith("loan_") || normalized.startsWith("loans")) return "loans"
  if (normalized.startsWith("sacco_loan")) return "sacco loans"
  if (normalized.startsWith("investment")) return "investments"
  if (normalized.startsWith("invoice")) return "invoices"
  if (normalized.startsWith("transaction")) return "transactions"
  if (normalized.startsWith("member")) return "members"
  if (normalized.startsWith("staff") || normalized.startsWith("user")) return "staff"
  return normalized.replace(/_/g, " ")
}

async function runInsert(client: PoolClient, entry: AuditLogEntry): Promise<void> {
  await client.query(
    `INSERT INTO senteloans_audit_logs (
      table_name, category, operation, record_id, old_values, new_values, user_id, institution_id, ip_address, user_agent
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      entry.table_name,
      entry.category || deriveCategory(entry.table_name),
      entry.operation,
      entry.record_id,
      entry.old_values ? JSON.stringify(entry.old_values) : null,
      entry.new_values ? JSON.stringify(entry.new_values) : null,
      entry.user_id ?? null,
      entry.institution_id,
      entry.ip_address ?? null,
      entry.user_agent ?? null,
    ]
  )
}

export class AuditLogger {
  async logOperation(entry: AuditLogEntry, client?: PoolClient): Promise<void> {
    try {
      if (client) {
        await runInsert(client, entry)
        return
      }
      await runWithoutAuth(async (c) => runInsert(c, entry))
    } catch (error) {
      console.error("Audit logging error:", error)
    }
  }

  async logInsert(
    tableName: string,
    recordId: string,
    newValues: Record<string, unknown>,
    institutionId: string,
    userId?: string,
    metadata?: { ip_address?: string; user_agent?: string },
    client?: PoolClient
  ): Promise<void> {
    await this.logOperation(
      {
        table_name: tableName,
        operation: "INSERT",
        record_id: recordId,
        new_values: newValues,
        institution_id: institutionId,
        user_id: userId,
        ip_address: metadata?.ip_address,
        user_agent: metadata?.user_agent,
      },
      client
    )
  }

  async logUpdate(
    tableName: string,
    recordId: string,
    oldValues: Record<string, unknown>,
    newValues: Record<string, unknown>,
    institutionId: string,
    userId?: string,
    metadata?: { ip_address?: string; user_agent?: string },
    client?: PoolClient
  ): Promise<void> {
    await this.logOperation(
      {
        table_name: tableName,
        operation: "UPDATE",
        record_id: recordId,
        old_values: oldValues,
        new_values: newValues,
        institution_id: institutionId,
        user_id: userId,
        ip_address: metadata?.ip_address,
        user_agent: metadata?.user_agent,
      },
      client
    )
  }

  async logDelete(
    tableName: string,
    recordId: string,
    oldValues: Record<string, unknown>,
    institutionId: string,
    userId?: string,
    metadata?: { ip_address?: string; user_agent?: string },
    client?: PoolClient
  ): Promise<void> {
    await this.logOperation(
      {
        table_name: tableName,
        operation: "DELETE",
        record_id: recordId,
        old_values: oldValues,
        institution_id: institutionId,
        user_id: userId,
        ip_address: metadata?.ip_address,
        user_agent: metadata?.user_agent,
      },
      client
    )
  }
}

export const auditLogger = new AuditLogger()
