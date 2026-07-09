"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { UserRound, CreditCard, Wallet, CalendarClock, ShieldCheck, CheckCircle2, Circle } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import { AnimatePresence, motion } from "framer-motion"
import StyledSelect from "@/components/newUI/styled_select"

export type LoanFormData = {
  member_id: string
  loan_product_id: string
  loan_type: "normal" | "top up" | "buy off"
  top_up_loan_id?: string
  external_outstanding_balance?: number
  external_lender_id?: string
  principal_amount: number
  tenure_months: number
  purpose: string
  collateral_description?: string
  guarantor_member_ids?: string[]
}

interface LoanFormProps {
  onSubmit: (data: LoanFormData) => Promise<void> | void
  loading?: boolean
}

export default function LoanForm({ onSubmit, loading = false }: LoanFormProps) {
  const { toast } = useToast()
  const [step, setStep] = useState(0)
  const stepContentRef = useRef<HTMLDivElement | null>(null)
  const [products, setProducts] = useState<any[]>([])
  const [guarantorOptions, setGuarantorOptions] = useState<any[]>([])
  const [topUpLoans, setTopUpLoans] = useState<any[]>([])
  const [loadingTopUpLoans, setLoadingTopUpLoans] = useState(false)
  const [lenderClients, setLenderClients] = useState<{ id: string; name: string }[]>([])
  const [form, setForm] = useState({
    member_id: "",
    loan_product_id: "",
    loan_type: "normal" as LoanFormData["loan_type"],
    top_up_loan_id: "",
    external_outstanding_balance: "",
    external_lender_id: "",
    principal_amount: "",
    tenure_months: "",
    purpose: "",
    collateral_description: "",
    guarantors: [] as string[],
  })
  const steps = ["Member", "Setup", "Financial", "Supporting", "Review"] as const

  const selectedProduct = useMemo(
    () => products.find((p) => String(p.id) === form.loan_product_id),
    [products, form.loan_product_id]
  )
  const selectedMember = useMemo(
    () => guarantorOptions.find((m) => String(m.id) === String(form.member_id)) || null,
    [guarantorOptions, form.member_id]
  )
  const memberSelectOptions = useMemo(
    () =>
      guarantorOptions.map((m) => ({
        value: String(m.id),
        label: `${m.full_name} (${m.member_number})`,
      })),
    [guarantorOptions]
  )
  const loanProductSelectOptions = useMemo(
    () =>
      products.map((p) => ({
        value: String(p.id),
        label: `${p.product_name} (${Number(p.interest_rate || 0)}%)`,
      })),
    [products]
  )
  const loanTypeSelectOptions = useMemo(
    () => [
      { value: "normal", label: "Normal" },
      { value: "top up", label: "Top Up" },
      { value: "buy off", label: "Buy Off" },
    ],
    []
  )
  const topUpLoanSelectOptions = useMemo(
    () =>
      topUpLoans.map((loan) => ({
        value: String(loan.id),
        label: `${loan.application_id || "Loan"} - ${loan.status || "Unknown"} - UGX ${Number(loan.outstanding_balance || loan.principal_amount || 0).toLocaleString()}`,
      })),
    [topUpLoans]
  )
  const externalLenderSelectOptions = useMemo(
    () => lenderClients.map((c) => ({ value: String(c.id), label: c.name || "Client" })),
    [lenderClients]
  )
  const selectedExternalLenderName = useMemo(() => {
    const id = String(form.external_lender_id || "").trim()
    if (!id) return ""
    return lenderClients.find((c) => String(c.id) === id)?.name?.trim() || ""
  }, [lenderClients, form.external_lender_id])
  const requiredGuarantorCount = useMemo(
    () => Math.max(Number(selectedProduct?.guarantors_required || 0), 0),
    [selectedProduct]
  )
  const selectedTopUpLoan = useMemo(
    () => topUpLoans.find((l) => String(l.id) === String(form.top_up_loan_id)) || null,
    [topUpLoans, form.top_up_loan_id]
  )
  const selectedGuarantorNames = useMemo(
    () =>
      form.guarantors
        .filter(Boolean)
        .map((id) => guarantorOptions.find((m) => String(m.id) === String(id))?.full_name || "Unknown")
        .filter(Boolean),
    [form.guarantors, guarantorOptions]
  )
  const principalRangeError = useMemo(() => {
    if (!selectedProduct) return ""
    const raw = String(form.principal_amount ?? "").trim()
    if (!raw) return ""
    const principal = Number(raw)
    if (!Number.isFinite(principal) || principal <= 0) return "Principal amount must be greater than 0."
    const minAmt = Number(selectedProduct.minimum_amount || 0)
    const maxAmt = Number(selectedProduct.maximum_amount || 0)
    if (principal < minAmt) return `Minimum allowed is UGX ${minAmt.toLocaleString()}.`
    if (maxAmt > 0 && principal > maxAmt) return `Maximum allowed is UGX ${maxAmt.toLocaleString()}.`
    return ""
  }, [form.principal_amount, selectedProduct])
  const tenureRangeError = useMemo(() => {
    if (!selectedProduct) return ""
    const raw = String(form.tenure_months ?? "").trim()
    if (!raw) return ""
    const tenure = Number(raw)
    if (!Number.isFinite(tenure) || tenure <= 0) return "Tenure must be greater than 0 months."
    const minTen = Number(selectedProduct.minimum_tenure_months || 1)
    const maxTen = Number(selectedProduct.maximum_tenure_months || 0)
    if (tenure < minTen) return `Minimum tenure is ${minTen} month(s).`
    if (maxTen > 0 && tenure > maxTen) return `Maximum tenure is ${maxTen} month(s).`
    return ""
  }, [form.tenure_months, selectedProduct])
  const productStyleInputClass = (hasError = false) =>
    `w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
      hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
    }`

  useEffect(() => {
    setForm((prev) => {
      const normalized = Array.isArray(prev.guarantors) ? prev.guarantors.slice(0, requiredGuarantorCount) : []
      while (normalized.length < requiredGuarantorCount) normalized.push("")
      return { ...prev, guarantors: normalized }
    })
  }, [requiredGuarantorCount])

  useEffect(() => {
    let stop = false
    ;(async () => {
      try {
        const res = await fetch("/api/institution/loan-products?status=Active&pageSize=200", { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || "Failed to load loan products")
        if (!stop) setProducts(Array.isArray(data?.items) ? data.items : [])
      } catch {
        if (!stop) setProducts([])
      }
    })()
    return () => {
      stop = true
    }
  }, [])

  useEffect(() => {
    if (stepContentRef.current) {
      stepContentRef.current.scrollTop = 0
    }
  }, [step])

  useEffect(() => {
    let stop = false
    if (form.loan_type !== "top up" || !form.member_id) {
      setTopUpLoans([])
      setLoadingTopUpLoans(false)
      return
    }

    ;(async () => {
      setLoadingTopUpLoans(true)
      try {
        const res = await fetch(`/api/institution/loans?member_id=${encodeURIComponent(form.member_id)}&pageSize=100`, {
          cache: "no-store",
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || "Failed to load member loans")
        const items = Array.isArray(data?.items) ? data.items : []
        const eligible = items.filter((loan: any) =>
          !["Rejected", "Closed", "Paid"].includes(String(loan.status || ""))
        )
        if (!stop) setTopUpLoans(eligible)
      } catch {
        if (!stop) setTopUpLoans([])
      } finally {
        if (!stop) setLoadingTopUpLoans(false)
      }
    })()

    return () => {
      stop = true
    }
  }, [form.loan_type, form.member_id])

  useEffect(() => {
    let stop = false
    ;(async () => {
      try {
        const res = await fetch("/api/institution/members?limit=100", { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || "Failed to load members")
        if (!stop) setGuarantorOptions(Array.isArray(data?.members) ? data.members : [])
      } catch {
        if (!stop) setGuarantorOptions([])
      }
    })()
    return () => {
      stop = true
    }
  }, [])

  useEffect(() => {
    let stop = false
    ;(async () => {
      try {
        const res = await fetch("/api/institution/third-party-agents?limit=200", { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || "Failed to load clients")
        const rows = Array.isArray(data?.third_party_agents) ? data.third_party_agents : []
        if (!stop)
          setLenderClients(
            rows.map((c: { id?: string; name?: string }) => ({ id: String(c.id || ""), name: String(c.name || "").trim() })).filter((c: { id: string }) => Boolean(c.id))
          )
      } catch {
        if (!stop) setLenderClients([])
      }
    })()
    return () => {
      stop = true
    }
  }, [])

  const getUniqueGuarantors = () => {
    const guarantorIds = form.guarantors.filter(Boolean)
    return Array.from(new Set(guarantorIds)).filter((id) => id !== form.member_id)
  }

  const getGuarantorOptionsForIndex = (index: number) => {
    const taken = new Set(
      form.guarantors
        .filter((id, idx) => idx !== index && Boolean(id))
        .map((id) => String(id))
    )
    return guarantorOptions
      .filter((m) => String(m.id) !== form.member_id && !taken.has(String(m.id)))
      .map((m) => ({ value: String(m.id), label: `${m.full_name} (${m.member_number})` }))
  }

  const validateAll = () => {
    const principal = Number(form.principal_amount)
    const tenure = Number(form.tenure_months)
    const externalOutstandingBalance = Number(form.external_outstanding_balance)
    const externalLenderId = String(form.external_lender_id || "").trim()
    const uniqueGuarantors = getUniqueGuarantors()

    if (!form.member_id) {
      toast({ variant: "warning", title: "Select member", description: "Please choose a member first." })
      return false
    }
    if (!form.loan_product_id) {
      toast({ variant: "warning", title: "Select product", description: "Please choose a loan product." })
      return false
    }
    if (form.loan_type === "top up" && !form.top_up_loan_id) {
      toast({ variant: "warning", title: "Select top up loan", description: "Please choose the loan being topped up." })
      return false
    }
    if (form.loan_type === "buy off" && (!Number.isFinite(externalOutstandingBalance) || externalOutstandingBalance <= 0)) {
      toast({ variant: "warning", title: "Enter outstanding balance", description: "Please provide the external loan outstanding balance." })
      return false
    }
    if (form.loan_type === "buy off" && !externalLenderId) {
      toast({ variant: "warning", title: "Select external lender", description: "Please choose the external lender from your client list." })
      return false
    }
    if (!Number.isFinite(principal) || principal <= 0) {
      toast({ variant: "warning", title: "Invalid amount", description: "Principal must be greater than zero." })
      return false
    }
    if (!Number.isFinite(tenure) || tenure <= 0) {
      toast({ variant: "warning", title: "Invalid tenure", description: "Tenure must be greater than zero." })
      return false
    }
    if (!form.purpose.trim()) {
      toast({ variant: "warning", title: "Purpose required", description: "Please provide a loan purpose." })
      return false
    }

    if (selectedProduct) {
      const minAmt = Number(selectedProduct.minimum_amount || 0)
      const maxAmt = Number(selectedProduct.maximum_amount || 0)
      const minTen = Number(selectedProduct.minimum_tenure_months || 1)
      const maxTen = Number(selectedProduct.maximum_tenure_months || 0)
      if (principal < minAmt || (maxAmt > 0 && principal > maxAmt)) {
        toast({
          variant: "warning",
          title: "Amount out of range",
          description: `Amount must be between UGX ${minAmt.toLocaleString()} and UGX ${maxAmt.toLocaleString()}.`,
        })
        return false
      }
      if (tenure < minTen || (maxTen > 0 && tenure > maxTen)) {
        toast({
          variant: "warning",
          title: "Tenure out of range",
          description: `Tenure must be between ${minTen} and ${maxTen} months.`,
        })
        return false
      }
    }

    if (selectedProduct) {
      if (selectedProduct.collateral_required && !form.collateral_description.trim()) {
        toast({
          variant: "warning",
          title: "Collateral required",
          description: "This loan product requires collateral details.",
        })
        return false
      }
      const requiredGuarantors = Number(selectedProduct.guarantors_required || 0)
      if (requiredGuarantors > 0 && uniqueGuarantors.length < requiredGuarantors) {
        toast({
          variant: "warning",
          title: "Guarantors required",
          description: `Select at least ${requiredGuarantors} guarantor(s).`,
        })
        return false
      }
    }

    return true
  }

  const validateForStep = (targetStep: number) => {
    const principal = Number(form.principal_amount)
    const tenure = Number(form.tenure_months)
    const externalOutstandingBalance = Number(form.external_outstanding_balance)
    const externalLenderId = String(form.external_lender_id || "").trim()
    const uniqueGuarantors = getUniqueGuarantors()

    if (targetStep === 0 && !form.member_id) {
      toast({ variant: "warning", title: "Select member", description: "Please choose a member first." })
      return false
    }
    if (targetStep === 1 && !form.loan_product_id) {
      toast({ variant: "warning", title: "Select product", description: "Please choose a loan product." })
      return false
    }
    if (targetStep === 1 && form.loan_type === "top up" && !form.top_up_loan_id) {
      toast({ variant: "warning", title: "Select top up loan", description: "Please choose the loan being topped up." })
      return false
    }
    if (targetStep === 1 && form.loan_type === "buy off" && (!Number.isFinite(externalOutstandingBalance) || externalOutstandingBalance <= 0)) {
      toast({ variant: "warning", title: "Enter outstanding balance", description: "Please provide the external loan outstanding balance." })
      return false
    }
    if (targetStep === 1 && form.loan_type === "buy off" && !externalLenderId) {
      toast({ variant: "warning", title: "Select external lender", description: "Please choose the external lender from your client list." })
      return false
    }
    if (targetStep === 2) {
      if (!Number.isFinite(principal) || principal <= 0) {
        toast({ variant: "warning", title: "Invalid amount", description: "Principal must be greater than zero." })
        return false
      }
      if (!Number.isFinite(tenure) || tenure <= 0) {
        toast({ variant: "warning", title: "Invalid tenure", description: "Tenure must be greater than zero." })
        return false
      }
      if (!form.purpose.trim()) {
        toast({ variant: "warning", title: "Purpose required", description: "Please provide a loan purpose." })
        return false
      }
    }
    if (targetStep >= 2 && selectedProduct) {
      const minAmt = Number(selectedProduct.minimum_amount || 0)
      const maxAmt = Number(selectedProduct.maximum_amount || 0)
      const minTen = Number(selectedProduct.minimum_tenure_months || 1)
      const maxTen = Number(selectedProduct.maximum_tenure_months || 0)
      if (principal < minAmt || (maxAmt > 0 && principal > maxAmt)) {
        toast({
          variant: "warning",
          title: "Amount out of range",
          description: `Amount must be between UGX ${minAmt.toLocaleString()} and UGX ${maxAmt.toLocaleString()}.`,
        })
        return false
      }
      if (tenure < minTen || (maxTen > 0 && tenure > maxTen)) {
        toast({
          variant: "warning",
          title: "Tenure out of range",
          description: `Tenure must be between ${minTen} and ${maxTen} months.`,
        })
        return false
      }
    }
    if (targetStep === 3 && selectedProduct) {
      if (selectedProduct.collateral_required && !form.collateral_description.trim()) {
        toast({
          variant: "warning",
          title: "Collateral required",
          description: "This loan product requires collateral details.",
        })
        return false
      }
      const requiredGuarantors = Number(selectedProduct.guarantors_required || 0)
      if (requiredGuarantors > 0 && uniqueGuarantors.length < requiredGuarantors) {
        toast({
          variant: "warning",
          title: "Guarantors required",
          description: `Select at least ${requiredGuarantors} guarantor(s).`,
        })
        return false
      }
    }
    return true
  }

  const goNext = () => {
    if (!validateForStep(step)) return
    setStep((prev) => Math.min(prev + 1, steps.length - 1))
  }
  const goToStep = (targetStep: number) => {
    if (targetStep <= step) {
      setStep(targetStep)
      return
    }

    for (let s = 0; s < targetStep; s++) {
      if (!validateForStep(s)) return
    }
    setStep(targetStep)
  }

  const submit = async () => {
    const principal = Number(form.principal_amount)
    const tenure = Number(form.tenure_months)
    const uniqueGuarantors = getUniqueGuarantors()
    if (!validateAll()) return

    await onSubmit({
      member_id: form.member_id,
      loan_product_id: form.loan_product_id,
      loan_type: form.loan_type,
      top_up_loan_id: form.loan_type === "top up" ? form.top_up_loan_id : undefined,
      external_outstanding_balance:
        form.loan_type === "buy off" ? Number(form.external_outstanding_balance || 0) : undefined,
      external_lender_id: form.loan_type === "buy off" ? String(form.external_lender_id || "").trim() : undefined,
      principal_amount: principal,
      tenure_months: tenure,
      purpose: form.purpose.trim(),
      collateral_description: form.collateral_description.trim() || undefined,
      guarantor_member_ids: uniqueGuarantors,
    })
  }

  return (
    <div className="max-h-[78vh] overflow-y-auto p-5 bg-linear-to-b from-white via-orange-50/20 to-white">
      <div className="mb-5 rounded-2xl border border-[#f08c2b]/35 bg-linear-to-r from-[#fff2e2] via-white to-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#de4925]">New Loan Application</p>
        <p className="mt-1 text-sm text-gray-600">Capture member, loan setup, and supporting details in one streamlined form.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <aside className="rounded-2xl border border-black/10 bg-black p-4 text-white">
          <p className="text-[11px] uppercase tracking-[0.16em] text-orange-300">Steps</p>
          <div className="relative mt-4 space-y-3">
            {steps.map((label, idx) => {
              const active = idx === step
              const done = idx < step
              return (
                <motion.button
                  key={label}
                  type="button"
                  onClick={() => goToStep(idx)}
                  initial={{ opacity: 0, x: -16, y: 8 }}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  transition={{ duration: 0.32, delay: idx * 0.06, ease: "easeOut" }}
                  whileHover={{ x: 4 }}
                  className={`relative w-full rounded-xl px-3 py-2 text-left transition ${
                    active ? "border-[#f08c2b] bg-white/10" : done ? "border-green-500/40 bg-green-500/10" : "border-white/10 bg-white/5"
                  }`}
                  style={{ marginLeft: `${idx * 6}px` }}
                >
                  <div className="flex items-center gap-3">
                    <motion.div
                      animate={active ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                      transition={active ? { duration: 1.2, repeat: Infinity, repeatType: "mirror" } : { duration: 0.2 }}
                      className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold ${
                        active
                          ? "border-[#f08c2b] bg-[#f08c2b] text-black"
                          : done
                            ? "border-green-400 bg-green-400 text-black"
                            : "border-white/40 bg-black text-white"
                      }`}
                    >
                      {idx + 1}
                      {active && <span className="absolute inset-0 border rounded-3xl border-[#f08c2b] animate-ping opacity-35" />}
                    </motion.div>
                    <div>
                      <p className={`text-sm font-semibold ${active ? "text-[#f08c2b]" : "text-white"}`}>{label}</p>
                      <p className="text-[11px] text-white/70">
                        {idx === 0
                          ? "Member details"
                          : idx === 1
                            ? "Loan setup"
                            : idx === 2
                              ? "Financial details"
                              : idx === 3
                                ? "Supporting details"
                                : "Review and submit"}
                      </p>
                    </div>
                  </div>
                </motion.button>
              )
            })}
          </div>
        </aside>

      <div ref={stepContentRef} className="rounded-2xl max-h-[41vh] overflow-auto border border-black/10 bg-white p-4 shadow-sm space-y-4">
        <AnimatePresence mode="wait">
        {step === 0 && (
        <motion.div
          key="step-0"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.24 }}
          className="space-y-3 rounded-xl border border-gray-200 bg-white p-3"
        >
              <Label className="flex items-center gap-2"><UserRound className="h-4 w-4 text-[#de4925]" /> Select Member</Label>
              <StyledSelect
                value={form.member_id}
                onChange={(value) => setForm((prev) => ({ ...prev, member_id: value }))}
                placeholder="Choose member"
                options={memberSelectOptions}
                searchable
              />
              {selectedMember && (
                <div className="rounded-xl border border-[#f08c2b]/30 bg-orange-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#de4925]">Selected Member</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-gray-700">
                    <p>Name: <span className="font-semibold">{selectedMember.full_name}</span></p>
                    <p>Member No: <span className="font-semibold">{selectedMember.member_number || "-"}</span></p>
                    <p>Phone: <span className="font-semibold">{selectedMember.phone_number || "-"}</span></p>
                    <p>Status: <span className="font-semibold">{selectedMember.status || "-"}</span></p>
                  </div>
                </div>
              )}
            </motion.div>
        )}
        {step === 1 && (
        <motion.div
          key="step-1"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.24 }}
          className="grid grid-cols-1 gap-4 rounded-xl border border-gray-200 bg-white p-3"
        >
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-[#de4925]" /> Loan Product</Label>
                <StyledSelect
                  value={form.loan_product_id}
                  onChange={(value) => setForm((prev) => ({ ...prev, loan_product_id: value }))}
                  placeholder="Choose loan product"
                  options={loanProductSelectOptions}
                  searchable
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#de4925]" /> Loan Type</Label>
                <StyledSelect
                  value={form.loan_type}
                  onChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      loan_type: value as LoanFormData["loan_type"],
                      top_up_loan_id: value === "top up" ? prev.top_up_loan_id : "",
                      external_outstanding_balance: value === "buy off" ? prev.external_outstanding_balance : "",
                      external_lender_id: value === "buy off" ? prev.external_lender_id : "",
                    }))
                  }
                  placeholder="Choose loan type"
                  options={loanTypeSelectOptions}
                />
              </div>
              {form.loan_type === "top up" && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-[#de4925]" /> Loan To Top Up</Label>
                  <StyledSelect
                    value={form.top_up_loan_id}
                    onChange={(value) => setForm((prev) => ({ ...prev, top_up_loan_id: value }))}
                    placeholder={loadingTopUpLoans ? "Loading member loans..." : "Select existing loan"}
                    options={topUpLoanSelectOptions}
                    searchable
                  />
                </div>
              )}
              {form.loan_type === "buy off" && (
                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2"><Wallet className="h-4 w-4 text-[#de4925]" /> External Loan Outstanding Balance</Label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g. 2500000"
                      className={productStyleInputClass()}
                      value={form.external_outstanding_balance}
                      onChange={(e) => setForm((prev) => ({ ...prev, external_outstanding_balance: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-[#de4925]" /> Select external lender</Label>
                    <StyledSelect
                      value={form.external_lender_id}
                      onChange={(value) => setForm((prev) => ({ ...prev, external_lender_id: value }))}
                      placeholder={externalLenderSelectOptions.length ? "Choose client (external lender)" : "No clients loaded — check view_clients permission"}
                      options={externalLenderSelectOptions}
                      searchable
                    />
                  </div>
                </div>
              )}

              {selectedProduct && (
                <div className="rounded-xl border border-[#f08c2b]/30 bg-orange-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#de4925]">Selected Product</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-gray-700">
                    <p>Name: <span className="font-semibold">{selectedProduct.product_name}</span></p>
                    <p>Rate: <span className="font-semibold">{Number(selectedProduct.interest_rate || 0)}%</span></p>
                    <p>Min Amount: <span className="font-semibold">{Number(selectedProduct.minimum_amount || 0).toLocaleString()}</span></p>
                    <p>Max Tenure: <span className="font-semibold">{Number(selectedProduct.maximum_tenure_months || 0)} months</span></p>
                  </div>
                </div>
              )}
        </motion.div>
        )}
        {step === 2 && (
        <motion.div
          key="step-2"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.24 }}
          className="space-y-4 rounded-xl border border-gray-200 bg-white p-3"
        >
              <div>
                <h4 className="text-sm font-semibold text-gray-800 mb-3">Financial Details</h4>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Wallet className="h-4 w-4 text-[#de4925]" /> Principal Amount</Label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    className={productStyleInputClass(Boolean(principalRangeError))}
                    value={form.principal_amount}
                    onChange={(e) => setForm((prev) => ({ ...prev, principal_amount: e.target.value }))}
                  />
                  {principalRangeError && <p className="text-xs text-red-500">{principalRangeError}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-[#de4925]" /> Tenure (Months)</Label>
                  <input
                    type="number"
                    min="1"
                    placeholder="12"
                    className={productStyleInputClass(Boolean(tenureRangeError))}
                    value={form.tenure_months}
                    onChange={(e) => setForm((prev) => ({ ...prev, tenure_months: e.target.value }))}
                  />
                  {tenureRangeError && <p className="text-xs text-red-500">{tenureRangeError}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Purpose</Label>
                <textarea
                  rows={4}
                  placeholder="Describe the purpose of this loan..."
                  className={productStyleInputClass()}
                  value={form.purpose}
                  onChange={(e) => setForm((prev) => ({ ...prev, purpose: e.target.value }))}
                />
              </div>

              <div className="rounded-2xl border border-[#f08c2b]/25 bg-linear-to-r from-black via-[#171717] to-black p-4 text-white shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-orange-300">Financial Snapshot</p>
                    <p className="mt-1 text-sm text-white/75">Quick summary of selected setup and amount details.</p>
                  </div>
                  <span className="rounded-full border border-[#f08c2b]/35 bg-[#f08c2b]/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#f7b267]">
                    {form.loan_type || "normal"}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-white/60">Principal</p>
                    <p className="mt-1 text-base font-semibold text-[#f7b267]">
                      UGX {Number(form.principal_amount || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-white/60">Tenure</p>
                    <p className="mt-1 text-base font-semibold text-[#f7b267]">{form.tenure_months || "-"} months</p>
                  </div>
                  <div className="col-span-2 rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-white/60">Loan Product</p>
                    <p className="mt-1 text-sm font-semibold text-white">{selectedProduct?.product_name || "-"}</p>
                  </div>
                  {form.loan_type === "top up" && (
                    <div className="col-span-2 rounded-xl border border-[#f08c2b]/30 bg-[#f08c2b]/10 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-orange-200">Internal Outstanding Balance</p>
                      <p className="mt-1 text-sm font-semibold text-[#f7b267]">
                        UGX {Number(selectedTopUpLoan?.outstanding_balance || 0).toLocaleString()}
                      </p>
                      <p className="mt-1 text-xs text-orange-100">
                        Source Loan: <span className="font-semibold text-[#f7b267]">{selectedTopUpLoan?.application_id || "-"}</span>
                      </p>
                    </div>
                  )}
                  {form.loan_type === "buy off" && (
                    <div className="col-span-2 rounded-xl border border-[#f08c2b]/30 bg-[#f08c2b]/10 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-orange-200">External Outstanding Balance</p>
                      <p className="mt-1 text-sm font-semibold text-[#f7b267]">
                        UGX {Number(form.external_outstanding_balance || 0).toLocaleString()}
                      </p>
                      <p className="mt-1 text-xs text-orange-100">
                        Lender: <span className="font-semibold text-[#f7b267]">{selectedExternalLenderName || "-"}</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
        </motion.div>
        )}
        {step === 3 && (
        <motion.div
          key="step-3"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.24 }}
          className="space-y-4 rounded-xl border border-gray-200 bg-white p-3"
        >
              <div>
                <h4 className="text-sm font-semibold text-gray-800 mb-1">Supporting Details</h4>
                <p className="text-xs text-gray-500">Capture collateral and guarantor information for risk assessment.</p>
              </div>

              {selectedProduct && (
                <div className="rounded-xl border border-[#f08c2b]/30 bg-orange-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#de4925]">Product Requirements</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-gray-700">
                    <p>Collateral: <span className="font-semibold">{selectedProduct.collateral_required ? "Required" : "Optional"}</span></p>
                    <p>Guarantors: <span className="font-semibold">{Number(selectedProduct.guarantors_required || 0)}</span></p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Collateral Description</Label>
                <textarea
                  rows={3}
                  placeholder="Optional unless product requires collateral"
                  className={productStyleInputClass()}
                  value={form.collateral_description}
                  onChange={(e) => setForm((prev) => ({ ...prev, collateral_description: e.target.value }))}
                />
              </div>
              {requiredGuarantorCount > 0 ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: requiredGuarantorCount }).map((_, idx) => (
                    <div key={`guarantor-${idx}`} className="space-y-2">
                      <Label>{`Guarantor ${idx + 1}`}</Label>
                      <StyledSelect
                        value={form.guarantors[idx] || ""}
                        onChange={(value) =>
                          setForm((prev) => {
                            const next = [...prev.guarantors]
                            next[idx] = value
                            return { ...prev, guarantors: next }
                          })
                        }
                        placeholder="Select guarantor"
                        options={getGuarantorOptionsForIndex(idx)}
                        searchable
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3 text-sm text-gray-600">
                  This product does not require guarantors.
                </div>
              )}

        </motion.div>
        )}
        {step === 4 && (
        <motion.div
          key="step-4"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.24 }}
          className="space-y-4 rounded-xl border border-gray-200 bg-white p-4"
        >
              <div className="rounded-2xl border border-[#f08c2b]/30 bg-linear-to-r from-[#fff2e2] via-white to-[#fff7ef] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[#de4925] font-semibold">Final Review</p>
                    <p className="mt-1 text-sm text-gray-600">Confirm every detail before creating this loan application.</p>
                  </div>
                  <span className="rounded-full border border-[#f08c2b]/35 bg-[#f08c2b]/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#de4925]">
                    Step 5 of 5
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-black/10 bg-white p-3 xl:col-span-2">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Member Details</p>
                  <div className="mt-2 space-y-1 text-sm text-gray-700">
                    <p className="wrap-break-word">Name: <span className="font-semibold">{selectedMember?.full_name || "-"}</span></p>
                    <p className="wrap-break-word">Member No: <span className="font-semibold">{selectedMember?.member_number || "-"}</span></p>
                    <p className="wrap-break-word">Phone: <span className="font-semibold">{selectedMember?.phone_number || "-"}</span></p>
                    <p className="wrap-break-word">Status: <span className="font-semibold">{selectedMember?.status || "-"}</span></p>
                  </div>
                </div>

                <div className="rounded-xl border border-black/10 bg-white p-3">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Product & Type</p>
                  <div className="mt-2 space-y-1 text-sm text-gray-700">
                    <p className="wrap-break-word">Product: <span className="font-semibold">{selectedProduct?.product_name || "-"}</span></p>
                    <p className="wrap-break-word">Loan Type: <span className="font-semibold capitalize">{form.loan_type}</span></p>
                    <p className="wrap-break-word">Interest Rate: <span className="font-semibold">{Number(selectedProduct?.interest_rate || 0)}%</span></p>
                    <p className="wrap-break-word">Tenure Limit: <span className="font-semibold">{Number(selectedProduct?.maximum_tenure_months || 0)} months</span></p>
                  </div>
                </div>

                <div className="rounded-xl border border-black/10 bg-white p-3">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Financials</p>
                  <div className="mt-2 space-y-1 text-sm text-gray-700">
                    <p className="wrap-break-word">Principal: <span className="font-semibold">UGX {Number(form.principal_amount || 0).toLocaleString()}</span></p>
                    <p className="wrap-break-word">Tenure: <span className="font-semibold">{form.tenure_months || "-"} months</span></p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-black/10 bg-white p-3">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">Loan Type Specific Details</p>
                {form.loan_type === "top up" ? (
                  <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-gray-700 md:grid-cols-2">
                    <p className="wrap-break-word">Top Up Loan: <span className="font-semibold">{selectedTopUpLoan?.application_id || "-"}</span></p>
                    <p className="wrap-break-word">Internal Outstanding Balance: <span className="font-semibold">UGX {Number(selectedTopUpLoan?.outstanding_balance || 0).toLocaleString()}</span></p>
                  </div>
                ) : form.loan_type === "buy off" ? (
                  <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-gray-700 md:grid-cols-2">
                    <p className="wrap-break-word">External Lender: <span className="font-semibold">{selectedExternalLenderName || "-"}</span></p>
                    <p className="wrap-break-word">External Outstanding Balance: <span className="font-semibold">UGX {Number(form.external_outstanding_balance || 0).toLocaleString()}</span></p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-gray-600">No additional type-specific details required for normal loans.</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-black/10 bg-white p-3">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Purpose</p>
                  <p className="mt-2 text-sm text-gray-700">{form.purpose?.trim() || "-"}</p>
                </div>
                <div className="rounded-xl border border-black/10 bg-white p-3">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Collateral</p>
                  <p className="mt-2 text-sm text-gray-700">{form.collateral_description?.trim() || "N/A"}</p>
                </div>
              </div>

              <div className="rounded-xl border border-black/10 bg-white p-3">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">Guarantors</p>
                {requiredGuarantorCount > 0 ? (
                  <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-gray-700 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: requiredGuarantorCount }).map((_, idx) => (
                      <p key={`review-guarantor-${idx}`}>
                        {`Guarantor ${idx + 1}`}: <span className="font-semibold">{selectedGuarantorNames[idx] || "-"}</span>
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-gray-600">No guarantors required for this product.</p>
                )}
              </div>

              <div className="rounded-xl border border-black/10 bg-black p-3 text-white">
                <p className="text-xs uppercase tracking-wide text-orange-300">Ready to submit</p>
                <p className="mt-1 text-sm text-white/80">Confirm details above and create the loan application.</p>
              </div>
        </motion.div>
        )}
        </AnimatePresence>
        <div className="mt-5 flex items-center justify-between border-t pt-4">
          <Button
            type="button"
            variant="outline"
            className="border-black/20"
            onClick={() => setStep((prev) => Math.max(prev - 1, 0))}
            disabled={step === 0 || loading}
          >
            Back
          </Button>
          {step < steps.length - 1 ? (
            <Button type="button" className="bg-black hover:bg-black/90 text-[#f08c2b]" onClick={goNext} disabled={loading}>
              Continue
            </Button>
          ) : (
            <Button type="button" className="bg-black hover:bg-black/90 text-[#f08c2b]" onClick={submit} disabled={loading}>
              {loading ? "Submitting..." : "Create Loan Application"}
            </Button>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
