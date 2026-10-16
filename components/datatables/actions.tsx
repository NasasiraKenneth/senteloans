// actions.tsx
import { useState } from "react"
import Popover from "@mui/material/Popover"
import { MoreHorizontal } from "lucide-react"

export interface SelectOption {
  value: string
  label: string
  icon?: React.ReactNode
  onClick?: (e?: React.MouseEvent) => void
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
        onClick={(e) => {
          e.stopPropagation()
          setAnchor(e.currentTarget)
        }}
        className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 dark:border-zinc-800 text-gray-600 dark:text-zinc-400 hover:text-brand hover:border-brand/40 dark:hover:border-brand/40 hover:bg-brand/5 dark:hover:bg-brand/10 dark:hover:text-brand cursor-pointer transition-colors"
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
            minWidth: 170,
            width: 'auto',
            borderRadius: "14px",
            boxShadow: "0 16px 36px rgba(0,0,0,0.4)",
            mt: 0.5,
            backgroundColor: "var(--color-card, #18181b)",
            color: "var(--color-foreground, #f4f4f5)",
            border: "1px solid var(--color-border, rgba(255, 255, 255, 0.1))",
            overflow: "hidden",
          },
        }}
      >
        <div className="p-2 bg-white dark:bg-zinc-900 rounded-xl" onClick={(e) => e.stopPropagation()}>
          {/* Actions Section */}
          <div className="text-xs font-semibold text-gray-400 dark:text-zinc-500 px-3 py-1">Actions</div>
          {actions.map((opt) => {
            const dis = Boolean(opt.disabled)
            return (
              <div
                key={opt.value}
                onClick={(e) => {
                  e.stopPropagation()
                  if (dis) return
                  opt.onClick?.(e)
                  setAnchor(null)
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  dis ? "cursor-not-allowed opacity-40 text-gray-400 dark:text-zinc-600" : "cursor-pointer hover:bg-brand/10 dark:hover:bg-zinc-800/80 hover:text-brand dark:hover:text-brand text-gray-800 dark:text-zinc-200"
                }`}
              >
                {opt.icon}
                <span className="text-sm">{opt.label}</span>
              </div>
            )
          })}

          {/* Status Section */}
          {statusOptions && statusOptions.length > 0 && (
            <>
              <div className="my-1 border-t border-gray-100 dark:border-zinc-800" />
              <div className="text-xs font-semibold text-gray-400 dark:text-zinc-500 px-3 py-1">Change Status</div>
              {statusOptions.map((opt) => (
                <div
                  key={opt.value}
                  onClick={(e) => {
                    e.stopPropagation()
                    opt.onClick?.(e)
                    setAnchor(null)
                  }}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-brand/10 dark:hover:bg-zinc-800/80 hover:text-brand dark:hover:text-brand rounded-lg transition-colors text-gray-800 dark:text-zinc-200 ${opt.color ?? ''}`}
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
