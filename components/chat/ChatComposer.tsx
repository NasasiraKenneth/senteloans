"use client"

import { useEffect, useRef, useState } from "react"
import { FileText, Paperclip, Send, X } from "lucide-react"
import { upload } from "@vercel/blob/client"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { previewMessage } from "@/lib/chats/format"
import type { ChatMessage, MessageType } from "@/lib/chats/types"

export type ReplyPreview = {
  messageId: string
  senderName: string
  body: string
  type: ChatMessage["type"]
}

export type ComposerAttachment = {
  fileName: string
  fileUrl: string
  mimeType?: string
  fileSize?: number
  storageKey?: string
}

export type SendMessagePayload = {
  body: string
  replyToId?: string
  messageType?: MessageType
  attachment?: ComposerAttachment
  visibility?: "PUBLIC" | "INTERNAL"
}

type ChatComposerProps = {
  onSend: (payload: SendMessagePayload) => void | Promise<void>
  disabled?: boolean
  placeholder?: string
  replyTo?: ReplyPreview | null
  onCancelReply?: () => void
  enableAttachments?: boolean
  conversationId?: string
  showDemoBanner?: boolean
  /** Staff SUPPORT threads: allow internal notes */
  enableInternalNotes?: boolean
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

export function ChatComposer({
  onSend,
  disabled = false,
  placeholder = "Type a message...",
  replyTo = null,
  onCancelReply,
  enableAttachments = false,
  conversationId,
  showDemoBanner = false,
  enableInternalNotes = false,
}: ChatComposerProps) {
  const [value, setValue] = useState("")
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [internalNote, setInternalNote] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (replyTo) setValue("")
  }, [replyTo?.messageId])

  useEffect(() => {
    if (!enableInternalNotes) setInternalNote(false)
  }, [enableInternalNotes])

  const clearPendingFile = () => {
    setPendingFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleSend = async () => {
    const trimmed = value.trim()
    if (disabled || uploading) return
    if (!trimmed && !pendingFile) return
    if (internalNote && pendingFile) return

    try {
      setUploading(true)

      let attachment: ComposerAttachment | undefined
      let messageType: MessageType = "TEXT"

      if (pendingFile && enableAttachments && conversationId && !internalNote) {
        const pathname = `chat-attachments/${conversationId}/${pendingFile.name}`
        const blob = await upload(pathname, pendingFile, {
          handleUploadUrl: "/api/vercel_blob/upload",
          access: "public",
          contentType: pendingFile.type || "application/octet-stream",
        })

        attachment = {
          fileName: pendingFile.name,
          fileUrl: blob.url,
          mimeType: pendingFile.type || undefined,
          fileSize: pendingFile.size,
          storageKey: blob.pathname,
        }
        messageType = pendingFile.type.startsWith("image/") ? "IMAGE" : "FILE"
      }

      await onSend({
        body: trimmed,
        replyToId: replyTo?.messageId,
        messageType,
        attachment,
        visibility: internalNote ? "INTERNAL" : "PUBLIC",
      })

      setValue("")
      clearPendingFile()
      onCancelReply?.()
    } catch (error) {
      console.error("[chat] attachment upload failed", error)
    } finally {
      setUploading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_ATTACHMENT_BYTES) {
      clearPendingFile()
      return
    }
    setPendingFile(file)
  }

  const canSend = Boolean(value.trim() || pendingFile) && !disabled && !uploading

  return (
    <div className="border-t border-border bg-card px-4 py-3">
      {enableInternalNotes ? (
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setInternalNote(false)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              !internalNote
                ? "bg-[#f08c2b]/15 text-[#c46f12]"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            Reply to member
          </button>
          <button
            type="button"
            onClick={() => {
              setInternalNote(true)
              clearPendingFile()
            }}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              internalNote
                ? "bg-amber-100 text-amber-900"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            Internal note
          </button>
        </div>
      ) : null}

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

      {pendingFile ? (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
          {pendingFile.type.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={URL.createObjectURL(pendingFile)}
              alt={pendingFile.name}
              className="h-10 w-10 rounded object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded bg-background text-[#e07d1f] ring-1 ring-border">
              <FileText className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{pendingFile.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {(pendingFile.size / 1024).toFixed(0)} KB
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={clearPendingFile}
            aria-label="Remove attachment"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground"
          disabled={!enableAttachments || disabled || uploading || !conversationId}
          title={enableAttachments ? "Attach a file" : "Attachments unavailable"}
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-5 w-5" />
        </Button>

        <div className="relative min-w-0 flex-1">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={disabled || uploading}
            placeholder={
              replyTo
                ? "Write a reply..."
                : internalNote
                  ? "Write an internal note (staff only)..."
                  : placeholder
            }
            className={cn(
              "max-h-32 min-h-[42px] w-full resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm",
              "placeholder:text-muted-foreground focus:border-[#f08c2b] focus:outline-none focus:ring-2 focus:ring-[#f08c2b]/25",
              "disabled:cursor-not-allowed disabled:opacity-50",
              internalNote && "border-amber-300 bg-amber-50/50 focus:border-amber-400 focus:ring-amber-200/50",
            )}
          />
        </div>

        <Button
          type="button"
          size="icon"
          className={cn(
            "shrink-0 text-white",
            internalNote
              ? "bg-amber-700 hover:bg-amber-800"
              : "bg-[#f08c2b] hover:bg-[#e07d1f]",
          )}
          onClick={() => void handleSend()}
          disabled={!canSend}
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      {showDemoBanner ? (
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          Demo mode — messages stay in this browser session only.
        </p>
      ) : null}
    </div>
  )
}
