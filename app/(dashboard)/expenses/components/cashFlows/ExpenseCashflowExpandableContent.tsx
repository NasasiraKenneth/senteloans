"use client"

import { Banknote, CircleDollarSign, Receipt, Wallet } from "lucide-react"
import { formatExpenseCashflowAssignedPartyLabel } from "@/lib/expenses/expense-cashflow-status"
import { formatCurrency } from "@/lib/format-currency"

export interface ExpenseCashflowPaymentLine {
  id: string
  amount: number
  payment_date: string
  transaction_number: string | null
  mode: string | null
  reference_number: string | null
  processed_by_name: string | null
}

export interface ExpenseCashflowExpandableModel {
  description: string | null
  date: string | null
  created_at: string
  amount: number
  paid_amount?: number
  outstanding?: number
  payment_method: string | null
  assigned_name: string | null
  assigned_type: "staff" | "client" | null
  status: string
  completed_by: string | null
  completed_at: string | null
  completed_by_name: string | null
  payments?: ExpenseCashflowPaymentLine[]
}

interface ExpenseCashflowExpandableContentProps {
  cashflow: ExpenseCashflowExpandableModel
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatDisplayDate(value: string | null | undefined): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

const titleCase = (v: string) => String(v || "").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())

export default function ExpenseCashflowExpandableContent({ cashflow }: ExpenseCashflowExpandableContentProps) {
  const total = Number(cashflow.amount || 0)
  const paid = Number(cashflow.paid_amount || 0)
  const outstanding =
    typeof cashflow.outstanding === "number"
      ? Math.max(cashflow.outstanding, 0)
      : Math.max(total - paid, 0)
  const payments = cashflow.payments ?? []
  const progress = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0
  const party = formatExpenseCashflowAssignedPartyLabel(cashflow.assigned_type)
  const displayDate = cashflow.date ? formatDisplayDate(cashflow.date) : formatDisplayDate(cashflow.created_at)
  const summaryTitle = cashflow.description?.trim() || `Cashflow · ${displayDate}`
  const assigneeLine = [cashflow.assigned_name, party].filter(Boolean).join(" · ") || "—"

  return (
    <div className="space-y-4 p-5">
      <div className="rounded-xl border border-[#f08c2b]/25 bg-linear-to-r from-orange-50 via-amber-50/80 to-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-white p-2.5 text-[#de4925] shadow-sm ring-1 ring-[#f08c2b]/20">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Payment summary</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">{summaryTitle}</p>
              <p className="text-sm text-gray-600">{assigneeLine}</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {titleCase(cashflow.status)}
                {cashflow.payment_method
                  ? ` · ${titleCase(cashflow.payment_method.replace(/_/g, " "))}`
                  : ""}
              </p>
            </div>
          </div>
          <div className="min-w-[180px] flex-1 sm:max-w-xs">
            <div className="mb-1 flex justify-between text-xs font-medium text-gray-600">
              <span>Settled</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/80 ring-1 ring-[#f08c2b]/15">
              <div
                className="h-full rounded-full bg-linear-to-r from-[#f08c2b] to-[#de4925] transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-white/80 bg-white/70 p-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
              <CircleDollarSign className="h-3.5 w-3.5 text-[#f08c2b]" />
              Cashflow total
            </div>
            <p className="mt-1 text-lg font-semibold text-gray-900">{formatCurrency(total)}</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-emerald-700">
              <Wallet className="h-3.5 w-3.5" />
              Paid
            </div>
            <p className="mt-1 text-lg font-semibold text-emerald-800">{formatCurrency(paid)}</p>
          </div>
          <div className="rounded-lg border border-rose-100 bg-rose-50/60 p-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-rose-700">
              <Banknote className="h-3.5 w-3.5" />
              Balance
            </div>
            <p className="mt-1 text-lg font-semibold text-rose-800">{formatCurrency(outstanding)}</p>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50/80 px-4 py-3">
          <h4 className="text-sm font-semibold text-gray-900">Payment history</h4>
          <p className="text-xs text-gray-500">
            {payments.length === 0
              ? "No payments recorded yet."
              : `${payments.length} payment${payments.length === 1 ? "" : "s"} applied to this cashflow`}
          </p>
        </div>

        {payments.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            Payments will appear here once recorded against this cashflow.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-white">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Date
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Transaction #
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Mode
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Reference
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Amount
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Recorded by
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-orange-50/30">
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                      {formatDateTime(payment.payment_date)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {payment.transaction_number ? (
                        <span className="font-mono text-xs font-medium text-[#de4925]">
                          {payment.transaction_number}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                      {payment.mode ? titleCase(payment.mode.replace(/_/g, " ")) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-600">
                      {payment.reference_number || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-gray-900">
                      {formatCurrency(Number(payment.amount || 0))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                      {payment.processed_by_name || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-gray-100 bg-gray-50/50">
                <tr>
                  <td colSpan={4} className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Total paid
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm font-semibold text-emerald-700">
                    {formatCurrency(paid)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
