"use client"

import { useEffect, useMemo, useState } from "react"
import { Calculator, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import StyledSelect from "@/components/newUI/styled_select"
import { formatCurrency } from "@/lib/format-currency"
import {
  calculateCompleteDisbursementAmount,
  calculateLoanTerms,
  normalizeLoanMethod,
  type LoanCalculationMethod,
} from "@/lib/loans/calculations"

type LoanType = "normal" | "top up" | "buy off"

interface LoanProductOption {
  id: string
  product_name: string
  interest_rate: number
  interest_calculation_method: string
  processing_fee_percentage: number
  minimum_amount: number
  maximum_amount: number
  minimum_tenure_months: number
  maximum_tenure_months: number
}

interface MemberOption {
  id: string
  full_name: string
  member_number: string
}

interface MemberLoanOption {
  id: string
  application_id?: string
  status?: string
  outstanding_balance?: number
  principal_amount?: number
}

interface LoanCalculatorFormProps {
  onClose?: () => void
  onApplyLoan?: () => void
  currency?: string
}

const inputClass =
  "w-full px-3 py-2.5 text-sm rounded-md border transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none border-gray-300 hover:border-gray-400"

const productStyleInputClass = (hasError = false) =>
  `${inputClass} ${hasError ? "border-red-500" : ""}`

const methodLabels: Record<LoanCalculationMethod, string> = {
  reducing_balance: "Reducing Balance",
  flat_rate: "Flat Rate",
  compound: "Compound Interest",
}

const loanTypeOptions = [
  { value: "normal", label: "Normal" },
  { value: "top up", label: "Top Up" },
  { value: "buy off", label: "Buy Off" },
]

export default function LoanCalculatorForm({
  onClose,
  onApplyLoan,
  currency,
}: LoanCalculatorFormProps) {
  const [products, setProducts] = useState<LoanProductOption[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [members, setMembers] = useState<MemberOption[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [topUpLoans, setTopUpLoans] = useState<MemberLoanOption[]>([])
  const [loadingTopUpLoans, setLoadingTopUpLoans] = useState(false)

  const [loanType, setLoanType] = useState<LoanType>("normal")
  const [loanProductId, setLoanProductId] = useState("")
  const [memberId, setMemberId] = useState("")
  const [topUpLoanId, setTopUpLoanId] = useState("")
  const [externalOutstandingBalance, setExternalOutstandingBalance] = useState("")
  const [principal, setPrincipal] = useState("")
  const [tenure, setTenure] = useState("")

  useEffect(() => {
    let ignore = false
    async function loadProducts() {
      setLoadingProducts(true)
      try {
        const res = await fetch("/api/institution/loan-products?status=Active&pageSize=200", { cache: "no-store" })
        if (!res.ok) return
        const json = await res.json()
        if (ignore) return
        const items = Array.isArray(json.items) ? json.items : []
        setProducts(
          items.map((p: Record<string, unknown>) => ({
            id: String(p.id || ""),
            product_name: String(p.product_name || ""),
            interest_rate: Number(p.interest_rate || 0),
            interest_calculation_method: String(p.interest_calculation_method || "reducing_balance"),
            processing_fee_percentage: Number(p.processing_fee_percentage || 0),
            minimum_amount: Number(p.minimum_amount || 0),
            maximum_amount: Number(p.maximum_amount || 0),
            minimum_tenure_months: Number(p.minimum_tenure_months || 0),
            maximum_tenure_months: Number(p.maximum_tenure_months || 0),
          })),
        )
      } catch {
        // keep empty list
      } finally {
        if (!ignore) setLoadingProducts(false)
      }
    }
    void loadProducts()
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    let ignore = false
    async function loadMembers() {
      setLoadingMembers(true)
      try {
        const res = await fetch("/api/institution/members?limit=100", { cache: "no-store" })
        if (!res.ok) return
        const json = await res.json()
        if (ignore) return
        const rows = Array.isArray(json.members) ? json.members : []
        setMembers(
          rows.map((m: Record<string, unknown>) => ({
            id: String(m.id || ""),
            full_name: String(m.full_name || "").trim(),
            member_number: String(m.member_number || "").trim(),
          })),
        )
      } catch {
        if (!ignore) setMembers([])
      } finally {
        if (!ignore) setLoadingMembers(false)
      }
    }
    void loadMembers()
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    let ignore = false
    if (loanType !== "top up" || !memberId) {
      setTopUpLoans([])
      setLoadingTopUpLoans(false)
      return
    }

    async function loadMemberLoans() {
      setLoadingTopUpLoans(true)
      try {
        const res = await fetch(
          `/api/institution/loans?member_id=${encodeURIComponent(memberId)}&pageSize=100`,
          { cache: "no-store" },
        )
        if (!res.ok) return
        const json = await res.json()
        if (ignore) return
        const items = Array.isArray(json.items) ? json.items : []
        setTopUpLoans(
          items.filter(
            (loan: MemberLoanOption & { status?: string }) =>
              !["Rejected", "Closed", "Paid"].includes(String(loan.status || "")),
          ),
        )
      } catch {
        if (!ignore) setTopUpLoans([])
      } finally {
        if (!ignore) setLoadingTopUpLoans(false)
      }
    }

    void loadMemberLoans()
    return () => {
      ignore = true
    }
  }, [loanType, memberId])

  const handleLoanTypeChange = (value: string) => {
    const next = value as LoanType
    setLoanType(next)
    setMemberId("")
    setTopUpLoanId("")
    setExternalOutstandingBalance("")
  }

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === loanProductId) || null,
    [products, loanProductId],
  )

  const selectedTopUpLoan = useMemo(
    () => topUpLoans.find((loan) => String(loan.id) === topUpLoanId) || null,
    [topUpLoans, topUpLoanId],
  )

  const productSelectOptions = useMemo(
    () =>
      products.map((p) => ({
        value: p.id,
        label: `${p.product_name} (${p.interest_rate}%)`,
      })),
    [products],
  )

  const memberSelectOptions = useMemo(
    () =>
      members.map((m) => ({
        value: m.id,
        label: `${m.full_name} (${m.member_number})`,
      })),
    [members],
  )

  const topUpLoanSelectOptions = useMemo(
    () =>
      topUpLoans.map((loan) => ({
        value: String(loan.id),
        label: `${loan.application_id || "Loan"} - ${loan.status || "Unknown"} - ${formatCurrency(
          Number(loan.outstanding_balance || loan.principal_amount || 0),
          currency,
          { fractionDigits: 0 },
        )}`,
      })),
    [topUpLoans, currency],
  )

  const principalNum = Math.max(Number(principal) || 0, 0)
  const tenureNum = Math.max(Math.floor(Number(tenure) || 0), 0)
  const annualRate = selectedProduct?.interest_rate ?? 0
  const method = normalizeLoanMethod(selectedProduct?.interest_calculation_method)
  const processingFeePct = selectedProduct?.processing_fee_percentage ?? 0

  const settlementAmount = useMemo(() => {
    if (loanType === "top up") {
      return Math.max(Number(selectedTopUpLoan?.outstanding_balance || 0), 0)
    }
    if (loanType === "buy off") {
      return Math.max(Number(externalOutstandingBalance) || 0, 0)
    }
    return 0
  }, [loanType, selectedTopUpLoan, externalOutstandingBalance])

  const terms = useMemo(() => {
    if (principalNum <= 0 || tenureNum <= 0) return null
    return calculateLoanTerms(principalNum, annualRate, tenureNum, method)
  }, [principalNum, tenureNum, annualRate, method])

  const disbursement = useMemo(() => {
    if (principalNum <= 0) return null
    return calculateCompleteDisbursementAmount({
      principal: principalNum,
      processingFeePercentage: processingFeePct,
      settlementAmount,
      loanType,
    })
  }, [principalNum, processingFeePct, settlementAmount, loanType])

  const totalInterest = terms ? Math.max(terms.totalAmount - principalNum, 0) : 0
  const fmt = (n: number) => formatCurrency(n, currency, { fractionDigits: 2 })

  const principalRangeError = useMemo(() => {
    if (!selectedProduct) return ""
    const raw = String(principal ?? "").trim()
    if (!raw) return ""
    const amount = Number(raw)
    if (!Number.isFinite(amount) || amount <= 0) return "Principal amount must be greater than 0."
    const minAmt = Number(selectedProduct.minimum_amount || 0)
    const maxAmt = Number(selectedProduct.maximum_amount || 0)
    if (minAmt > 0 && amount < minAmt) return `Minimum allowed is ${fmt(minAmt)}.`
    if (maxAmt > 0 && amount > maxAmt) return `Maximum allowed is ${fmt(maxAmt)}.`
    return ""
  }, [principal, selectedProduct, currency])

  const tenureRangeError = useMemo(() => {
    if (!selectedProduct) return ""
    const raw = String(tenure ?? "").trim()
    if (!raw) return ""
    const tenureMonths = Number(raw)
    if (!Number.isFinite(tenureMonths) || tenureMonths <= 0) return "Tenure must be greater than 0 months."
    const minTen = Number(selectedProduct.minimum_tenure_months || 1)
    const maxTen = Number(selectedProduct.maximum_tenure_months || 0)
    if (tenureMonths < minTen) return `Minimum tenure is ${minTen} month(s).`
    if (maxTen > 0 && tenureMonths > maxTen) return `Maximum tenure is ${maxTen} month(s).`
    return ""
  }, [tenure, selectedProduct])

  const productHint = selectedProduct
    ? [
        selectedProduct.minimum_amount > 0 || selectedProduct.maximum_amount > 0
          ? `Amount: ${selectedProduct.minimum_amount > 0 ? fmt(selectedProduct.minimum_amount) : "—"} – ${selectedProduct.maximum_amount > 0 ? fmt(selectedProduct.maximum_amount) : "—"}`
          : null,
        selectedProduct.minimum_tenure_months > 0 || selectedProduct.maximum_tenure_months > 0
          ? `Tenure: ${selectedProduct.minimum_tenure_months || "—"} – ${selectedProduct.maximum_tenure_months || "—"} months`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : ""

  const hasLoanTypeInputs =
    loanType === "normal" ||
    (loanType === "top up" && Boolean(memberId) && Boolean(topUpLoanId)) ||
    (loanType === "buy off" && settlementAmount > 0)

  const canCalculate =
    principalNum > 0 &&
    tenureNum > 0 &&
    !!selectedProduct &&
    hasLoanTypeInputs &&
    !principalRangeError &&
    !tenureRangeError

  return (
    <>
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f08c2b]/10">
          <Calculator className="h-4 w-4 text-[#f08c2b]" />
        </div>
        <div>
          <h2 className="text-base font-semibold">Loan Calculator</h2>
          <p className="text-xs text-muted-foreground">Estimate repayments and net disbursement</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Loan Type</label>
          <StyledSelect
            value={loanType}
            onChange={handleLoanTypeChange}
            placeholder="Choose loan type"
            options={loanTypeOptions}
          />
        </div>

        {loanType === "top up" && (
          <div className="space-y-3 rounded-lg border border-[#f08c2b]/20 bg-[#fff8f2] p-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">Member</label>
              <StyledSelect
                value={memberId}
                onChange={(value) => {
                  setMemberId(value)
                  setTopUpLoanId("")
                }}
                placeholder={loadingMembers ? "Loading members…" : "Select member"}
                options={memberSelectOptions}
                searchable
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">Existing Loan</label>
              <StyledSelect
                value={topUpLoanId}
                onChange={setTopUpLoanId}
                placeholder={
                  !memberId
                    ? "Select a member first"
                    : loadingTopUpLoans
                      ? "Loading member loans…"
                      : topUpLoanSelectOptions.length
                        ? "Select loan to top up"
                        : "No active loans for this member"
                }
                options={topUpLoanSelectOptions}
                searchable
              />
              {selectedTopUpLoan && (
                <p className="text-xs text-muted-foreground">
                  Outstanding balance: {fmt(Number(selectedTopUpLoan.outstanding_balance || 0))}
                </p>
              )}
            </div>
          </div>
        )}

        {loanType === "buy off" && (
          <div className="space-y-1.5 rounded-lg border border-[#f08c2b]/20 bg-[#fff8f2] p-3">
            <label className="block text-sm font-medium text-gray-700">External Loan Outstanding Balance</label>
            <input
              type="number"
              min={0}
              step="any"
              placeholder="e.g. 2500000"
              value={externalOutstandingBalance}
              onChange={(e) => setExternalOutstandingBalance(e.target.value)}
              className={inputClass}
            />
            <p className="text-xs text-muted-foreground">
              Amount required to settle the external lender before member disbursement.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Loan Product</label>
          <StyledSelect
            value={loanProductId}
            onChange={setLoanProductId}
            placeholder={loadingProducts ? "Loading products…" : "Choose loan product"}
            options={productSelectOptions}
            searchable
          />
          {productHint && <p className="text-xs text-muted-foreground">{productHint}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">Principal Amount</label>
            <input
              type="number"
              min={0}
              placeholder="e.g. 5000000"
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
              className={productStyleInputClass(Boolean(principalRangeError))}
            />
            {principalRangeError && <p className="text-xs text-red-500">{principalRangeError}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">Tenure (months)</label>
            <input
              type="number"
              min={1}
              placeholder="e.g. 12"
              value={tenure}
              onChange={(e) => setTenure(e.target.value)}
              className={productStyleInputClass(Boolean(tenureRangeError))}
            />
            {tenureRangeError && <p className="text-xs text-red-500">{tenureRangeError}</p>}
          </div>
        </div>
      </div>

      {selectedProduct && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
            Rate: {annualRate}%
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
            {methodLabels[method]}
          </span>
          {processingFeePct > 0 && (
            <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
              Processing fee: {processingFeePct}%
            </span>
          )}
        </div>
      )}

      <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
        {canCalculate && terms && disbursement ? (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Monthly Payment</span>
              <span className="font-semibold">{fmt(terms.monthlyPayment)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Interest</span>
              <span className="font-medium">{fmt(totalInterest)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Repayment</span>
              <span className="font-medium">{fmt(terms.totalAmount)}</span>
            </div>
            {disbursement.processingFeeAmount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Processing Fee</span>
                <span className="font-medium text-rose-600">− {fmt(disbursement.processingFeeAmount)}</span>
              </div>
            )}
            {(loanType === "top up" || loanType === "buy off") && settlementAmount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {loanType === "top up" ? "Internal Settlement" : "External Settlement"}
                </span>
                <span className="font-medium text-rose-600">− {fmt(settlementAmount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-border pt-2">
              <span className="text-sm font-medium">Net Disbursement</span>
              <span className="text-lg font-bold tracking-tight text-[#f08c2b]">
                {fmt(disbursement.completeDisbursementAmount)}
              </span>
            </div>
          </>
        ) : (
          <p className="text-center text-sm text-muted-foreground py-2">
            {loanType === "top up"
              ? "Select loan type fields, product, principal, and tenure to see estimates."
              : loanType === "buy off"
                ? "Enter external outstanding balance, product, principal, and tenure to see estimates."
                : "Select a product and enter principal and tenure to see estimates."}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        {onClose && (
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        )}
        {onApplyLoan && (
          <Button size="sm" onClick={onApplyLoan}>
            <Plus className="mr-2 h-4 w-4" />
            New Application
          </Button>
        )}
      </div>
    </>
  )
}
