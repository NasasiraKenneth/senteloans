"use client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import { FaCheck, FaEdit, FaTrash } from "react-icons/fa"
import { MdFormatListBulletedAdd } from "react-icons/md"

export type FundingType = "savings" | "shares" | "reserves" | "loan" | "grant"

export interface FundingFormLoanOption {
  id: string
  label: string
}

export interface FundingFormRow {
  id: string
  type: FundingType
  amount: number
  loanId?: string
}

interface FundingFormProps {
  rows: FundingFormRow[]
  loans: FundingFormLoanOption[]
  loadingLoans?: boolean
  onAddRow: () => void
  onChangeRow: (id: string, patch: Partial<FundingFormRow>) => void
  onSaveRow?: (id: string) => void
  onEditRow?: (id: string) => void
  onDeleteRow: (id: string) => void
  isRowEditing?: (row: FundingFormRow) => boolean
}

const FUNDING_TYPE_OPTIONS = [
  { value: "savings", label: "Savings" },
  { value: "shares", label: "Shares" },
  { value: "reserves", label: "Reserves" },
  { value: "loan", label: "Loan" },
  { value: "grant", label: "Grant" },
]

const inputClass =
  "w-full px-3 py-2.5 text-sm border border-gray-300 rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none hover:border-gray-400"

export default function FundingForm({
  rows,
  loans,
  loadingLoans = false,
  onAddRow,
  onChangeRow,
  onSaveRow,
  onEditRow,
  onDeleteRow,
  isRowEditing,
}: FundingFormProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Investment Funding</Label>
        <Button type="button" variant="outline" onClick={onAddRow} title="Add funding source" aria-label="Add funding source">
          <MdFormatListBulletedAdd className="h-4 w-4" />
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
          No funding source added yet.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const editing = isRowEditing ? isRowEditing(row) : true
            return (
              <div key={row.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 rounded-md border p-3">
                <div className="md:col-span-4 space-y-1.5">
                  <Label>Type</Label>
                  <div className={!editing ? "pointer-events-none opacity-70" : ""}>
                    <StyledSelect
                      value={row.type}
                      onChange={(value) => onChangeRow(row.id, { type: value as FundingType })}
                      options={FUNDING_TYPE_OPTIONS}
                      placeholder="Select funding type"
                    />
                  </div>
                </div>

                <div className={row.type === "loan" ? "md:col-span-3 space-y-1.5" : "md:col-span-6 space-y-1.5"}>
                  <Label>Amount</Label>
                  <input
                    type="number"
                    min={0}
                    value={row.amount || ""}
                    onChange={(e) => onChangeRow(row.id, { amount: Number(e.target.value || 0) })}
                    placeholder="Enter amount"
                    className={inputClass}
                    disabled={!editing}
                  />
                </div>

                {row.type === "loan" && (
                  <div className="md:col-span-4 space-y-1.5">
                    <Label>Select Loan</Label>
                    <div className={!editing ? "pointer-events-none opacity-70" : ""}>
                      <StyledSelect
                        value={row.loanId || ""}
                        onChange={(value) => onChangeRow(row.id, { loanId: value })}
                        options={loans.map((loan) => ({ value: loan.id, label: loan.label }))}
                        placeholder={loadingLoans ? "Loading loans..." : "Select loan"}
                        searchable
                      />
                    </div>
                  </div>
                )}

                <div className="md:col-span-1 flex gap-1 items-end">
                  {!editing && onEditRow ? (
                    <button
                      type="button"
                      onClick={() => onEditRow(row.id)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
                      aria-label="Edit funding row"
                      title="Edit"
                    >
                      <FaEdit className="h-3.5 w-3.5" />
                    </button>
                  ) : onSaveRow ? (
                    <button
                      type="button"
                      onClick={() => onSaveRow(row.id)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition-colors"
                      aria-label="Save funding row"
                      title="Save"
                    >
                      <FaCheck className="h-3.5 w-3.5" />
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => onDeleteRow(row.id)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                    aria-label="Remove funding row"
                    title="Remove"
                  >
                    <FaTrash className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
