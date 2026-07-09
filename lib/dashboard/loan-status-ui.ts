import type { ComponentProps } from "react"
import type { Badge } from "@/components/ui/badge"

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>

/** Map DB `loan_status_type` values to badge variants for dashboard/list UIs. */
export function loanStatusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case "Approved":
      return "default"
    case "Partially Disbursed":
    case "Fully Disbursed":
    case "Active":
      return "secondary"
    case "Defaulted":
    case "Rejected":
      return "destructive"
    case "Closed":
      return "outline"
    default:
      return "outline"
  }
}

export function loanStatusIsDisbursed(status: string): boolean {
  return status === "Partially Disbursed" || status === "Fully Disbursed" || status === "Active"
}

export function loanStatusIsAtRisk(status: string): boolean {
  return status === "Defaulted"
}
