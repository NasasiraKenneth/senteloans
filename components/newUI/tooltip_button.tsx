"use client"

import * as React from "react"
import Tooltip from "@mui/material/Tooltip"

type TooltipButtonProps = {
  tooltip: string
  disabled?: boolean
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
  className?: string
  children: React.ReactNode
}

export default function TooltipButton({
  tooltip,
  disabled = false,
  onClick,
  className = "",
  children,
}: TooltipButtonProps) {
  return (
    <Tooltip
      title={tooltip}
      placement="top"
      arrow
      enterDelay={300}
      slotProps={{
        tooltip: {
          sx: {
            bgcolor: "var(--color-card, #ffffff)",
            color: "var(--color-foreground, #1a1a1a)",
            fontSize: "0.75rem",
            fontWeight: 500,
            padding: "6px 10px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            borderRadius: "8px",
            border: "1px solid var(--color-border, #e5e7eb)",
          },
        },
        arrow: {
          sx: {
            color: "var(--color-card, #ffffff)",
            "&::before": {
              border: "1px solid var(--color-border, #e5e7eb)",
            },
          },
        },
      }}
    >
      <span className="inline-block">
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={className}
        >
          {children}
        </button>
      </span>
    </Tooltip>
  )
}
