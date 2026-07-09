"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { FileText, Info, CheckCheck, CornerUpRight } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { formatBubbleTime, initialsFromName, previewMessage } from "@/lib/chats/format"
import { splitHighlightedText } from "@/lib/chats/search-messages"
import type { ChatMessage, ChatParticipant, ForwardedMessageMeta } from "@/lib/chats/types"
import { ParticipantNameLink } from "./ParticipantNameLink"
import { MessageBubbleActions } from "./MessageBubbleActions"

type MessageBubbleProps = {
  message: ChatMessage
  sender?: ChatParticipant
  isOwn: boolean
  showSender: boolean
  enableMemberLinks?: boolean
  highlightQuery?: string
  isActiveSearchMatch?: boolean
  isJumpHighlight?: boolean
  messageRef?: (node: HTMLDivElement | null) => void
  onReply?: (message: ChatMessage) => void
  onForward?: (message: ChatMessage) => void
  onPin?: (message: ChatMessage) => void
}

const BUBBLE_MAX_WIDTH = "max-w-[min(100%,28rem)]"
const ACTIONS_HIDE_DELAY_MS = 1500

function MessageReadReceipt({ isRead }: { isRead: boolean }) {
  return (
    <CheckCheck
      className={cn(
        "h-3.5 w-3.5 shrink-0",
        isRead ? "text-[#34B7F1]" : "text-muted-foreground/40",
      )}
      strokeWidth={2.25}
      aria-hidden
    />
  )
}

function BubbleMeta({
  sentAt,
  isOwn,
  isRead,
}: {
  sentAt: string
  isOwn: boolean
  isRead: boolean
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 leading-none">
      <span className="text-[11px] tabular-nums text-muted-foreground/70">
        {formatBubbleTime(sentAt)}
      </span>
      {isOwn ? <MessageReadReceipt isRead={isRead} /> : null}
    </span>
  )
}

function bubbleShellClass(isOwn: boolean, isActiveSearchMatch: boolean, isPinned: boolean, isJumpHighlight: boolean) {
  return cn(
    "relative w-fit overflow-hidden text-[13px] leading-[1.45] tracking-[-0.01em]",
    BUBBLE_MAX_WIDTH,
    (isActiveSearchMatch || isJumpHighlight) && "ring-2 ring-[#f08c2b]/50",
    isPinned && !isJumpHighlight && !isActiveSearchMatch && "ring-1 ring-[#f08c2b]/30",
    isOwn
      ? [
          "rounded-[18px] rounded-br-[5px]",
          "bg-linear-to-br from-[#fffaf5] via-white to-[#fff5eb]",
          "text-foreground",
          "shadow-[0_1px_1px_rgba(0,0,0,0.03),0_2px_10px_rgba(240,140,43,0.1)]",
          "ring-1 ring-[#f08c2b]/12",
        ]
      : [
          "rounded-[18px] rounded-bl-[5px]",
          "bg-white text-foreground",
          "shadow-[0_1px_1px_rgba(0,0,0,0.04),0_2px_8px_rgba(15,23,42,0.05)]",
          "ring-1 ring-black/[0.05]",
        ],
  )
}

function ForwardedQuote({
  forwardedFrom,
  isOwn,
  renderHighlightedText,
}: {
  forwardedFrom: ForwardedMessageMeta
  isOwn: boolean
  renderHighlightedText: (text: string) => ReactNode
}) {
  const previewText = forwardedFrom.attachmentName ?? forwardedFrom.body
  const isFile = forwardedFrom.type === "FILE"

  return (
    <div
      className={cn(
        "mb-2 rounded-lg border-l-[3px] px-2.5 py-2",
        isOwn
          ? "border-[#f08c2b]/50 bg-[#f08c2b]/6"
          : "border-muted-foreground/25 bg-muted/35",
      )}
    >
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <CornerUpRight className="h-3 w-3 shrink-0" />
        <span>Forwarded</span>
      </div>
      <p className="mt-0.5 text-[11px] font-medium text-[#c46f12]">{forwardedFrom.senderName}</p>
      {isFile ? (
        <div className="mt-1 flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="min-w-0 truncate text-xs text-foreground/90">
            {renderHighlightedText(previewText)}
          </p>
        </div>
      ) : (
        <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap text-xs text-foreground/85">
          {renderHighlightedText(previewText)}
        </p>
      )}
    </div>
  )
}

