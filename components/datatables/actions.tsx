// actions.tsx
import { useState } from "react"
import Popover from "@mui/material/Popover"
import { MoreHorizontal } from "lucide-react"

export interface SelectOption {
  value: string
  label: string
  icon?: React.ReactNode
  onClick?: () => void
  color?: string
  disabled?: boolean
}

interface ActionSelectProps {
  row: any
  actions: SelectOption[]
  statusOptions?: SelectOption[] // optional, passed from parent
}

export function ActionSelect({
  row,
  actions,
  statusOptions,
}: {
  row: any
  actions: SelectOption[]
  statusOptions?: SelectOption[]
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const open = Boolean(anchor)

  return (
    <>
      <div
        onClick={(e) => setAnchor(e.currentTarget)}
        className="flex items-center justify-center w-8 h-8 rounded-full border hover:text-[#f08c2b] hover:bg-gray-100 cursor-pointer"
      >
        <MoreHorizontal className="h-4 w-4" />
      </div>

      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        PaperProps={{
          sx: {
            minWidth: 150, // ensures enough space
            width: 'auto', // can grow with content
            borderRadius: "10px",
            boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
            mt: 0.5,
          },
        }}
      >
        <div className="p-2">
          {/* Actions Section */}
          <div className="text-xs font-semibold text-gray-500 px-3 py-1">Actions</div>
          {actions.map((opt) => {
            const dis = Boolean(opt.disabled)
            return (
              <div
                key={opt.value}
                onClick={() => {
                  if (dis) return
                  opt.onClick?.()
                  setAnchor(null)
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  dis ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:bg-gray-50"
                }`}
              >
                {opt.icon}
                <span className="text-sm text-gray-800">{opt.label}</span>
              </div>
            )
          })}

          {/* Status Section */}
          {statusOptions && statusOptions.length > 0 && (
            <>
              <div className="mt-2 text-xs font-semibold text-gray-500 px-3 py-1">Change Status</div>
              {statusOptions.map((opt) => (
                <div
                  key={opt.value}
                  onClick={() => {
                    opt.onClick?.()
                    setAnchor(null)
                  }}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors ${opt.color}`}
                >
                  {opt.icon}
                  <span className="text-sm">{opt.label}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </Popover>
    </>
  )
}