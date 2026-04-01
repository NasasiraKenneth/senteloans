"use client"

import { ArrowDownLeft, ArrowUpRight, Calendar, FileText, Hash } from "lucide-react"

export type InvestmentCashflowDetail = {
  id: string
  type: "inflow" | "outflow"
  category: string
  amount: number
  description: string | null
  date: string | null
  created_at: string
  transaction_id: string | null
  report_id: string | null
}

interface InvestmentCashflowExpandableContentProps {
  cashflow: InvestmentCashflowDetail
  formatCurrency: (v: number) => string
  formatDate: (v?: string | null) => string
  titleCase: (v: string) => string
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-0.5 break-all font-mono text-sm text-gray-900">{value}</p>
    </div>
  )
}

export default function InvestmentCashflowExpandableContent({
  cashflow,
  formatCurrency,
  formatDate,
  titleCase,
}: InvestmentCashflowExpandableContentProps) {
  const isInflow = cashflow.type === "inflow"
  const displayDate = cashflow.date ? formatDate(cashflow.date) : formatDate(cashflow.created_at)

  return (
    <div className="space-y-5 p-5">
      <div
        className={`rounded-xl border p-4 ${
          isInflow
            ? "border-emerald-200 bg-linear-to-r from-emerald-50 via-white to-white"
            : "border-rose-200 bg-linear-to-r from-rose-50 via-white to-white"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`rounded-lg p-2 ${
                isInflow ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
              }`}
            >
              {isInflow ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Cashflow</p>
              <h3 className="mt-1 text-lg font-bold text-gray-900">
                {titleCase(cashflow.type)} · {titleCase(cashflow.category)}
              </h3>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-600">
                <Calendar className="h-3.5 w-3.5" />
                {displayDate}
              </p>
            </div>
          </div>
          <span className="text-lg font-bold tabular-nums text-gray-900">{formatCurrency(cashflow.amount)}</span>
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-gray-100 bg-white/80 px-3 py-2">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          <p className="text-sm text-gray-700">
            {cashflow.description?.trim() || "No description recorded for this cashflow."}
          </p>
        </div>
      </div>

      <div>
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">Record details</h4>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem label="Cashflow ID" value={cashflow.id} />
          <DetailItem
            label="Transaction ID"
            value={cashflow.transaction_id?.trim() || "—"}
          />
          <DetailItem label="Report ID" value={cashflow.report_id?.trim() || "—"} />
          <DetailItem label="Cashflow date" value={cashflow.date ? formatDate(cashflow.date) : "—"} />
          <DetailItem label="Recorded at" value={formatDate(cashflow.created_at)} />
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Hash className="h-3 w-3" />
              Links
            </p>
            <p className="mt-1 text-xs text-gray-600">
              Transaction and report IDs tie this row to general ledger transactions and monthly investment reports when
              present.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
