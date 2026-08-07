"use client"

import { useState } from "react"
import DatePicker from "react-multi-date-picker"
import { FiCalendar, FiX } from "react-icons/fi"

export const parseDateOnly = (value?: string | null): Date | null => {
  if (!value) return null
  const parts = value.split("-").map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null
  const [year, month, day] = parts
  return new Date(year, month - 1, day, 12, 0, 0)
}

export const toDateOnlyString = (date: Date): string => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

interface ReeveDatePickerProps {
  value?: string | null
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

export default function ReeveDatePicker({
  value,
  onChange,
  placeholder = "Select date",
  disabled = false,
}: ReeveDatePickerProps) {
  const [open, setOpen] = useState(false)
  const parsed = parseDateOnly(value)
  const displayDate = parsed
    ? parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : ""

  return (
    <DatePicker
      key={value || "empty"}
      className="orange"
      value={parsed}
      disabled={disabled}
      onOpenPickNewDate={false}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      onChange={(dateObj) => {
        if (dateObj) {
          const d = (dateObj as any)?.toDate?.()
          onChange(d ? toDateOnlyString(d) : "")
        } else {
          onChange("")
        }
      }}
      format="DD/MM/YYYY"
      containerStyle={{ width: "100%" }}
      render={(_pickerValue, openCalendar) => (
        <div
          onClick={disabled ? undefined : openCalendar}
          className={`flex items-center justify-between gap-2 w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 ${
            disabled
              ? "bg-muted/50 text-gray-500 cursor-not-allowed border-gray-200"
              : open
                ? "ring-[1.5px] ring-[#f08c2b] border-transparent cursor-pointer"
                : "border-gray-300 hover:border-gray-400 cursor-pointer"
          }`}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <FiCalendar className="text-gray-400 flex-shrink-0" />
            <span className={`truncate ${displayDate ? "text-gray-900" : "text-gray-400"}`}>
              {displayDate || placeholder}
            </span>
          </div>
          {Boolean(displayDate) && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onChange("")
              }}
              className="text-gray-400 hover:text-gray-600 focus:outline-none p-0.5 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
              aria-label="Clear date"
              title="Clear date"
            >
              <FiX className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    />
  )
}