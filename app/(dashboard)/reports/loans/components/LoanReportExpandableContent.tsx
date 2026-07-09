"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Calendar, User, Users, Wallet } from "lucide-react"
import type { LoanReportRow } from "../page"

function money(amount: number, currency = "UGX") {
  return `${currency} ${Math.round(amount || 0).toLocaleString()}`
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  )
}

export default function LoanReportExpandableContent({
  loan,
  currency = "UGX",
}: {
  loan: LoanReportRow
  currency?: string
}) {
  const guarantors = Array.isArray(loan.guarantors) ? loan.guarantors : []
  const disbursedBy = Array.isArray(loan.disbursed_by) ? loan.disbursed_by : []

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Loan detail</p>
          <p className="text-sm font-bold text-foreground">{loan.application_id}</p>
        </div>
        <Link
          href={`/loans/${loan.id}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
        >
          Open loan <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DetailItem label="Tenure" value={`${loan.tenure_months} months`} />
        <DetailItem label="Interest rate" value={`${loan.interest_rate}%`} />
        <DetailItem label="Amount paid" value={money(loan.total_amount_paid || 0, currency)} />
        <DetailItem label="Interest collected" value={money(loan.total_interest || 0, currency)} />
        <DetailItem label="Penalties" value={money(loan.penalties_collected || 0, currency)} />
        <DetailItem label="Avg late days" value={Number(loan.late_pay_days_avg || 0).toLocaleString()} />
        <DetailItem label="Early payments" value={Number(loan.early_payments || 0).toLocaleString()} />
        <DetailItem
          label="Overdue"
          value={
            loan.overdue ? (
              <Badge variant="destructive" className="text-[10px]">
                Yes
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px]">
                No
              </Badge>
            )
          }
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-border/60 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            Workflow
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <DetailItem label="Applied" value={loan.application_date ? String(loan.application_date).slice(0, 10) : "—"} />
            <DetailItem label="Created by" value={loan.created_by_name} />
            <DetailItem label="Reviewed" value={loan.reviewed_at ? String(loan.reviewed_at).slice(0, 10) : "—"} />
            <DetailItem label="Reviewed by" value={loan.reviewed_by_name} />
            <DetailItem label="Approved" value={loan.approved_at ? String(loan.approved_at).slice(0, 10) : "—"} />
            <DetailItem label="Approved by" value={loan.approved_by_name} />
            <DetailItem label="Disbursed" value={loan.disbursed_at ? String(loan.disbursed_at).slice(0, 10) : "—"} />
            <DetailItem label="Next due" value={loan.next_payment_date ? String(loan.next_payment_date).slice(0, 10) : "—"} />
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-border/60 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Guarantors ({guarantors.length})
            </div>
            {guarantors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No guarantors recorded.</p>
            ) : (
              <ul className="space-y-1">
                {guarantors.map((name, i) => (
                  <li key={`${name}-${i}`} className="text-sm font-medium text-foreground">
                    {i + 1}. {name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-border/60 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" />
              Disbursed by ({disbursedBy.length})
            </div>
            {disbursedBy.length === 0 ? (
              <p className="text-sm text-muted-foreground">No disbursement officers recorded.</p>
            ) : (
              <ul className="space-y-1">
                {disbursedBy.map((name, i) => (
                  <li key={`${name}-${i}`} className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    {name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