export function MessageBubble({
  message,
  sender,
  isOwn,
  showSender,
  enableMemberLinks = true,
  highlightQuery = "",
  isActiveSearchMatch = false,
  isJumpHighlight = false,
  messageRef,
  onReply,
  onForward,
  onPin,
}: MessageBubbleProps) {
  if (message.type === "SYSTEM") {
    return (
      <div className="flex justify-center py-2">
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] text-muted-foreground",
            "bg-background/80 shadow-sm ring-1 ring-border/60 backdrop-blur-sm",
            BUBBLE_MAX_WIDTH,
          )}
        >
          <Info className="h-3 w-3 shrink-0 text-muted-foreground/70" />
          <span className="wrap-break-word">{message.body}</span>
        </div>
      </div>
    )
  }

  const isFile = message.type === "FILE" && !message.forwardedFrom
  const hasCaption = message.body.trim().length > 0
  const isRead = Boolean(message.readAt)
  const isPinned = Boolean(message.pinned)
  const [actionsVisible, setActionsVisible] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showActions = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
    setActionsVisible(true)
  }

  const scheduleHideActions = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      setActionsVisible(false)
      hideTimerRef.current = null
    }, ACTIONS_HIDE_DELAY_MS)
  }

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  const renderHighlightedText = (text: string) => {
    const parts = splitHighlightedText(text, highlightQuery)
    return parts.map((part, index) =>
      part.highlight ? (
        <mark
          key={index}
          className={cn(
            "rounded-sm bg-[#fde4c3] px-0.5 text-foreground",
            isActiveSearchMatch && "bg-[#f08c2b]/35",
          )}
        >
          {part.text}
        </mark>
      ) : (
        <span key={index}>{part.text}</span>
      ),
    )
  }

  return (
    <div
      ref={messageRef}
      className={cn("flex gap-2.5", isOwn ? "flex-row-reverse" : "flex-row")}
    >
      {!isOwn && showSender ? (
        <Avatar className="mt-0.5 h-8 w-8 shrink-0 ring-2 ring-background">
          {sender?.avatarUrl ? <AvatarImage src={sender.avatarUrl} alt={sender.name} /> : null}
          <AvatarFallback className="bg-muted/80 text-[10px] font-semibold text-muted-foreground">
            {initialsFromName(sender?.name ?? "?")}
          </AvatarFallback>
        </Avatar>
      ) : !isOwn ? (
        <div className="w-8 shrink-0" />
      ) : null}

      <div
        className={cn(
          "relative flex min-w-0 flex-col pt-9",
          isOwn ? "items-end" : "items-start",
        )}
        onMouseEnter={showActions}
        onMouseLeave={scheduleHideActions}
        onFocusCapture={showActions}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            scheduleHideActions()
          }
        }}
      >
        {showSender && sender && !isOwn ? (
          <ParticipantNameLink
            participant={sender}
            enableMemberLinks={enableMemberLinks}
            className="mb-1.5 px-1 text-[11px] font-medium text-muted-foreground"
          >
            {sender.name}
          </ParticipantNameLink>
        ) : null}

        <MessageBubbleActions
          visible={actionsVisible}
          isOwn={isOwn}
          isPinned={isPinned}
          onReply={() => onReply?.(message)}
          onForward={() => onForward?.(message)}
          onPin={() => onPin?.(message)}
        />

        <div className={bubbleShellClass(isOwn, isActiveSearchMatch, isPinned, isJumpHighlight)}>
          {message.forwardedFrom ? (
            <div className="px-3 py-2">
              {hasCaption ? (
                <p className="mb-2 whitespace-pre-wrap wrap-break-word text-foreground/95">
                  {renderHighlightedText(message.body)}
                </p>
              ) : null}
              <ForwardedQuote
                forwardedFrom={message.forwardedFrom}
                isOwn={isOwn}
                renderHighlightedText={renderHighlightedText}
              />
              <div className="flex justify-end">
                <BubbleMeta sentAt={message.sentAt} isOwn={isOwn} isRead={isRead} />
              </div>
            </div>
          ) : isFile ? (
            <div className="px-3 pt-2.5 pb-2">
              <div
                className={cn(
                  "flex min-w-0 items-center gap-3 rounded-xl p-2.5",
                  isOwn ? "bg-[#f08c2b]/6" : "bg-muted/35",
                )}
              >
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                    isOwn
                      ? "bg-white text-[#e07d1f] shadow-sm ring-1 ring-[#f08c2b]/15"
                      : "bg-white text-muted-foreground shadow-sm ring-1 ring-black/4",
                  )}
                >
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="wrap-break-word text-sm font-medium text-foreground">
                    {renderHighlightedText(message.attachmentName ?? message.body)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {previewMessage(message.body, message.type)}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex justify-end">
                <BubbleMeta sentAt={message.sentAt} isOwn={isOwn} isRead={isRead} />
              </div>
            </div>
          ) : (
            <div className="px-3 py-2">
              <div className="flex flex-wrap items-end justify-end gap-x-1.5 gap-y-0.5">
                <p className="min-w-12 flex-1 whitespace-pre-wrap wrap-break-word text-foreground/95">
                  {renderHighlightedText(message.body)}
                </p>
                <BubbleMeta sentAt={message.sentAt} isOwn={isOwn} isRead={isRead} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
