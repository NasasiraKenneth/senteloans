"use client"

import { FileText } from "lucide-react"

export interface ExpenseCashflowExpandableModel {
  description: string | null
  date: string | null
  created_at: string
  amount: number
  payment_method: string | null
  assigned_name: string | null
  assigned_type: "staff" | "client" | null
  status: string
  completed_by: string | null
  completed_at: string | null
  completed_by_name: string | null
}

interface ExpenseCashflowExpandableContentProps {
  cashflow: ExpenseCashflowExpandableModel
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", minimumFractionDigits: 0 }).format(Number(v || 0))

const formatDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString("en-UG") : "—")

const formatDateTime = (v?: string | null) =>
  v
    ? new Date(v).toLocaleString("en-UG", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—"

const titleCase = (v: string) => String(v || "").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())

export default function ExpenseCashflowExpandableContent({ cashflow }: ExpenseCashflowExpandableContentProps) {
  const displayDate = cashflow.date ? formatDate(cashflow.date) : formatDate(cashflow.created_at)
  const party =
    cashflow.assigned_type === "staff" ? "Staff" : cashflow.assigned_type === "client" ? "Client" : null

  return (
    <div className="space-y-4 p-5">
      <div className="rounded-xl border border-[#f08c2b]/30 bg-linear-to-r from-orange-50 via-amber-50 to-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-white p-2 text-[#de4925] shadow-sm">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Description</p>
              <p className="mt-2 text-sm leading-relaxed text-gray-800">
                {cashflow.description?.trim() || "No description provided for this cashflow."}
              </p>
            </div>
          </div>
        </div>
        <dl className="mt-4 grid gap-3 border-t border-[#f08c2b]/20 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Date</dt>
            <dd className="mt-0.5 font-medium text-gray-900">{displayDate}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Amount</dt>
            <dd className="mt-0.5 font-medium text-gray-900">{formatCurrency(cashflow.amount)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Payment method</dt>
            <dd className="mt-0.5 font-medium text-gray-900">
              {cashflow.payment_method ? titleCase(cashflow.payment_method.replace(/_/g, " ")) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Assigned to</dt>
            <dd className="mt-0.5 font-medium text-gray-900">
              {cashflow.assigned_name ? (
                <>
                  {cashflow.assigned_name}
                  {party ? <span className="ml-1 text-xs font-normal text-gray-500">({party})</span> : null}
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Status</dt>
            <dd className="mt-0.5 font-medium text-gray-900">{titleCase(cashflow.status)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Completed by</dt>
            <dd className="mt-0.5 font-medium text-gray-900">{cashflow.completed_by_name?.trim() || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Completed at</dt>
            <dd className="mt-0.5 font-medium text-gray-900">{formatDateTime(cashflow.completed_at)}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
