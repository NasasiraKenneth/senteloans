"use client"

import { Forward, Pin, Reply } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type MessageBubbleActionsProps = {
  visible: boolean
  isOwn: boolean
  isPinned?: boolean
  onReply: () => void
  onForward: () => void
  onPin: () => void
}

export function MessageBubbleActions({
  visible,
  isOwn,
  isPinned = false,
  onReply,
  onForward,
  onPin,
}: MessageBubbleActionsProps) {
  return (
    <div
      className={cn(
        "absolute top-0 z-10 flex items-center gap-0.5 rounded-lg border border-border/80 bg-background/95 p-0.5 shadow-md backdrop-blur-sm transition-opacity duration-200",
        visible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        isOwn ? "right-0" : "left-0",
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={onReply}
        aria-label="Reply"
        title="Reply"
      >
        <Reply className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={onForward}
        aria-label="Forward"
        title="Forward"
      >
        <Forward className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          "h-7 w-7 hover:bg-muted",
          isPinned ? "text-[#f08c2b] hover:text-[#c46f12]" : "text-muted-foreground hover:text-foreground",
        )}
        onClick={onPin}
        aria-label={isPinned ? "Unpin message" : "Pin message"}
        title={isPinned ? "Unpin" : "Pin"}
      >
        <Pin className={cn("h-3.5 w-3.5", isPinned && "fill-current")} />
      </Button>
    </div>
  )
}
