"use client"

import type React from "react"
import { useState } from "react"
import Popover from "@mui/material/Popover"

export const memberEditInputClass =
  "w-full px-3 py-2.5 text-sm rounded-md border transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none border-gray-300 hover:border-gray-400"

export type SelectOption = { value: string; label: string }

export function normalizeDateFromApi(value: unknown): string {
  if (!value) return ""
  const raw = String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const prefix = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  if (prefix?.[1]) return prefix[1]

  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ""
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d)
  const year = parts.find((p) => p.type === "year")?.value
  const month = parts.find((p) => p.type === "month")?.value
  const day = parts.find((p) => p.type === "day")?.value
  return year && month && day ? `${year}-${month}-${day}` : ""
}

export function StyledInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props
  return <input {...rest} className={`${memberEditInputClass} ${className || ""}`.trim()} />
}

export function StyledSelect({
  value,
  onChange,
  placeholder,
  options,
  disabled = false,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  options: SelectOption[]
  disabled?: boolean
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const open = Boolean(anchor)
  const selectedLabel = options.find((o) => o.value === value)?.label

  return (
    <>
      <div
        onClick={(e) => {
          if (disabled) return
          setAnchor(e.currentTarget)
        }}
        className={`flex items-center justify-between w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 ${
          disabled
            ? "bg-muted/50 text-gray-500 cursor-not-allowed border-gray-200"
            : open ? "ring-[1.5px] ring-[#f08c2b] border-transparent" : "border-gray-300 hover:border-gray-400"
        }`}
      >
        <span className={value ? "text-gray-900" : "text-gray-400"}>{selectedLabel || placeholder}</span>
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
        PaperProps={{
          sx: {
            width: anchor?.offsetWidth || 200,
            borderRadius: "10px",
            boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
            mt: 0.5,
          },
        }}
      >
        <div className="p-2">
          {options.map((opt) => {
            const isSelected = value === opt.value
            return (
              <div
                key={opt.value}
                onClick={() => {
                  onChange(opt.value)
                  setAnchor(null)
                }}
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors"
              >
                <div
                  className={`relative w-4.5 h-4.5 border-2 flex items-center justify-center rounded-md transition-all ${
                    isSelected ? "bg-[#f08c2b] border-[#f08c2b]" : "bg-white border-gray-400 hover:border-gray-600"
                  }`}
                >
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-gray-800">{opt.label}</span>
              </div>
            )
          })}
        </div>
      </Popover>
    </>
  )
}
