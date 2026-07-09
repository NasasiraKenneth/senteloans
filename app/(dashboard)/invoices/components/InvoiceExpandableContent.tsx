"use client"

import { Banknote, CircleDollarSign, Receipt, Wallet } from "lucide-react"
import { formatCurrency } from "@/lib/format-currency"

export interface InvoicePaymentLine {
  id: string
  amount: number
  payment_date: string
  transaction_number: string | null
  mode: string | null
  reference_number: string | null
  processed_by_name: string | null
  source?: string
}

export interface InvoiceExpandableModel {
  invoice_number: string
  client_name: string
  total_amount: number
  paid_amount?: number
  outstanding?: number
  status: string
  payments?: InvoicePaymentLine[]
}

interface InvoiceExpandableContentProps {
  invoice: InvoiceExpandableModel
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

export default function InvoiceExpandableContent({ invoice }: InvoiceExpandableContentProps) {
  const total = Number(invoice.total_amount || 0)
  const paid = Number(invoice.paid_amount || 0)
  const outstanding =
    typeof invoice.outstanding === "number"
      ? Math.max(invoice.outstanding, 0)
      : Math.max(total - paid, 0)
  const payments = invoice.payments ?? []
  const progress = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0

  return (
    <div className="space-y-4 p-5">
      <div className="rounded-xl border border-[#f08c2b]/25 bg-linear-to-r from-orange-50 via-amber-50/80 to-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-white p-2.5 text-[#de4925] shadow-sm ring-1 ring-[#f08c2b]/20">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Payment summary
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-900">{invoice.invoice_number}</p>
              <p className="text-sm text-gray-600">{invoice.client_name || "—"}</p>
            </div>
          </div>
          <div className="min-w-[180px] flex-1 sm:max-w-xs">
            <div className="mb-1 flex justify-between text-xs font-medium text-gray-600">
              <span>Collected</span>
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
              Invoice total
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
              : `${payments.length} payment${payments.length === 1 ? "" : "s"} applied to this invoice`}
          </p>
        </div>

        {payments.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            Payments will appear here once recorded against this invoice.
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
                      {payment.mode || "—"}
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
