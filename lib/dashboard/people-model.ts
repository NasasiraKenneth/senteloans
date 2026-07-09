import { isMoneyLenderInstitutionType } from "@/lib/institution-branch-config"

/** UI label grouping for institution people KPIs (data always comes from `members`). */
export type DashboardPeopleLabel = "members" | "borrowers"

export function dashboardPeopleLabelForInstitutionType(institutionType: string): DashboardPeopleLabel {
  return isMoneyLenderInstitutionType(institutionType) ? "borrowers" : "members"
}
