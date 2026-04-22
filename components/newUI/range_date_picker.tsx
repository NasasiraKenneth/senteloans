"use client"

import { useRef, useState } from "react"
import DatePicker from "react-multi-date-picker"
import { FiCalendar } from "react-icons/fi"
import { convertDate } from "@/app/lib/utils"

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

/** Inclusive range as `YYYY-MM-DD` (same semantics as DataTable + TableFilter date-range → API). */
export type DateRangeValue = { start: string; end: string }

interface RangeDatePickerProps {
  value: DateRangeValue
  onChange: (next: DateRangeValue) => void
  placeholder?: string
}

/**
 * Date range picker aligned with `components/datatables/TableFilter.tsx` (`type: 'date-range'`):
 * - `react-multi-date-picker` with `range`
 * - Internal value as `Date[]` from `toDate()`
 * - Display via `convertDate` (startOfDay / endOfDay in app timezone, same as DataTable query building)
 */
export default function RangeDatePicker({
  value,
  onChange,
  placeholder = "Select date range",
}: RangeDatePickerProps) {
  const datePickerRef = useRef<{ closeCalendar?: () => void } | null>(null)
  const [open, setOpen] = useState(false)

  const toPickerRange = (): Date[] | undefined => {
    const a = value.start ? parseDateOnly(value.start) : null
    const b = value.end ? parseDateOnly(value.end) : null
    if (a && b) return [a, b]
    if (a) return [a]
    return undefined
  }

  const d0 = value.start ? parseDateOnly(value.start) : null
  const d1 = value.end ? parseDateOnly(value.end) : null
  const hasSelection = Boolean(d0 || d1)
  const hasCompleteRange = Boolean(d0 && d1)

  const labelText =
    hasCompleteRange && d0 && d1
      ? `${convertDate(d0)} - ${convertDate(d1, true)}`
      : placeholder

  return (
    <DatePicker
      ref={datePickerRef}
      className="orange"
      range
      value={toPickerRange()}
      onOpenPickNewDate={false}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      onChange={(dateObjects) => {
        const arr = Array.isArray(dateObjects) ? dateObjects : []
        if (arr.length === 0) {
          onChange({ start: "", end: "" })
          return
        }
        const d0 = (arr[0] as { toDate?: () => Date })?.toDate?.() ?? null
        const d1 = (arr[1] as { toDate?: () => Date })?.toDate?.() ?? null
        if (!d0) {
          onChange({ start: "", end: "" })
          return
        }
        onChange({
          start: toDateOnlyString(d0),
          end: d1 ? toDateOnlyString(d1) : "",
        })
      }}
      format="DD/MM/YYYY"
      containerStyle={{ width: "100%" }}
      inputClass="hidden"
      containerClassName="w-full"
      render={(_pickerValue, openCalendar) => (
        <div
          onClick={openCalendar}
          className={`flex items-center justify-between w-full gap-2 px-3 py-2.5 text-sm border rounded-md cursor-pointer transition-all duration-200 select-none ${
            open ? "ring-[1.5px] ring-[#f08c2b] border-transparent" : "border-gray-300 hover:border-gray-400"
          }`}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <FiCalendar className="text-gray-400 shrink-0" />
            <span className={`truncate ${hasSelection ? "text-gray-900 font-medium" : "text-gray-400"}`}>{labelText}</span>
          </div>
          {hasSelection && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onChange({ start: "", end: "" })
                datePickerRef.current?.closeCalendar?.()
              }}
              className="shrink-0 p-1 rounded-full hover:bg-gray-200 text-gray-500 transition-colors"
              aria-label="Clear date range"
            >
              ×
            </button>
          )}
        </div>
      )}
    />
  )
}
