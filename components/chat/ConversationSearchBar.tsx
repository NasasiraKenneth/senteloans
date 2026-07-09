"use client"

import { useEffect, useRef } from "react"
import { ChevronDown, ChevronUp, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type ConversationSearchBarProps = {
  query: string
  onQueryChange: (value: string) => void
  matchCount: number
  activeMatchIndex: number
  onPrevious: () => void
  onNext: () => void
  onClose: () => void
  scopeLabel?: string
  className?: string
}

export function ConversationSearchBar({
  query,
  onQueryChange,
  matchCount,
  activeMatchIndex,
  onPrevious,
  onNext,
  onClose,
  scopeLabel = "Search messages",
  className,
}: ConversationSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const hasQuery = query.trim().length > 0
  const matchLabel =
    matchCount > 0 ? `${activeMatchIndex + 1} of ${matchCount}` : hasQuery ? "No results" : ""

  return (
    <div className={cn("border-b border-border bg-card px-3 py-2.5 sm:px-4", className)}>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                if (e.shiftKey) onPrevious()
                else onNext()
              }
              if (e.key === "Escape") onClose()
            }}
            placeholder={scopeLabel}
            className="h-9 pl-8 pr-3 focus-visible:ring-[#f08c2b]/40"
            aria-label={scopeLabel}
          />
        </div>

        {hasQuery ? (
          <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">
            {matchLabel}
          </span>
        ) : null}

        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onPrevious}
            disabled={!matchCount}
            aria-label="Previous match"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onNext}
            disabled={!matchCount}
            aria-label="Next match"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
            aria-label="Close search"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {hasQuery ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground sm:hidden">{matchLabel}</p>
      ) : null}
    </div>
  )
}
