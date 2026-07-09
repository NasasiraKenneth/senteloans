"use client"

import React, { useState, useMemo } from "react"
import { useForm, FormProvider, Controller } from "react-hook-form"
import { Stepper, Step, StepLabel, Button, Box, Alert, Popover } from "@mui/material"
import { FiCalendar, FiCreditCard, FiDollarSign, FiFileText, FiRepeat, FiUser } from "react-icons/fi"
import DatePicker from "react-multi-date-picker"
import StyledSelect from "@/components/newUI/styled_select"
import { isBankRoutedPaymentMode } from "@/lib/finances/payment-mode"

export interface TransactionFormData {
  member: string
  account: string
  transactionType: string
  transferAccount: string
  amount: number | ""
  transactionDate: string
  paymentMethod: string
  bankAccountId: string
  charges: number | ""
  referenceNumber: string
  notes: string
}

interface TransactionFormProps {
  initialValues?: Partial<TransactionFormData>
  onSubmit: (data: TransactionFormData) => void
  loading?: boolean
  error?: string | null
  successMessage?: string | null
}

const transactionTypeOptions = [
  { value: "deposit", label: "Deposit" },
  { value: "withdrawal", label: "Withdrawal" },
  { value: "transfer", label: "Transfer" },
]

const paymentMethodOptions = [
  { value: "Cash", label: "Cash" },
  { value: "Bank Transfer", label: "Bank Transfer" },
  { value: "Mobile Money", label: "Mobile Money" },
  { value: "Card", label: "Card" },
  { value: "Cheque", label: "Cheque" },
]

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    minimumFractionDigits: 0,
  }).format(amount)
}

const steps = ["Details", "Payment Details", "Review & Confirm"]

