export type StatementAssigneeMode = "members" | "clients" | "staff"

export type StatementAssigneeRow = {
  member_name?: string
  member_number?: string
  client_name?: string
  staff_name?: string
  account_number?: string
}

export function statementAssignedLabel(
  row: StatementAssigneeRow,
  mode: StatementAssigneeMode,
): string {
  if (mode === "clients") return String(row.client_name || "")
  if (mode === "staff") return String(row.staff_name || "")
  return String(row.member_name || "")
}

export function statementAssignedNumber(
  row: StatementAssigneeRow,
  mode: StatementAssigneeMode,
): string {
  if (mode === "members") return String(row.member_number || "")
  return ""
}

export function statementAssigneeSectionTitle(mode: StatementAssigneeMode): string {
  if (mode === "clients") return "Client"
  if (mode === "staff") return "Staff"
  return "Member"
}

export function statementTopAssigneesTitle(mode: StatementAssigneeMode): string {
  if (mode === "clients") return "Clients"
  if (mode === "staff") return "Staff"
  return "Members"
}

export function statementTopAssigneeColumnHeader(mode: StatementAssigneeMode): string {
  if (mode === "clients") return "Client"
  if (mode === "staff") return "Staff"
  return "Member"
}
