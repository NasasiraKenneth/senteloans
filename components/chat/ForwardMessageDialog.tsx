"use client"

import { useEffect, useState } from "react"
import { CornerUpRight, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ConversationPicker } from "./ConversationPicker"
import { previewMessage } from "@/lib/chats/format"
import type { ChatConversation, ChatMessage } from "@/lib/chats/types"

type ForwardMessageDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  message: ChatMessage
  senderName: string
  sourceConversationId: string
  conversations?: ChatConversation[]
  inboxApiBase?: string | null
  currentUserId: string
  onForward: (targetConversationIds: string[], caption: string) => void
}

function ForwardMessagePreview({
  message,
  senderName,
}: {
  message: ChatMessage
  senderName: string
}) {
  const previewText = previewMessage(message.attachmentName ?? message.body, message.type)
  const isFile = message.type === "FILE"

  return (
    <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Message to forward
      </p>
      <div className="mt-2 rounded-lg border border-[#f08c2b]/15 bg-[#fff8f1] px-3 py-2.5">
        <p className="text-[11px] font-medium text-[#c46f12]">{senderName}</p>
        {isFile ? (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-[#e07d1f] shadow-sm ring-1 ring-[#f08c2b]/15">
              <FileText className="h-3.5 w-3.5" />
            </div>
            <p className="min-w-0 truncate text-sm text-foreground">{previewText}</p>
          </div>
        ) : (
          <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-foreground/90">
            {previewText}
          </p>
        )}
      </div>
    </div>
  )
}

export function ForwardMessageDialog({
  open,
  onOpenChange,
  message,
  senderName,
  sourceConversationId,
  conversations = [],
  inboxApiBase = null,
  currentUserId,
  onForward,
}: ForwardMessageDialogProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [caption, setCaption] = useState("")

  useEffect(() => {
    if (!open) {
      setSelectedIds([])
      setCaption("")
    }
  }, [open])

  const handleForward = () => {
    if (selectedIds.length === 0) return
    onForward(selectedIds, caption)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CornerUpRight className="h-5 w-5 text-[#f08c2b]" />
            Forward message
          </DialogTitle>
          <DialogDescription>
            Choose one or more conversations. You can add an optional note above the
            forwarded message.
          </DialogDescription>
        </DialogHeader>

        <ForwardMessagePreview message={message} senderName={senderName} />

        <div className="space-y-2">
          <label htmlFor="forward-caption" className="text-sm font-medium text-foreground">
            Add a note <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <textarea
            id="forward-caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Say something about this message..."
            rows={2}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f08c2b]/40"
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Send to</p>
          <ConversationPicker
            conversations={conversations}
            inboxApiBase={inboxApiBase}
            currentUserId={currentUserId}
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            excludeIds={[sourceConversationId]}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#f08c2b] text-white hover:bg-[#e07d1f]"
            disabled={selectedIds.length === 0}
            onClick={handleForward}
          >
            {selectedIds.length === 0
              ? "Forward"
              : selectedIds.length === 1
                ? "Forward to 1 chat"
                : `Forward to ${selectedIds.length} chats`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