const DetailsStep = ({
  register,
  errors,
  control,
  watch,
  memberOptions,
  accountOptions,
  transferAccountOptions,
  accountMetaById,
  loadingMembers,
  loadingAccounts,
  loadingTransferAccounts,
}: any) => {
  const selectedAccountId = String(watch("account") || "")
  const transactionType = String(watch("transactionType") || "")
  const selectedAccount = accountMetaById[selectedAccountId] || null

  return (
  <div className="space-y-6">
    <div className="grid grid-cols-1 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Member <span className="text-red-500">*</span>
        </label>
        <Controller
          name="member"
          control={control}
          rules={{ required: "Member is required" }}
          render={({ field: { onChange, value } }) => (
            <StyledSelect
              value={value || ""}
              onChange={onChange}
              placeholder={loadingMembers ? "Loading members..." : "Select member"}
              options={memberOptions}
              searchable
            />
          )}
        />
        {errors.member && <p className="mt-1 text-xs text-red-500">{errors.member.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Account <span className="text-red-500">*</span>
        </label>
        <Controller
          name="account"
          control={control}
          rules={{ required: "Account is required" }}
          render={({ field: { onChange, value } }) => (
            <StyledSelect
              value={value || ""}
              onChange={onChange}
              placeholder={loadingAccounts ? "Loading accounts..." : "Select account"}
              options={accountOptions}
              searchable
            />
          )}
        />
        {errors.account && <p className="mt-1 text-xs text-red-500">{errors.account.message}</p>}
        {selectedAccount && (
          <p className="mt-1 text-xs text-gray-600">
            Available balance:{" "}
            <span className="font-medium text-gray-900">
              {formatCurrency(Number(selectedAccount.availableBalance || 0))}
            </span>
          </p>
        )}
      </div>
    </div>

    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Transaction Type <span className="text-red-500">*</span>
        </label>
        <Controller
          name="transactionType"
          control={control}
          rules={{ required: "Transaction type is required" }}
          render={({ field: { onChange, value } }) => {
            const [anchor, setAnchor] = React.useState<HTMLElement | null>(null)
            const open = Boolean(anchor)
            const label = transactionTypeOptions.find((o) => o.value === value)?.label || ""
            return (
              <>
                <div
                  onClick={(e) => setAnchor(e.currentTarget)}
                  className={`flex items-center justify-between w-full px-3 py-2.5 text-sm border rounded-md cursor-pointer transition-all duration-200 ${
                    open
                      ? "ring-[1.5px] ring-[#f08c2b] border-transparent"
                      : errors.transactionType
                        ? "border-red-500"
                        : "border-gray-300 hover:border-gray-400"
                  }`}
                >
                  <span className={value ? "text-gray-900" : "text-gray-400"}>{label || "Select transaction type"}</span>
                  <svg className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                <Popover
                  open={open}
                  anchorEl={anchor}
                  onClose={() => setAnchor(null)}
                  anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                  transformOrigin={{ vertical: "top", horizontal: "left" }}
                  PaperProps={{ sx: { width: anchor?.offsetWidth || 200, borderRadius: "10px", mt: 0.5 } }}
                >
                  <div className="p-2">
                    {transactionTypeOptions.map((opt) => (
                      <div
                        key={opt.value}
                        onClick={() => {
                          onChange(opt.value)
                          setAnchor(null)
                        }}
                        className="px-3 py-2.5 cursor-pointer hover:bg-gray-50 rounded-lg text-sm text-gray-800"
                      >
                        {opt.label}
                      </div>
                    ))}
                  </div>
                </Popover>
              </>
            )
          }}
        />
        {errors.transactionType && <p className="mt-1 text-xs text-red-500">{errors.transactionType.message}</p>}
      </div>

      <div>
        <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
          Amount <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">UGX</span>
          <input
            id="amount"
            type="number"
            min={0}
            step="0.01"
            placeholder="0.00"
            className={`w-full pl-10 pr-3 py-2.5 text-sm rounded-md border transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
              errors.amount ? "border-red-500" : "border-gray-300 hover:border-gray-400"
            }`}
            {...register("amount", {
              required: "Amount is required",
              valueAsNumber: true,
              validate: (v: number) => {
                if (!Number.isFinite(v) || v <= 0) return "Amount must be greater than 0"
                if (transactionType === "withdrawal" || transactionType === "transfer") {
                  const balance = Number(selectedAccount?.availableBalance ?? NaN)
                  if (Number.isFinite(balance) && v > balance) {
                    return `Amount exceeds available balance (${formatCurrency(balance)})`
                  }
                }
                return true
              },
            })}
          />
        </div>
        {errors.amount && <p className="mt-1 text-xs text-red-500">{errors.amount.message}</p>}
      </div>
    </div>

    {watch("transactionType") === "transfer" && (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Transfer To Account <span className="text-red-500">*</span>
        </label>
        <Controller
          name="transferAccount"
          control={control}
          rules={{
            validate: (value: string) =>
              watch("transactionType") !== "transfer" || !!value || "Transfer account is required",
          }}
          render={({ field: { onChange, value } }) => (
            <StyledSelect
              value={value || ""}
              onChange={onChange}
              placeholder={loadingTransferAccounts ? "Loading accounts..." : "Select destination account"}
              options={transferAccountOptions}
              searchable
            />
          )}
        />
        {errors.transferAccount && <p className="mt-1 text-xs text-red-500">{errors.transferAccount.message}</p>}
      </div>
    )}
  </div>
  )
}

const PaymentStep = ({
  register,
  errors,
  control,
  watch,
  bankAccountOptions,
  loadingBankAccounts,
}: any) => {
  const paymentMethod = String(watch("paymentMethod") || "")
  const transactionType = String(watch("transactionType") || "")
  const showReference = paymentMethod && paymentMethod !== "Cash"
  const showBankAccount = isBankRoutedPaymentMode(paymentMethod)
  const showCharges = transactionType === "withdrawal" && paymentMethod && paymentMethod !== "Cash"

  return (
  <div className="space-y-6">
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label htmlFor="transactionDate" className="block text-sm font-medium text-gray-700 mb-1">
          Transaction Date <span className="text-red-500">*</span>
        </label>
        <Controller
          name="transactionDate"
          control={control}
          rules={{ required: "Transaction date is required" }}
          render={({ field: { onChange, value } }) => {
            const [dateOpen, setDateOpen] = React.useState(false)
            const displayDate = value
              ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
              : ""
            return (
              <DatePicker
                className="orange"
                value={value ? new Date(value) : null}
                onOpenPickNewDate={false}
                onOpen={() => setDateOpen(true)}
                onClose={() => setDateOpen(false)}
                onChange={(dateObj) => {
                  if (dateObj) {
                    const d = (dateObj as any)?.toDate?.()
                    onChange(d ? d.toISOString().slice(0, 10) : "")
                  } else {
                    onChange("")
                  }
                }}
                format="DD/MM/YYYY"
                containerStyle={{ width: "100%" }}
                render={(_pickerValue, openCalendar) => (
                  <div
                    onClick={openCalendar}
                    className={`flex items-center gap-2 w-full px-3 py-2.5 text-sm border rounded-md cursor-pointer transition-all duration-200 ${
                      dateOpen
                        ? "ring-[1.5px] ring-[#f08c2b] border-transparent"
                        : errors.transactionDate
                          ? "border-red-500"
                          : "border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    <FiCalendar className="text-gray-400" />
                    <span className={displayDate ? "text-gray-900" : "text-gray-400"}>
                      {displayDate || "Select date"}
                    </span>
                  </div>
                )}
              />
            )
          }}
        />
        {errors.transactionDate && <p className="mt-1 text-xs text-red-500">{errors.transactionDate.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Payment Method <span className="text-red-500">*</span>
        </label>
        <Controller
          name="paymentMethod"
          control={control}
          rules={{ required: "Payment method is required" }}
          render={({ field: { onChange, value } }) => {
            const [anchor, setAnchor] = React.useState<HTMLElement | null>(null)
            const open = Boolean(anchor)
            const label = paymentMethodOptions.find((o) => o.value === value)?.label || ""
            return (
              <>
                <div
                  onClick={(e) => setAnchor(e.currentTarget)}
                  className={`flex items-center justify-between w-full px-3 py-2.5 text-sm border rounded-md cursor-pointer transition-all duration-200 ${
                    open
                      ? "ring-[1.5px] ring-[#f08c2b] border-transparent"
                      : errors.paymentMethod
                        ? "border-red-500"
                        : "border-gray-300 hover:border-gray-400"
                  }`}
                >
                  <span className={value ? "text-gray-900" : "text-gray-400"}>{label || "Select payment method"}</span>
                  <FiCreditCard className="text-gray-400" />
                </div>
                <Popover
                  open={open}
                  anchorEl={anchor}
                  onClose={() => setAnchor(null)}
                  anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                  transformOrigin={{ vertical: "top", horizontal: "left" }}
                  PaperProps={{ sx: { width: anchor?.offsetWidth || 200, borderRadius: "10px", mt: 0.5 } }}
                >
                  <div className="p-2">
                    {paymentMethodOptions.map((opt) => (
                      <div
                        key={opt.value}
                        onClick={() => {
                          onChange(opt.value)
                          setAnchor(null)
                        }}
                        className="px-3 py-2.5 cursor-pointer hover:bg-gray-50 rounded-lg text-sm text-gray-800"
                      >
                        {opt.label}
                      </div>
                    ))}
                  </div>
                </Popover>
              </>
            )
          }}
        />
        {errors.paymentMethod && <p className="mt-1 text-xs text-red-500">{errors.paymentMethod.message}</p>}
      </div>
    </div>

    {showBankAccount && (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Bank Account <span className="text-red-500">*</span>
        </label>
        <Controller
          name="bankAccountId"
          control={control}
          rules={{
            validate: (value: string) =>
              !isBankRoutedPaymentMode(paymentMethod) || !!value || "Bank account is required",
          }}
          render={({ field: { onChange, value } }) => (
            <StyledSelect
              value={value || ""}
              onChange={onChange}
              placeholder={loadingBankAccounts ? "Loading bank accounts..." : bankAccountOptions.length ? "Select bank account" : "No branch bank accounts"}
              options={bankAccountOptions}
              searchable
            />
          )}
        />
        {errors.bankAccountId && <p className="mt-1 text-xs text-red-500">{errors.bankAccountId.message}</p>}
      </div>
    )}

    {(showCharges || showReference) && (
      <div
        className={`grid gap-4 ${showCharges && showReference ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}
      >
        {showCharges && (
          <div>
            <label htmlFor="charges" className="block text-sm font-medium text-gray-700 mb-1">
              Transaction Charges
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">UGX</span>
              <input
                id="charges"
                type="number"
                min={0}
                step="0.01"
                placeholder="0"
                className={`w-full pl-10 pr-3 py-2.5 text-sm rounded-md border transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
                  errors.charges ? "border-red-500" : "border-gray-300 hover:border-gray-400"
                }`}
                {...register("charges", {
                  valueAsNumber: true,
                  validate: (v: number) => {
                    if (v === undefined || v === null || Number.isNaN(v)) return true
                    if (v < 0) return "Charges cannot be negative"
                    return true
                  },
                })}
              />
            </div>
            {errors.charges && <p className="mt-1 text-xs text-red-500">{errors.charges.message}</p>}
            <p className="mt-1 text-xs text-gray-500">Optional fees for this {paymentMethod.toLowerCase()} withdrawal.</p>
          </div>
        )}

        {showReference && (
          <div>
            <label htmlFor="referenceNumber" className="block text-sm font-medium text-gray-700 mb-1">
              Reference number
            </label>
            <input
              id="referenceNumber"
              type="text"
              placeholder="e.g. mobile money, bank transfer reference"
              className="w-full px-3 py-2.5 text-sm rounded-md border border-gray-300 hover:border-gray-400 transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none"
              {...register("referenceNumber")}
            />
            <p className="mt-1 text-xs text-gray-500">Optional reference for this {paymentMethod.toLowerCase()} payment.</p>
          </div>
        )}
      </div>
    )}

    <div>
      <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
        Notes
      </label>
      <textarea
        id="notes"
        rows={4}
        placeholder="Optional transaction notes"
        className="w-full px-3 py-2.5 text-sm rounded-md border border-gray-300 hover:border-gray-400 transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none"
        {...register("notes")}
      />
    </div>
  </div>
  )
}

const ReviewStep = ({
  watch,
  memberMetaById,
  accountMetaById,
  transferAccountMetaById,
  bankAccountMetaById,
}: any) => {
  const memberId = String(watch("member") || "")
  const accountId = String(watch("account") || "")
  const transferAccountId = String(watch("transferAccount") || "")
  const bankAccountId = String(watch("bankAccountId") || "")
  const transactionType = String(watch("transactionType") || "")
  const paymentMethod = String(watch("paymentMethod") || "")
  const amount = watch("amount")
  const charges = watch("charges")
  const transactionDate = String(watch("transactionDate") || "")
  const referenceNumber = String(watch("referenceNumber") || "").trim()
  const notes = String(watch("notes") || "")

  const member = memberMetaById[memberId] || null
  const account = accountMetaById[accountId] || null
  const transferAccount = transferAccountMetaById[transferAccountId] || null
  const bankAccount = bankAccountMetaById[bankAccountId] || null

  const typeLabel = transactionTypeOptions.find((o) => o.value === transactionType)?.label || "—"
  const methodLabel = paymentMethodOptions.find((o) => o.value === paymentMethod)?.label || "—"
  const amountLabel = amount ? Number(amount).toLocaleString("en-UG") : "—"
  const dateLabel = transactionDate
    ? new Date(transactionDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "—"

  return (
    <div className="space-y-4 h-[48vh] overflow-y-auto">
      <div className="rounded-xl border border-[#111111]/10 bg-white p-4">
        <h3 className="text-sm font-semibold text-[#111111] mb-4">Review & Confirm</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center gap-2 text-gray-700 mb-1">
              <FiUser className="h-4 w-4" />
              <span className="font-medium">Member</span>
            </div>
            <p className="text-gray-900">{member?.name || "—"}</p>
            <p className="text-xs text-gray-500">Member No: {member?.memberNumber || "—"}</p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center gap-2 text-gray-700 mb-1">
              <FiCreditCard className="h-4 w-4" />
              <span className="font-medium">Account</span>
            </div>
            <p className="text-gray-900">{account?.accountNumber || "—"}</p>
            <p className="text-xs text-gray-500">
              Type: {account?.accountType || "—"}
              {account?.availableBalance != null
                ? ` • Balance: ${formatCurrency(Number(account.availableBalance))}`
                : ""}
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center gap-2 text-gray-700 mb-1">
              <FiRepeat className="h-4 w-4" />
              <span className="font-medium">Transaction Type</span>
            </div>
            <p className="text-gray-900">{typeLabel}</p>
          </div>

          {transactionType === "transfer" ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center gap-2 text-gray-700 mb-1">
                <FiCreditCard className="h-4 w-4" />
                <span className="font-medium">Transfer To</span>
              </div>
              <p className="text-gray-900">{transferAccount?.memberName || "—"}</p>
              <p className="text-xs text-gray-500">
                {transferAccount?.accountNumber || "—"} • {transferAccount?.accountType || "—"}
              </p>
            </div>
          ) : null}

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center gap-2 text-gray-700 mb-1">
              <FiDollarSign className="h-4 w-4" />
              <span className="font-medium">Amount</span>
            </div>
            <p className="text-gray-900">UGX {amountLabel}</p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center gap-2 text-gray-700 mb-1">
              <FiCalendar className="h-4 w-4" />
              <span className="font-medium">Transaction Date</span>
            </div>
            <p className="text-gray-900">{dateLabel}</p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center gap-2 text-gray-700 mb-1">
              <FiCreditCard className="h-4 w-4" />
              <span className="font-medium">Transaction Method</span>
            </div>
            <p className="text-gray-900">{methodLabel}</p>
          </div>

          {bankAccount ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 md:col-span-2">
              <div className="flex items-center gap-2 text-gray-700 mb-1">
                <FiCreditCard className="h-4 w-4" />
                <span className="font-medium">Bank Account</span>
              </div>
              <p className="text-gray-900">{bankAccount.label}</p>
            </div>
          ) : null}

          {transactionType === "withdrawal" && paymentMethod !== "Cash" && charges !== "" && Number(charges) > 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center gap-2 text-gray-700 mb-1">
                <FiDollarSign className="h-4 w-4" />
                <span className="font-medium">Charges</span>
              </div>
              <p className="text-gray-900">UGX {Number(charges).toLocaleString("en-UG")}</p>
            </div>
          ) : null}

          {referenceNumber ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 md:col-span-2">
              <div className="flex items-center gap-2 text-gray-700 mb-1">
                <FiFileText className="h-4 w-4" />
                <span className="font-medium">Reference</span>
              </div>
              <p className="text-gray-900">{referenceNumber}</p>
            </div>
          ) : null}

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 md:col-span-2">
            <div className="flex items-center gap-2 text-gray-700 mb-1">
              <FiFileText className="h-4 w-4" />
              <span className="font-medium">Notes</span>
            </div>
            <p className="text-gray-900 whitespace-pre-wrap">{notes || "—"}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TransactionForm({
  initialValues = {},
  onSubmit,
  loading = false,
  error = null,
  successMessage = null,
}: TransactionFormProps) {
  const [activeStep, setActiveStep] = useState(0)
  const [showValidation, setShowValidation] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [memberOptions, setMemberOptions] = useState<Array<{ value: string; label: string }>>([])
  const [accountOptions, setAccountOptions] = useState<Array<{ value: string; label: string }>>([])
  const [allTransferAccounts, setAllTransferAccounts] = useState<
    Array<{ id: string; account_number: string; account_type: string; client_name: string; status: string }>
  >([])
  const [bankAccountOptions, setBankAccountOptions] = useState<Array<{ value: string; label: string }>>([])
  const [bankAccountMetaById, setBankAccountMetaById] = useState<Record<string, { label: string }>>({})
  const [memberMetaById, setMemberMetaById] = useState<Record<string, { name: string; memberNumber: string }>>({})
  const [accountMetaById, setAccountMetaById] = useState<
    Record<string, { accountNumber: string; accountType: string; availableBalance: number }>
  >({})
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [loadingTransferAccounts, setLoadingTransferAccounts] = useState(false)
  const [loadingBankAccounts, setLoadingBankAccounts] = useState(false)

  const methods = useForm<TransactionFormData>({
    defaultValues: {
      member: "",
      account: "",
      transactionType: "",
      transferAccount: "",
      amount: "",
      transactionDate: "",
      paymentMethod: "",
      bankAccountId: "",
      charges: "",
      referenceNumber: "",
      notes: "",
      ...initialValues,
    },
    mode: "onTouched",
  })

  const {
    register,
    handleSubmit,
    formState: { errors },
    trigger,
    watch,
    control,
    clearErrors,
  } = methods

  React.useEffect(() => {
    let cancelled = false
    async function loadMembers() {
      setLoadingMembers(true)
      try {
        const res = await fetch("/api/institution/members?limit=200", { cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || "Failed to load members")
        if (!cancelled) {
          const members = Array.isArray(body?.members) ? body.members : []
          setMemberOptions(
            members.map((m: Record<string, unknown>) => ({
              value: String(m.id || ""),
              label: `${String(m.full_name || "Member")}${m.member_number ? ` (${String(m.member_number)})` : ""}`,
            })),
          )
          setMemberMetaById(
            Object.fromEntries(
              members.map((m: Record<string, unknown>) => [
                String(m.id || ""),
                {
                  name: String(m.full_name || "Member"),
                  memberNumber: String(m.member_number || ""),
                },
              ]),
            ),
          )
        }
      } catch {
        if (!cancelled) setMemberOptions([])
      } finally {
        if (!cancelled) setLoadingMembers(false)
      }
    }
    void loadMembers()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedMemberId = watch("member")
  const selectedAccountId = watch("account")

  const transferAccountOptions = useMemo(
    () =>
      allTransferAccounts
        .filter((a) => a.status === "Active" && a.id !== String(selectedAccountId || ""))
        .map((a) => ({
          value: a.id,
          label: `${a.account_number} - ${a.client_name}`,
        })),
    [allTransferAccounts, selectedAccountId],
  )

  const transferAccountMetaById = useMemo(
    () =>
      Object.fromEntries(
        allTransferAccounts.map((a) => [
          a.id,
          {
            accountNumber: a.account_number,
            accountType: a.account_type,
            memberName: a.client_name,
          },
        ]),
      ),
    [allTransferAccounts],
  )

  React.useEffect(() => {
    const transfer = methods.getValues("transferAccount")
    if (transfer && transfer === String(selectedAccountId || "")) {
      methods.setValue("transferAccount", "")
    }
  }, [selectedAccountId, methods])

  React.useEffect(() => {
    let cancelled = false
    async function loadBankAccounts(memberId: string) {
      if (!memberId) {
        setBankAccountOptions([])
        setBankAccountMetaById({})
        methods.setValue("bankAccountId", "")
        return
      }
      setLoadingBankAccounts(true)
      try {
        const res = await fetch(`/api/institution/members/${memberId}/bank-accounts`, { cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || "Failed to load bank accounts")
        if (!cancelled) {
          const accounts = Array.isArray(body?.bankAccounts) ? body.bankAccounts : []
          setBankAccountOptions(
            accounts.map((ba: Record<string, unknown>) => {
              const id = String(ba.id || "")
              const label = `${String(ba.bank_name || "Bank")} — ${String(ba.bank_account_number || "")}`
              return { value: id, label }
            }),
          )
          setBankAccountMetaById(
            Object.fromEntries(
              accounts.map((ba: Record<string, unknown>) => {
                const id = String(ba.id || "")
                const label = `${String(ba.bank_name || "Bank")} — ${String(ba.bank_account_number || "")}`
                return [id, { label }]
              }),
            ),
          )
          const selectedBank = methods.getValues("bankAccountId")
          if (selectedBank && !accounts.some((ba: Record<string, unknown>) => String(ba.id) === selectedBank)) {
            methods.setValue("bankAccountId", "")
          }
        }
      } catch {
        if (!cancelled) {
          setBankAccountOptions([])
          setBankAccountMetaById({})
          methods.setValue("bankAccountId", "")
        }
      } finally {
        if (!cancelled) setLoadingBankAccounts(false)
      }
    }
    void loadBankAccounts(String(selectedMemberId || ""))
    return () => {
      cancelled = true
    }
  }, [selectedMemberId, methods])

  const paymentMethod = watch("paymentMethod")
  const transactionTypeWatch = watch("transactionType")

  React.useEffect(() => {
    if (!isBankRoutedPaymentMode(String(paymentMethod || ""))) {
      methods.setValue("bankAccountId", "")
    }
    if (String(transactionTypeWatch || "") !== "withdrawal" || String(paymentMethod || "") === "Cash") {
      methods.setValue("charges", "")
    }
  }, [paymentMethod, transactionTypeWatch, methods])

  React.useEffect(() => {
    let cancelled = false
    async function loadAccounts(memberId: string) {
      if (!memberId) {
        setAccountOptions([])
        methods.setValue("account", "")
        methods.setValue("transferAccount", "")
        return
      }
      setLoadingAccounts(true)
      try {
        const params = new URLSearchParams({ member_id: memberId, limit: "200" })
        const res = await fetch(`/api/institution/savings?${params.toString()}`, { cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || "Failed to load accounts")
        if (!cancelled) {
          const items = (Array.isArray(body?.items) ? body.items : []).filter(
            (a: Record<string, unknown>) => String(a.status || "Active") === "Active",
          )
          const options = items.map((a: Record<string, unknown>) => ({
            value: String(a.id || ""),
            label: `${String(a.account_number || "Account")} - ${String(a.account_type || "Savings")}`,
          }))
          setAccountOptions(options)
          setAccountMetaById(
            Object.fromEntries(
              items.map((a: Record<string, unknown>) => [
                String(a.id || ""),
                {
                  accountNumber: String(a.account_number || "Account"),
                  accountType: String(a.account_type || "Savings"),
                  availableBalance: Number(a.available_balance || 0),
                },
              ]),
            ),
          )
          const selectedAccount = methods.getValues("account")
          if (selectedAccount && !options.some((o: { value: string; label: string }) => o.value === selectedAccount)) {
            methods.setValue("account", "")
          }
        }
      } catch {
        if (!cancelled) {
          setAccountOptions([])
          methods.setValue("account", "")
          methods.setValue("transferAccount", "")
        }
      } finally {
        if (!cancelled) setLoadingAccounts(false)
      }
    }
    void loadAccounts(String(selectedMemberId || ""))
    return () => {
      cancelled = true
    }
  }, [selectedMemberId, methods])

  React.useEffect(() => {
    let cancelled = false
    async function loadTransferAccounts() {
      setLoadingTransferAccounts(true)
      try {
        const params = new URLSearchParams({ limit: "200" })
        const res = await fetch(`/api/institution/savings?${params.toString()}`, { cache: "no-store" })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || "Failed to load transfer accounts")
        if (!cancelled) {
          const items = (Array.isArray(body?.items) ? body.items : [])
            .filter((a: Record<string, unknown>) => String(a.status || "Active") === "Active")
            .map((a: Record<string, unknown>) => ({
              id: String(a.id || ""),
              account_number: String(a.account_number || "Account"),
              account_type: String(a.account_type || "Savings"),
              client_name: String(a.client_name || "Unknown member"),
              status: String(a.status || "Active"),
            }))
          setAllTransferAccounts(items)
        }
      } catch {
        if (!cancelled) {
          setAllTransferAccounts([])
        }
      } finally {
        if (!cancelled) setLoadingTransferAccounts(false)
      }
    }
    void loadTransferAccounts()
    return () => {
      cancelled = true
    }
  }, [])

  const getStepFields = (step: number): (keyof TransactionFormData)[] => {
    switch (step) {
      case 0:
        return watch("transactionType") === "transfer"
          ? ["member", "account", "transactionType", "transferAccount", "amount"]
          : ["member", "account", "transactionType", "amount"]
      case 1: {
        const fields: (keyof TransactionFormData)[] = ["transactionDate", "paymentMethod"]
        if (isBankRoutedPaymentMode(String(watch("paymentMethod") || ""))) {
          fields.push("bankAccountId")
        }
        if (String(watch("transactionType") || "") === "withdrawal" && String(watch("paymentMethod") || "") !== "Cash") {
          fields.push("charges")
        }
        return fields
      }
      case 2:
        return []
      default:
        return []
    }
  }

  const validateStep = async (step: number): Promise<boolean> => {
    const fields = getStepFields(step)
    if (fields.length === 0) return true
    const isValid = await trigger(fields)
    setShowValidation(!isValid)
    return isValid
  }

  const hasStepErrors = (step: number): boolean => {
    if (!showValidation) return false
    const fields = getStepFields(step)
    return fields.some((field) => errors[field])
  }

  const handleNext = async () => {
    if (await validateStep(activeStep)) {
      const nextStep = activeStep + 1
      clearErrors(getStepFields(nextStep))
      setActiveStep(nextStep)
    }
  }

  const handleBack = () => setActiveStep((prev) => prev - 1)

  const handleFormSubmit = async (data: TransactionFormData) => {
    if (activeStep !== steps.length - 1) return
    for (let step = 0; step < steps.length; step++) {
      if (!(await validateStep(step))) {
        setActiveStep(step)
        return
      }
    }
    onSubmit(data)
    setIsSubmitted(true)
  }

  return (
    <div className="bg-white p-8 rounded-xl shadow-md max-w-2xl mx-auto">
      {isSubmitted && successMessage && <Alert severity="success" sx={{ mb: 6 }}>{successMessage}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 6 }}>{error}</Alert>}

      <FormProvider {...methods}>
        <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
          <Stepper
            activeStep={activeStep}
            alternativeLabel
            className="mb-8"
            sx={{
              "& .MuiStepIcon-root.Mui-active": { color: "#f08c2b" },
              "& .MuiStepIcon-root.Mui-completed": { color: "#f08c2b" },
            }}
          >
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          <Box sx={{ mt: 2, mb: 1 }}>
            {activeStep === 0 && (
              <DetailsStep
                register={register}
                errors={errors}
                control={control}
                watch={watch}
                memberOptions={memberOptions}
                accountOptions={accountOptions}
                transferAccountOptions={transferAccountOptions}
                accountMetaById={accountMetaById}
                loadingMembers={loadingMembers}
                loadingAccounts={loadingAccounts}
                loadingTransferAccounts={loadingTransferAccounts}
              />
            )}
            {activeStep === 1 && (
              <PaymentStep
                register={register}
                errors={errors}
                control={control}
                watch={watch}
                bankAccountOptions={bankAccountOptions}
                loadingBankAccounts={loadingBankAccounts}
              />
            )}
            {activeStep === 2 && (
              <ReviewStep
                watch={watch}
                memberMetaById={memberMetaById}
                accountMetaById={accountMetaById}
                transferAccountMetaById={transferAccountMetaById}
                bankAccountMetaById={bankAccountMetaById}
              />
            )}
          </Box>

          <Box sx={{ display: "flex", justifyContent: "space-between", mt: 6 }}>
            <Button
              disabled={activeStep === 0 || loading}
              onClick={handleBack}
              variant="outlined"
              sx={{ borderColor: "#777", color: "#000", textTransform: "none", px: 4, py: 1 }}
            >
              Back
            </Button>

            {activeStep === steps.length - 1 ? (
              <Button
                variant="contained"
                type="button"
                onClick={handleSubmit(handleFormSubmit)}
                disabled={loading}
                sx={{ backgroundColor: "#f08c2b", textTransform: "none", px: 4, py: 1 }}
              >
                {loading ? "Saving..." : "Create Transaction"}
              </Button>
            ) : (
              <Button
                variant="contained"
                type="button"
                onClick={handleNext}
                disabled={loading || hasStepErrors(activeStep)}
                sx={{ backgroundColor: "#000", color: "#fff", textTransform: "none", px: 4, py: 1 }}
              >
                Next
              </Button>
            )}
          </Box>
        </form>
      </FormProvider>
    </div>
  )
}
