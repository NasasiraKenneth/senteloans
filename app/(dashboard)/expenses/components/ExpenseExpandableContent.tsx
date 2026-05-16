"use client"

import { FileText } from "lucide-react"

export interface ExpenseExpandableModel {
  expense_number: string
  name: string
  description: string | null
}

interface ExpenseExpandableContentProps {
  expense: ExpenseExpandableModel
}

export default function ExpenseExpandableContent({ expense }: ExpenseExpandableContentProps) {
  const description = expense.description?.trim() || ""

  return (
    <div className="p-5">
      <div className="rounded-xl border border-[#f08c2b]/30 bg-linear-to-r from-orange-50 via-amber-50 to-white p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-white p-2 text-[#de4925] shadow-sm">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Description</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{expense.name?.trim() || "—"}</p>
            <p className="mt-0.5 font-mono text-xs text-gray-600">{expense.expense_number}</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
              {description || "No description provided."}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}