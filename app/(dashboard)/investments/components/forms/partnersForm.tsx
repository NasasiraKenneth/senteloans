"use client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import StyledSelect from "@/components/newUI/styled_select"
import { FaCheck, FaTrash } from "react-icons/fa"
import { MdFormatListBulletedAdd } from "react-icons/md"

export type PartnerRole = "lead_partner" | "co_investor" | ""
export type PartnerStatus = "Active" | "Inactive"

export interface PartnerProviderOption {
  id: string
  name: string
}

export interface PartnerFormRow {
  id: string
  counterpartyId: string
  counterpartyName?: string
  role: PartnerRole
  contributionPercentage: number
  contributionAmount: number
  ownershipPercentage: number
  status: PartnerStatus
}

interface PartnersFormProps {
  rows: PartnerFormRow[]
  providers: PartnerProviderOption[]
  loadingProviders?: boolean
  onAddRow: () => void
  onChangeRow: (id: string, patch: Partial<PartnerFormRow>) => void
  onSaveRow?: (id: string) => void
  onDeleteRow: (id: string) => void
}

const PARTNER_ROLE_OPTIONS = [
  { value: "lead_partner", label: "Lead Partner" },
  { value: "co_investor", label: "Co Investor" },
]

const inputClass =
  "w-full px-3 py-2.5 text-sm border border-gray-300 rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none hover:border-gray-400"

export default function PartnersForm({
  rows,
  providers,
  loadingProviders = false,
  onAddRow,
  onChangeRow,
  onSaveRow,
  onDeleteRow,
}: PartnersFormProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Partners</Label>
        <Button type="button" variant="outline" onClick={onAddRow} title="Add partner" aria-label="Add partner">
          <MdFormatListBulletedAdd className="h-4 w-4" />
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
          No partners added yet.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 rounded-md border p-3">
              <div className="md:col-span-3 space-y-1.5">
                <Label>Counterparty</Label>
                <StyledSelect
                  value={row.counterpartyId}
                  onChange={(value) => onChangeRow(row.id, { counterpartyId: value })}
                  options={providers.map((p) => ({ value: p.id, label: p.name }))}
                  placeholder={loadingProviders ? "Loading counterparties..." : "Select counterparty"}
                  searchable
                />
              </div>

              <div className="md:col-span-2 space-y-1.5">
                <Label>Role</Label>
                <StyledSelect
                  value={row.role}
                  onChange={(value) => onChangeRow(row.id, { role: value as PartnerRole })}
                  options={PARTNER_ROLE_OPTIONS}
                  placeholder="Select role"
                />
              </div>

              <div className="md:col-span-2 space-y-1.5">
                <Label>Contribution %</Label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.contributionPercentage || ""}
                  onChange={(e) => onChangeRow(row.id, { contributionPercentage: Number(e.target.value || 0) })}
                  placeholder="0"
                  className={inputClass}
                />
              </div>

              <div className="md:col-span-2 space-y-1.5">
                <Label>Contribution Amt</Label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.contributionAmount || ""}
                  onChange={(e) => onChangeRow(row.id, { contributionAmount: Number(e.target.value || 0) })}
                  placeholder="0"
                  className={inputClass}
                />
              </div>

              <div className="md:col-span-1 space-y-1.5">
                <Label>Owner %</Label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.ownershipPercentage || ""}
                  onChange={(e) => onChangeRow(row.id, { ownershipPercentage: Number(e.target.value || 0) })}
                  placeholder="0"
                  className={inputClass}
                />
              </div>

              <div className="md:col-span-1 space-y-1.5">
                <Label>Status</Label>
                <div className="h-10 flex items-center">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <div className="relative">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={row.status === "Active"}
                        onChange={(e) => onChangeRow(row.id, { status: e.target.checked ? "Active" : "Inactive" })}
                      />
                      <div className="w-9 h-5 bg-gray-300 rounded-full peer-checked:bg-[#f08c2b] transition-colors" />
                      <div className="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-4 shadow" />
                    </div>
                  </label>
                </div>
              </div>

              <div className="md:col-span-1 flex items-end justify-center">
                {onSaveRow && (
                  <button
                    type="button"
                    onClick={() => onSaveRow(row.id)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition-colors"
                    aria-label="Save partner row"
                    title="Save"
                  >
                    <FaCheck className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDeleteRow(row.id)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                  aria-label="Remove partner row"
                  title="Remove"
                >
                  <FaTrash className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
