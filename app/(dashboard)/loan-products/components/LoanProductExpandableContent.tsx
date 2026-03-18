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
          ? "border-[#f08c2b]/40 bg-linear-to-br from-orange-50 to-amber-50"
          : "border-gray-200 bg-gray-50"
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <div className={`rounded-lg p-2 ${active ? "bg-white text-[#de4925]" : "bg-white text-gray-500"}`}>
          {icon}
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      </div>
      <p className={`text-sm font-semibold ${active ? "text-gray-900" : "text-gray-500"}`}>{value}</p>
    </div>
  )
}

export default function LoanProductExpandableContent({ loanProduct }: LoanProductExpandableContentProps) {
  const eligibilities = Array.isArray(loanProduct.eligibilities) ? loanProduct.eligibilities : []

  return (
    <div className="space-y-5 p-5">
      <div className="rounded-xl border border-[#f08c2b]/30 bg-linear-to-r from-orange-50 via-amber-50 to-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Loan Product Details</p>
            <h3 className="mt-1 text-lg font-bold text-gray-900">{loanProduct.product_name}</h3>
            <p className="mt-1 font-mono text-xs text-gray-600">{loanProduct.product_code}</p>
          </div>
          <span className="inline-flex items-center rounded-full border border-[#f08c2b]/30 bg-white px-3 py-1 text-xs font-semibold text-[#de4925]">
            {eligibilities.length} Eligibilit{eligibilities.length === 1 ? "y" : "ies"}
          </span>
        </div>
        <p className="mt-3 text-sm text-gray-700">
          {loanProduct.description?.trim() || "No product description provided."}
        </p>
      </div>

      <div>
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">Requirements</h4>
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
        <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">Eligibilities</h4>
        {eligibilities.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            No eligibility rules configured for this loan product.
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {eligibilities.map((item) => {
              const isActive = String(item.status || "Active") !== "Inactive"
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                >
                  <p className="text-sm font-medium text-gray-800">{item.eligibility}</p>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      isActive ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-700"
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
