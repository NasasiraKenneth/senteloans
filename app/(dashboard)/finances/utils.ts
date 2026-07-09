export {
  UNCLAIMED_ASSIGNED_TYPE_MEMBER,
  UNCLAIMED_ASSIGNED_TYPE_THIRD_PARTY,
  type UnclaimedAssignedType,
  parseUnclaimedAssignedTypeFilter,
} from "@/lib/finances/unclaimed-deposit"

export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", minimumFractionDigits: 0 }).format(amount)

export const formatDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

export const unclaimedStatusBadge = (status: string) => {
  const s = String(status || "").toLowerCase()
  if (s === "claimed") return "bg-emerald-100 text-emerald-800 border border-emerald-200"
  if (s === "unclaimed") return "bg-amber-100 text-amber-800 border border-amber-200"
  return "bg-slate-100 text-slate-700 border border-slate-200"
}
