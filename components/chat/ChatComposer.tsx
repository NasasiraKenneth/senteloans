"use client"

import { useEffect, useState } from "react"
import { Paperclip, Send, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { previewMessage } from "@/lib/chats/format"
import type { ChatMessage } from "@/lib/chats/types"

export type ReplyPreview = {
  messageId: string
  senderName: string
  body: string
  type: ChatMessage["type"]
}

type ChatComposerProps = {
  onSend: (body: string, replyToId?: string) => void
  disabled?: boolean
  placeholder?: string
  replyTo?: ReplyPreview | null
  onCancelReply?: () => void
}

export function ChatComposer({
  onSend,
  disabled = false,
  placeholder = "Type a message...",
  replyTo = null,
  onCancelReply,
}: ChatComposerProps) {
  const [value, setValue] = useState("")

  useEffect(() => {
    if (replyTo) setValue("")
  }, [replyTo?.messageId])

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed, replyTo?.messageId)
    setValue("")
    onCancelReply?.()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-border bg-card px-4 py-3">
      {replyTo ? (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-[#f08c2b]/20 bg-[#fff8f1] px-3 py-2">
          <div className="min-w-0 flex-1 border-l-2 border-[#f08c2b] pl-2">
            <p className="text-[11px] font-medium text-[#c46f12]">Replying to {replyTo.senderName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {previewMessage(replyTo.body, replyTo.type)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground"
            onClick={onCancelReply}
            aria-label="Cancel reply"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground"
          disabled
          title="Attachments coming soon"
        >
          <Paperclip className="h-5 w-5" />
        </Button>

        <div className="relative min-w-0 flex-1">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={disabled}
            placeholder={replyTo ? "Write a reply..." : placeholder}
            className={cn(
              "max-h-32 min-h-[42px] w-full resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm",
              "placeholder:text-muted-foreground focus:border-[#f08c2b] focus:outline-none focus:ring-2 focus:ring-[#f08c2b]/25",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          />
        </div>

        <Button
          type="button"
          size="icon"
          className="shrink-0 bg-[#f08c2b] text-white hover:bg-[#e07d1f]"
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <p className="mt-2 text-center text-[10px] text-muted-foreground">
        Demo mode — messages stay in this browser session only.
      </p>
    </div>
  )
}
