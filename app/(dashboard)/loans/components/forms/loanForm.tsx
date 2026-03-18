"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { UserRound, CreditCard, Wallet, CalendarClock, ShieldCheck, CheckCircle2, Circle } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import { AnimatePresence, motion } from "framer-motion"
import StyledSelect from "@/components/newUI/styled_select"

export type LoanFormData = {
  member_id: string
  loan_product_id: string
  loan_type: "normal" | "top up" | "buy off"
  top_up_loan_id?: string
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
  const [products, setProducts] = useState<any[]>([])
  const [guarantorOptions, setGuarantorOptions] = useState<any[]>([])
  const [topUpLoans, setTopUpLoans] = useState<any[]>([])
  const [loadingTopUpLoans, setLoadingTopUpLoans] = useState(false)
  const [form, setForm] = useState({
    member_id: "",
    loan_product_id: "",
    loan_type: "normal" as LoanFormData["loan_type"],
    top_up_loan_id: "",
    principal_amount: "",
    tenure_months: "",
    purpose: "",
    collateral_description: "",
    guarantor1: "",
    guarantor2: "",
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

  useEffect(() => {
    let stop = false
    ;(async () => {
      try {
        const res = await fetch("/api/institution/loan-products?status=Active&limit=200", { cache: "no-store" })
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

  const getUniqueGuarantors = () => {
    const guarantorIds = [form.guarantor1, form.guarantor2].filter(Boolean)
    return Array.from(new Set(guarantorIds)).filter((id) => id !== form.member_id)
  }

  const validateAll = () => {
    const principal = Number(form.principal_amount)
    const tenure = Number(form.tenure_months)
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
                  onClick={() => setStep(idx)}
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

      <div className="rounded-2xl max-h-[41vh] overflow-auto border border-black/10 bg-white p-4 shadow-sm space-y-4">
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Wallet className="h-4 w-4 text-[#de4925]" /> Principal Amount</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    className="h-11 border-black/15 focus-visible:ring-[#f08c2b]"
                    value={form.principal_amount}
                    onChange={(e) => setForm((prev) => ({ ...prev, principal_amount: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-[#de4925]" /> Tenure (Months)</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="12"
                    className="h-11 border-black/15 focus-visible:ring-[#f08c2b]"
                    value={form.tenure_months}
                    onChange={(e) => setForm((prev) => ({ ...prev, tenure_months: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Purpose</Label>
                <Textarea
                  rows={4}
                  placeholder="Describe the purpose of this loan..."
                  className="border-black/15 focus-visible:ring-[#f08c2b]"
                  value={form.purpose}
                  onChange={(e) => setForm((prev) => ({ ...prev, purpose: e.target.value }))}
                />
              </div>

              <div className="rounded-xl border border-black/10 bg-black p-3 text-white">
                <p className="text-xs uppercase tracking-wide text-orange-300">Financial Snapshot</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <p>Loan Type: <span className="font-semibold text-[#f08c2b] capitalize">{form.loan_type || "-"}</span></p>
                  {form.loan_type === "top up" && (
                    <p>Top Up Loan: <span className="font-semibold text-[#f08c2b]">{topUpLoans.find((l) => String(l.id) === form.top_up_loan_id)?.application_id || "-"}</span></p>
                  )}
                  <p>Tenure: <span className="font-semibold text-[#f08c2b]">{form.tenure_months || "-"} months</span></p>
                  <p>Principal: <span className="font-semibold text-[#f08c2b]">{form.principal_amount || "-"}</span></p>
                  <p>Product: <span className="font-semibold text-[#f08c2b]">{selectedProduct?.product_name || "-"}</span></p>
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
              <div className="space-y-2">
                <Label>Collateral Description</Label>
                <Textarea
                  rows={3}
                  placeholder="Optional unless product requires collateral"
                  className="border-black/15 focus-visible:ring-[#f08c2b]"
                  value={form.collateral_description}
                  onChange={(e) => setForm((prev) => ({ ...prev, collateral_description: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Guarantor 1</Label>
                  <Select value={form.guarantor1} onValueChange={(value) => setForm((prev) => ({ ...prev, guarantor1: value }))}>
                    <SelectTrigger className="h-11 border-black/15 focus:ring-[#f08c2b]"><SelectValue placeholder="Select guarantor" /></SelectTrigger>
                    <SelectContent>
                      {guarantorOptions
                        .filter((m) => String(m.id) !== form.member_id)
                        .map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.full_name} ({m.member_number})</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Guarantor 2</Label>
                  <Select value={form.guarantor2} onValueChange={(value) => setForm((prev) => ({ ...prev, guarantor2: value }))}>
                    <SelectTrigger className="h-11 border-black/15 focus:ring-[#f08c2b]"><SelectValue placeholder="Select guarantor" /></SelectTrigger>
                    <SelectContent>
                      {guarantorOptions
                        .filter((m) => String(m.id) !== form.member_id && String(m.id) !== form.guarantor1)
                        .map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.full_name} ({m.member_number})</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

        </motion.div>
        )}
        {step === 4 && (
        <motion.div
          key="step-4"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.24 }}
          className="space-y-4 rounded-xl border border-gray-200 bg-white p-3"
        >
              <div className="rounded-xl border border-[#f08c2b]/30 bg-orange-50 p-4">
                <p className="text-xs uppercase tracking-wide text-[#de4925] font-semibold">Final Review</p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-gray-700">
                  <p>Member: <span className="font-semibold">{selectedMember?.full_name || "-"}</span></p>
                  <p>Member No: <span className="font-semibold">{selectedMember?.member_number || "-"}</span></p>
                  <p>Product: <span className="font-semibold">{selectedProduct?.product_name || "-"}</span></p>
                  <p>Loan Type: <span className="font-semibold capitalize">{form.loan_type}</span></p>
                  {form.loan_type === "top up" && (
                    <p>Top Up Loan: <span className="font-semibold">{topUpLoans.find((l) => String(l.id) === form.top_up_loan_id)?.application_id || "-"}</span></p>
                  )}
                  <p>Principal: <span className="font-semibold">{form.principal_amount || "-"}</span></p>
                  <p>Tenure: <span className="font-semibold">{form.tenure_months || "-"} months</span></p>
                  <p className="col-span-2">Purpose: <span className="font-semibold">{form.purpose || "-"}</span></p>
                  <p className="col-span-2">Collateral: <span className="font-semibold">{form.collateral_description || "N/A"}</span></p>
                </div>
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
