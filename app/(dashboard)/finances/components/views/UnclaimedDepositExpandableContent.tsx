"use client"

import {
  Building2,
  CalendarClock,
  CalendarDays,
  CreditCard,
  FileText,
  Hash,
  Inbox,
  Link2,
  Receipt,
  Tag,
  UserRound,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { UnclaimedDepositRow } from "../../types"
import { formatCurrency, formatDate, unclaimedStatusBadge } from "../../utils"

interface Props {
  deposit: UnclaimedDepositRow
}

type FieldProps = {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  mono?: boolean
  className?: string
}

function Field({ icon, label, value, mono, className }: FieldProps) {
  return (
    <div className={`flex items-start gap-2 ${className ?? ""}`}>
      <span className="mt-0.5 shrink-0 text-gray-400">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className={`truncate text-sm text-gray-800 ${mono ? "font-mono" : ""}`}>
          {value || "—"}
        </p>
      </div>
    </div>
  )
}

function formatDateTime(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function UnclaimedDepositExpandableContent({ deposit }: Props) {
  const linked = deposit.linked_transaction
  const isClaimed = deposit.status.trim().toLowerCase() === "claimed"
  const notes = deposit.notes?.trim() || ""

  return (
    <div className="space-y-4 p-5">
      <div className="overflow-hidden rounded-xl border border-[#f08c2b]/25 bg-linear-to-br from-[#f08c2b]/10 via-white to-white">
        <div className="flex items-center justify-between gap-3 border-b border-[#f08c2b]/15 bg-[#f08c2b]/5 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#f08c2b]/20 bg-white text-[#f08c2b]">
              <Inbox className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#f08c2b]/80">
                Deposit
              </p>
              <p className="text-base font-semibold leading-tight text-gray-900">
                {formatCurrency(deposit.amount)}
              </p>
            </div>
          </div>
          <Badge className={unclaimedStatusBadge(deposit.status)} variant="outline">
            {deposit.status}
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-3">
          <Field
            icon={<Hash className="h-3.5 w-3.5" />}
            label="Reference"
            value={deposit.transaction_number}
            mono
          />
          <Field
            icon={<CreditCard className="h-3.5 w-3.5" />}
            label="Payment mode"
            value={deposit.mode}
          />
          <Field
            icon={<CalendarDays className="h-3.5 w-3.5" />}
            label="Deposit date"
            value={deposit.date ? formatDate(deposit.date) : ""}
          />
          <Field
            icon={<UserRound className="h-3.5 w-3.5" />}
            label="Assigned to"
            value={
              isClaimed ? (
                <span>
                  {deposit.assigned_to}{" "}
                  <span className="text-xs text-muted-foreground">({deposit.assigned_type})</span>
                </span>
              ) : (
                <span className="text-muted-foreground">Not yet claimed</span>
              )
            }
          />
          <Field
            icon={<Building2 className="h-3.5 w-3.5" />}
            label="Branch"
            value={deposit.branch_name}
          />
          <Field
            icon={<CalendarClock className="h-3.5 w-3.5" />}
            label="Recorded"
            value={
              <span>
                {deposit.created_by_name || "—"}
                {deposit.created_at ? (
                  <span className="block text-xs text-muted-foreground">
                    {formatDateTime(deposit.created_at)}
                  </span>
                ) : null}
              </span>
            }
          />
        </div>
      </div>

      {linked ? (
        <div className="overflow-hidden rounded-xl border border-emerald-200 bg-linear-to-br from-emerald-50 via-white to-white">
          <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/60 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200 bg-white text-emerald-600">
                <Link2 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700/80">
                  Linked transaction
                </p>
                <p className="text-base font-semibold leading-tight text-gray-900">
                  {formatCurrency(linked.amount)}
                </p>
              </div>
            </div>
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
              Claimed
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-3">
            <Field
              icon={<Receipt className="h-3.5 w-3.5" />}
              label="Transaction #"
              value={linked.transaction_number}
              mono
            />
            <Field icon={<Tag className="h-3.5 w-3.5" />} label="Type" value={linked.type} />
            <Field
              icon={<CreditCard className="h-3.5 w-3.5" />}
              label="Payment mode"
              value={linked.mode}
            />
            <Field
              icon={<CalendarDays className="h-3.5 w-3.5" />}
              label="Transaction date"
              value={linked.date ? formatDateTime(linked.date) : ""}
            />
            <Field
              icon={<Hash className="h-3.5 w-3.5" />}
              label="External reference"
              value={linked.reference_number}
              mono
            />
            <Field
              icon={<FileText className="h-3.5 w-3.5" />}
              label="Description"
              value={linked.description}
              className="sm:col-span-3"
            />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <p>
              No transaction is linked to this deposit yet. Use the <strong>Claim</strong> action to
              assign it to a member or third party agent and optionally link a transaction.
            </p>
          </div>
        </div>
      )}

      {notes ? (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="flex items-start gap-2">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Notes
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                {notes}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
