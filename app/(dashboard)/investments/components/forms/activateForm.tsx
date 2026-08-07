"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import ReeveDatePicker from "@/components/newUI/date_picker"
import { isBankRoutedPaymentMode, PAYMENT_MODE_OPTIONS } from "@/lib/finances/payment-mode"

type BankAccount = { id: string; bank_name: string; bank_account_number: string }

export interface ActivateFormData {
  principalAmount: number
  transactionMode: string
  bankAccountId?: string
  referenceNumber?: string
  transactionCharges?: number
  periodValue?: number
  periodUnit?: "months" | "years"
  startDate: string
  endDate?: string
  description: string
}

interface ActivateFormProps {
  initialValues: ActivateFormData
  onClose: () => void
  onSubmit: (data: ActivateFormData) => Promise<void> | void
  loading?: boolean
}

export default function ActivateForm({ initialValues, onClose, onSubmit, loading = false }: ActivateFormProps) {
  const [form, setForm] = useState<ActivateFormData>(initialValues)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [bankAccountId, setBankAccountId] = useState("")
  const [referenceNumber, setReferenceNumber] = useState("")
  const [transactionChargesInput, setTransactionChargesInput] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setForm(initialValues)
    setBankAccountId("")
    setReferenceNumber("")
    setTransactionChargesInput("")
    setErrors({})
  }, [initialValues])

  useEffect(() => {
    let cancelled = false
    async function loadBankAccounts() {
      try {
        const res = await fetch("/api/institution/finances/bank-accounts?rowsPerPage=100", { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as {
          rows?: BankAccount[]
          items?: BankAccount[]
          bankAccounts?: BankAccount[]
        }
        const rows = Array.isArray(data.rows)
          ? data.rows
          : Array.isArray(data.items)
            ? data.items
            : Array.isArray(data.bankAccounts)
              ? data.bankAccounts
              : []
        if (!cancelled) setBankAccounts(rows)
      } catch {
        // Best-effort; select shows empty if load fails.
      }
    }
    void loadBankAccounts()
    return () => {
      cancelled = true
    }
  }, [])

  const isCashMode = form.transactionMode === "Cash"
  const isBankRoutedMode = isBankRoutedPaymentMode(form.transactionMode)
  const chargesNumber = transactionChargesInput.trim() === "" ? 0 : Number(transactionChargesInput)
  const invalidCharges =
    !isCashMode &&
    transactionChargesInput.trim() !== "" &&
    (!Number.isFinite(chargesNumber) || chargesNumber < 0)

  const validate = () => {
    const nextErrors: Record<string, string> = {}
    if (!form.transactionMode) nextErrors.transactionMode = "Transaction mode is required"
    if (!form.startDate) nextErrors.startDate = "Start date is required"
    if (!isCashMode && form.transactionMode && !referenceNumber.trim()) {
      nextErrors.referenceNumber = `Reference number is required for ${form.transactionMode} payments`
    }
    if (isBankRoutedMode && !bankAccountId) {
      nextErrors.bankAccountId = "Please select a bank account"
    }
    if (invalidCharges) nextErrors.transactionCharges = "Transaction charges must be zero or greater"
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    await onSubmit({
      ...form,
      bankAccountId: isBankRoutedMode ? bankAccountId : undefined,
      referenceNumber: !isCashMode ? referenceNumber.trim() : undefined,
      transactionCharges:
        !isCashMode &&
        transactionChargesInput.trim() !== "" &&
        Number.isFinite(chargesNumber) &&
        chargesNumber > 0
          ? chargesNumber
          : undefined,
    })
  }

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-1.5">
        <Label>Principal amount</Label>
        <input
          disabled
          value={Math.round(Number(form.principalAmount || 0)).toLocaleString()}
          className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-md bg-gray-100 text-gray-600"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Transaction mode</Label>
        <StyledSelect
          value={form.transactionMode}
          onChange={(value) => {
            setForm((prev) => ({ ...prev, transactionMode: value }))
            if (value === "Cash") {
              setBankAccountId("")
              setReferenceNumber("")
              setTransactionChargesInput("")
            } else if (!isBankRoutedPaymentMode(value)) {
              setBankAccountId("")
            }
            setErrors((prev) => ({
              ...prev,
              transactionMode: "",
              bankAccountId: "",
              referenceNumber: "",
              transactionCharges: "",
            }))
          }}
          options={PAYMENT_MODE_OPTIONS}
          placeholder="Select mode"
        />
        {errors.transactionMode ? <p className="text-xs text-red-600">{errors.transactionMode}</p> : null}
      </div>

      {isBankRoutedMode ? (
        <div className="space-y-1.5">
          <Label>
            Bank account <span className="text-red-500">*</span>
          </Label>
          <StyledSelect
            value={bankAccountId}
            onChange={(value) => {
              setBankAccountId(value)
              setErrors((prev) => ({ ...prev, bankAccountId: "" }))
            }}
            placeholder={bankAccounts.length ? "Select bank account" : "No branch bank accounts"}
            options={bankAccounts.map((account) => ({
              value: account.id,
              label: `${account.bank_name} — ${account.bank_account_number}`,
            }))}
          />
          {errors.bankAccountId ? (
            <p className="text-xs text-red-600">{errors.bankAccountId}</p>
          ) : null}
        </div>
      ) : null}

      {!isCashMode && form.transactionMode ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>
              Transaction charges
            </Label>
            <input
              type="number"
              min={0}
              step="any"
              value={transactionChargesInput}
              onChange={(e) => {
                setTransactionChargesInput(e.target.value)
                setErrors((prev) => ({ ...prev, transactionCharges: "" }))
              }}
              placeholder="0"
              className={`w-full px-3 py-2.5 text-sm border rounded-md ${
                invalidCharges ? "border-red-500" : "border-gray-300"
              }`}
            />
            {errors.transactionCharges ? (
              <p className="text-xs text-red-600">{errors.transactionCharges}</p>
            ) : (
              <p className="text-xs text-gray-500">Optional fees for {form.transactionMode} payments.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>
              Reference number <span className="text-red-500">*</span>
            </Label>
            <input
              value={referenceNumber}
              onChange={(e) => {
                setReferenceNumber(e.target.value)
                setErrors((prev) => ({ ...prev, referenceNumber: "" }))
              }}
              placeholder="e.g. transaction id"
              className={`w-full px-3 py-2.5 text-sm border rounded-md ${
                errors.referenceNumber ? "border-red-500" : "border-gray-300"
              }`}
            />
            {errors.referenceNumber ? (
              <p className="text-xs text-red-600">{errors.referenceNumber}</p>
            ) : (
              <p className="text-xs text-gray-500">Required for {form.transactionMode} payments.</p>
            )}
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label>Transaction date</Label>
        <ReeveDatePicker
          value={form.startDate}
          onChange={(value) => {
            setForm((prev) => ({ ...prev, startDate: value }))
            setErrors((prev) => ({ ...prev, startDate: "" }))
          }}
        />
        {errors.startDate ? <p className="text-xs text-red-600">{errors.startDate}</p> : null}
      </div>

      <div className="space-y-1.5">
        <Label>Description</Label>
        <textarea
          value={form.description}
          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          rows={3}
          className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-md"
          placeholder="Transaction description"
        />
      </div>

      <div className="flex justify-end gap-2 border-t pt-3">
        <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={loading}>
          {loading ? "Saving..." : "Start Development"}
        </Button>
      </div>
    </div>
  )
}

