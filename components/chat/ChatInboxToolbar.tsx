"use client"

import { useState } from "react"
import { MessageCircle, MessageSquarePlus, MoreHorizontal, Search, Users } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"
import type { ConversationFilter } from "@/lib/chats/types"

type ChatEmptyStateProps = {
  className?: string
  title?: string
  description?: string
}

export function ChatEmptyState({
  className,
  title = "Select a conversation",
  description = "Choose a thread from the inbox or start a new message when chat goes live.",
}: ChatEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center bg-muted/20 px-6 text-center",
        className,
      )}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <MessageCircle className="h-8 w-8" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

type ChatInboxToolbarProps = {
  search: string
  onSearchChange: (value: string) => void
  filter: ConversationFilter
  onFilterChange: (filter: ConversationFilter) => void
  totalUnread: number
  onNewConversation?: () => void
  onCreateGroup?: () => void
}

const FILTERS: { id: ConversationFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "DIRECT", label: "Direct" },
  { id: "GROUP", label: "Groups" },
  { id: "LOAN", label: "Loans" },
  { id: "SUPPORT", label: "Support" },
]

export function ChatInboxToolbar({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  totalUnread,
  onNewConversation,
  onCreateGroup,
}: ChatInboxToolbarProps) {
  const { toast } = useToast()
  const [menuOpen, setMenuOpen] = useState(false)

  const openAfterMenuClose = (action?: () => void) => {
    setMenuOpen(false)
    if (!action) return
    window.setTimeout(action, 0)
  }

  const showDemoAction = (label: string) => {
    toast({
      title: label,
      description: "This action will be available when chat is connected.",
    })
  }

  return (
    <div className="border-b border-border bg-card px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Messages</h1>
          <p className="text-xs text-muted-foreground">
            {totalUnread > 0 ? `${totalUnread} unread` : "All caught up"}
          </p>
        </div>

        <div className="flex items-center rounded-full bg-amber-50 py-0.5 pl-0.5 pr-0.5 ring-1 ring-[#f08c2b]/30">
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full text-[#c46f12] hover:bg-[#f08c2b]/10 hover:text-[#a85f0f]"
                aria-label="Message options"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Quick actions
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {onCreateGroup ? (
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={(event) => {
                    event.preventDefault()
                    openAfterMenuClose(onCreateGroup)
                  }}
                >
                  <Users className="h-4 w-4" />
                  Create group
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={(event) => {
                  event.preventDefault()
                  openAfterMenuClose(onNewConversation)
                }}
              >
                <MessageSquarePlus className="h-4 w-4" />
                New conversation
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={() => showDemoAction("Message settings")}
              >
                <MessageCircle className="h-4 w-4" />
                More options
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search conversations..."
          className="h-9 border-border bg-background pl-9 focus-visible:ring-[#f08c2b]/40"
        />
      </div>

      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onFilterChange(item.id)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              filter === item.id
                ? "bg-[#f08c2b] text-white shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
