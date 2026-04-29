import type { FilterField } from "@/components/datatables/TableFilter"

type BranchOption = { value: string; label: string }

type WithBranchFilterFirstParams = {
  isSuperAdmin: boolean
  branchOptions: BranchOption[]
  field?: string
  label?: string
}

export function withBranchFilterFirst(
  fields: FilterField[],
  { isSuperAdmin, branchOptions, field = "branches", label = "Branches" }: WithBranchFilterFirstParams
): FilterField[] {
  if (!isSuperAdmin) return fields

  const withoutBranch = fields.filter((f) => f.field !== field)
  const branchFilter: FilterField = {
    field,
    label,
    options: branchOptions,
    multiple: true,
    type: "select",
  }

  return [branchFilter, ...withoutBranch]
}

