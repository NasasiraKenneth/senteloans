"use client"

import { ArrowDownLeft, ArrowUpRight, Calendar, FileText } from "lucide-react"

export type InvestmentCashflowDetail = {
  id: string
  type: "inflow" | "outflow"
  category: string
  amount: number
  description: string | null
  date: string | null
  created_at: string
  transaction_id: string | null
  transaction_number: string | null
  report_id: string | null
  report_number: string | null
}

interface InvestmentCashflowExpandableContentProps {
  cashflow: InvestmentCashflowDetail
  formatCurrency: (v: number) => string
  formatDate: (v?: string | null) => string
  titleCase: (v: string) => string
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:border-brand/35">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-all font-mono text-sm text-foreground">{value}</p>
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
  const recordedAt = cashflow.created_at ? new Date(cashflow.created_at).toLocaleString("en-UG") : "—"

  return (
    <div className="space-y-5 p-5">
      <div
        className={`rounded-xl border p-4 ${
          isInflow
            ? "border-emerald-500/25 bg-linear-to-r from-emerald-500/10 via-card to-card"
            : "border-rose-500/25 bg-linear-to-r from-rose-500/10 via-card to-card"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`rounded-lg p-2 ${
                isInflow
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "bg-rose-500/15 text-rose-700 dark:text-rose-300"
              }`}
            >
              {isInflow ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cashflow</p>
              <h3 className="mt-1 text-lg font-bold text-foreground">
                {titleCase(cashflow.type)} · {titleCase(cashflow.category)}
              </h3>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5 text-brand" />
                {displayDate}
              </p>
            </div>
          </div>
          <span className="text-lg font-bold tabular-nums text-foreground">{formatCurrency(cashflow.amount)}</span>
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-card/90 px-3 py-2">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <p className="text-sm text-foreground/80">
            {cashflow.description?.trim() || "No description recorded for this cashflow."}
          </p>
        </div>
      </div>

      <div>
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Record details</h4>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem
            label="Transaction Number"
            value={cashflow.transaction_number?.trim() || "—"}
          />
          <DetailItem label="Report Number" value={cashflow.report_number?.trim() || "—"} />
          <DetailItem label="Cashflow date" value={cashflow.date ? formatDate(cashflow.date) : "—"} />
          <DetailItem label="Recorded at" value={recordedAt} />
        </div>
      </div>
    </div>
  )
}
