"use client"

import { useEffect, useState } from "react"
import { MessageSquarePlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ContactPicker } from "./ContactPicker"
import type { ChatContact } from "@/lib/chats/types"

type NewConversationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  contacts?: ChatContact[]
  contactsApiBase?: string | null
  currentUserId: string
  onStart: (contact: ChatContact) => void
}

export function NewConversationDialog({
  open,
  onOpenChange,
  contacts = [],
  contactsApiBase = null,
  currentUserId,
  onStart,
}: NewConversationDialogProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedContacts, setSelectedContacts] = useState<ChatContact[]>([])

  useEffect(() => {
    if (!open) {
      setSelectedIds([])
      setSelectedContacts([])
    }
  }, [open])

  const selectedContact =
    selectedContacts[0] ?? contacts.find((contact) => contact.id === selectedIds[0])

  const handleStart = () => {
    if (!selectedContact) return
    onStart(selectedContact)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5 text-[#f08c2b]" />
            New conversation
          </DialogTitle>
          <DialogDescription>
            Select a member or staff colleague to start a direct message thread.
          </DialogDescription>
        </DialogHeader>

        <ContactPicker
          contacts={contacts}
          contactsApiBase={contactsApiBase}
          mode="single"
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          onSelectedContactsChange={setSelectedContacts}
          excludeIds={[currentUserId]}
        />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#f08c2b] text-white hover:bg-[#e07d1f]"
            disabled={!selectedContact}
            onClick={handleStart}
          >
            Start conversation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
