"use client"

import { CheckCircle2, Shield, Users, FileText, Percent, XCircle } from "lucide-react"

type LoanProductEligibility = {
  id: string
  eligibility: string
  status: string
}

type LoanProductDetail = {
  product_name: string
  product_code: string
  description: string | null
  collateral_required: boolean
  guarantors_required: number
  insurance_required: boolean
  processing_fee_percentage: number
  eligibilities?: LoanProductEligibility[]
}

interface LoanProductExpandableContentProps {
  loanProduct: LoanProductDetail
}

function RequirementCard({
  title,
  value,
  active,
  icon,
}: {
  title: string
  value: string
  active: boolean
  icon: React.ReactNode
}) {
  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        active
          ? "border-brand/35 bg-linear-to-br from-brand/10 via-brand/5 to-card"
          : "border-border bg-muted/40"
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <div
          className={`rounded-lg p-2 ${
            active
              ? "border border-brand/20 bg-card text-brand"
              : "border border-border bg-card text-muted-foreground"
          }`}
        >
          {icon}
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      </div>
      <p className={`text-sm font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}>{value}</p>
    </div>
  )
}

export default function LoanProductExpandableContent({ loanProduct }: LoanProductExpandableContentProps) {
  const eligibilities = Array.isArray(loanProduct.eligibilities) ? loanProduct.eligibilities : []

  return (
    <div className="space-y-5 p-5">
      <div className="rounded-xl border border-brand/30 bg-linear-to-r from-brand/10 via-brand/5 to-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Loan Product Details</p>
            <h3 className="mt-1 text-lg font-bold text-foreground">{loanProduct.product_name}</h3>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{loanProduct.product_code}</p>
          </div>
          <span className="inline-flex items-center rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
            {eligibilities.length} Eligibilit{eligibilities.length === 1 ? "y" : "ies"}
          </span>
        </div>
        <p className="mt-3 text-sm text-foreground/80">
          {loanProduct.description?.trim() || "No product description provided."}
        </p>
      </div>

      <div>
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Requirements</h4>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <RequirementCard
            title="Collateral"
            value={loanProduct.collateral_required ? "Required" : "Not required"}
            active={loanProduct.collateral_required}
            icon={<Shield className="h-4 w-4" />}
          />
          <RequirementCard
            title="Guarantors"
            value={loanProduct.guarantors_required > 0 ? `${loanProduct.guarantors_required} required` : "Not required"}
            active={loanProduct.guarantors_required > 0}
            icon={<Users className="h-4 w-4" />}
          />
          <RequirementCard
            title="Insurance"
            value={loanProduct.insurance_required ? "Required" : "Not required"}
            active={loanProduct.insurance_required}
            icon={<FileText className="h-4 w-4" />}
          />
          <RequirementCard
            title="Processing Fee"
            value={loanProduct.processing_fee_percentage > 0 ? `${loanProduct.processing_fee_percentage}%` : "No fee"}
            active={loanProduct.processing_fee_percentage > 0}
            icon={<Percent className="h-4 w-4" />}
          />
        </div>
      </div>

      <div>
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Eligibilities</h4>
        {eligibilities.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            No eligibility rules configured for this loan product.
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {eligibilities.map((item) => {
              const isActive = String(item.status || "Active") !== "Inactive"
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
                >
                  <p className="text-sm font-medium text-foreground">{item.eligibility}</p>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      isActive
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isActive ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    {isActive ? "Active" : "Inactive"}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
