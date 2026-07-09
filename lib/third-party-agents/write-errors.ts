/** Map third-party agent write API error codes to user-facing messages. */
export function mapThirdPartyAgentWriteError(
  code: unknown,
  branchStatus?: unknown,
  staffStatus?: unknown,
  agentStatus?: unknown,
): string {
  const c = String(code || "")
  switch (c) {
    case "missing_permission:create_third_party_agent":
      return "You do not have permission to create third party agents."
    case "missing_permission:edit_third_party_agent":
      return "You do not have permission to edit third party agents."
    case "super_admin_write_blocked":
      return "Super admins are not allowed to edit or modify data."
    case "branch_inactive": {
      const statusLabel =
        typeof branchStatus === "string" ? branchStatus.toLowerCase() : "inactive"
      return `Your branch is ${statusLabel}. Third party agent changes are disabled until it is reactivated.`
    }
    case "branch_not_found":
      return "Your branch could not be found."
    case "staff_inactive": {
      const statusLabel =
        typeof staffStatus === "string" ? staffStatus.toLowerCase() : "inactive"
      return `Your staff account is ${statusLabel}. Third party agent changes are disabled until it is reactivated.`
    }
    case "third_party_agent_not_found":
      return "The selected third party agent no longer exists."
    case "third_party_agent_inactive": {
      const statusLabel =
        typeof agentStatus === "string" ? agentStatus.toLowerCase() : "inactive"
      return `This third party agent is ${statusLabel}. Only status changes are allowed until it is reactivated.`
    }
    default:
      return c || "Unexpected error"
  }
}
