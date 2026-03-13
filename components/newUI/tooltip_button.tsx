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
            bgcolor: "white",
            color: "#282f40",
            fontSize: "0.75rem",
            padding: "6px 10px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            borderRadius: "8px",
          },
        },
        arrow: { sx: { color: "white" } },
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
