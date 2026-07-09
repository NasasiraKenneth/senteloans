"use client"

import { Pin } from "lucide-react"
import { cn } from "@/lib/utils"
import { getMessagePreviewText } from "@/lib/chats/format"
import type { ChatMessage, ChatParticipant } from "@/lib/chats/types"

type PinnedMessagesBarProps = {
  messages: ChatMessage[]
  participants: ChatParticipant[]
  currentUserId: string
  isGroup: boolean
  onJump: (messageId: string) => void
  className?: string
}

export function PinnedMessagesBar({
  messages,
  participants,
  currentUserId,
  isGroup,
  onJump,
  className,
}: PinnedMessagesBarProps) {
  if (messages.length === 0) return null

  const participantMap = new Map(participants.map((p) => [p.id, p]))

  return (
    <div
      className={cn(
        "shrink-0 border-b border-[#f08c2b]/15 bg-[#fffaf5]/95 shadow-sm backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-4 py-2">
        <div className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-[#c46f12]">
          <Pin className="h-3.5 w-3.5 fill-[#f08c2b]/20" />
          <span>Pinned</span>
        </div>
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {messages.map((message) => {
            const sender =
              message.senderId === currentUserId
                ? "You"
                : (participantMap.get(message.senderId)?.name ?? "Unknown")
            const preview = getMessagePreviewText(message)

            return (
              <button
                key={message.id}
                type="button"
                onClick={() => onJump(message.id)}
                className={cn(
                  "flex max-w-[220px] shrink-0 flex-col rounded-lg border border-[#f08c2b]/20 bg-white px-3 py-2 text-left",
                  "shadow-sm transition-colors hover:border-[#f08c2b]/40 hover:bg-[#fff8f1]",
                )}
              >
                {isGroup ? (
                  <span className="truncate text-[10px] font-medium text-[#c46f12]">{sender}</span>
                ) : null}
                <span className="truncate text-xs text-foreground">{preview}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
