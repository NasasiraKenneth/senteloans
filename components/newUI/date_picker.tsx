"use client"

import { useState } from "react"
import DatePicker from "react-multi-date-picker"
import { FiCalendar } from "react-icons/fi"

export const parseDateOnly = (value: string): Date | null => {
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
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function ReeveDatePicker({
  value,
  onChange,
  placeholder = "Select date",
}: ReeveDatePickerProps) {
  const [open, setOpen] = useState(false)
  const parsed = parseDateOnly(value)
  const displayDate = parsed
    ? parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : ""

  return (
    <DatePicker
      className="orange"
      value={parsed}
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
          onClick={openCalendar}
          className={`flex items-center gap-2 w-full px-3 py-2.5 text-sm border rounded-md cursor-pointer transition-all duration-200 ${
            open ? "ring-[1.5px] ring-[#f08c2b] border-transparent" : "border-gray-300 hover:border-gray-400"
          }`}
        >
          <FiCalendar className="text-gray-400" />
          <span className={displayDate ? "text-gray-900" : "text-gray-400"}>{displayDate || placeholder}</span>
        </div>
      )}
    />
  )
}