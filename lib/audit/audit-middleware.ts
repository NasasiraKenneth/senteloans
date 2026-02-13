import type { NextRequest } from "next/server"
import { auditLogger } from "./audit-logger"

export interface AuditContext {
  userId?: string
  institutionId: string
  ipAddress?: string
  userAgent?: string
}

export function createAuditContext(request: NextRequest): Partial<AuditContext> {
  return {
    ipAddress: request.ip || request.headers.get("x-forwarded-for") || "unknown",
    userAgent: request.headers.get("user-agent") || "unknown",
  }
}

export async function withAudit<T>(
  operation: () => Promise<T>,
  auditInfo: {
    tableName: string
    operation: "INSERT" | "UPDATE" | "DELETE"
    recordId: string
    oldValues?: Record<string, any>
    newValues?: Record<string, any>
    context: AuditContext
  },
): Promise<T> {
  try {
    const result = await operation()

    // Log the successful operation
    await auditLogger.logOperation({
      table_name: auditInfo.tableName,
      operation: auditInfo.operation,
      record_id: auditInfo.recordId,
      old_values: auditInfo.oldValues,
      new_values: auditInfo.newValues,
      institution_id: auditInfo.context.institutionId,
      user_id: auditInfo.context.userId,
      ip_address: auditInfo.context.ipAddress,
      user_agent: auditInfo.context.userAgent,
    })

    return result
  } catch (error) {
    // Still log failed operations for security monitoring
    await auditLogger.logOperation({
      table_name: auditInfo.tableName,
      operation: auditInfo.operation,
      record_id: auditInfo.recordId,
      old_values: auditInfo.oldValues,
      new_values: { ...auditInfo.newValues, _error: String(error) },
      institution_id: auditInfo.context.institutionId,
      user_id: auditInfo.context.userId,
      ip_address: auditInfo.context.ipAddress,
      user_agent: auditInfo.context.userAgent,
    })

    throw error
  }
}
