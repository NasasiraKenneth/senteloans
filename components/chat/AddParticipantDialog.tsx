"use client"

import { useEffect, useMemo, useState } from "react"
import { UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
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
import type { ChatConversation } from "@/lib/chats/types"

type AddParticipantDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversation: ChatConversation
  contacts?: ChatContact[]
  contactsApiBase?: string | null
  onAdd: (participants: ChatContact[]) => void
  staffOnly?: boolean
}

export function AddParticipantDialog({
  open,
  onOpenChange,
  conversation,
  contacts = [],
  contactsApiBase = null,
  onAdd,
  staffOnly = false,
}: AddParticipantDialogProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedContacts, setSelectedContacts] = useState<ChatContact[]>([])

  const existingParticipantIds = useMemo(
    () => conversation.participants.map((participant) => participant.id),
    [conversation.participants],
  )

  useEffect(() => {
    if (!open) {
      setSelectedIds([])
      setSelectedContacts([])
    }
  }, [open])

  const resolvedSelectedContacts =
    selectedContacts.length > 0
      ? selectedContacts
      : contacts.filter((contact) => selectedIds.includes(contact.id))
  const canAdd = resolvedSelectedContacts.length > 0

  const handleAdd = () => {
    if (!canAdd) return
    onAdd(resolvedSelectedContacts)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-[#f08c2b]" />
            {staffOnly ? "Add support agents" : "Add participants"}
          </DialogTitle>
          <DialogDescription>
            {staffOnly
              ? (
                <>
                  Add staff agents to{" "}
                  <span className="font-medium text-foreground">{conversation.title}</span>.
                  The member will not see who was added.
                </>
              )
              : (
                <>
                  Add members or staff to{" "}
                  <span className="font-medium text-foreground">{conversation.title}</span>.
                  Current participants are excluded from the list.
                </>
              )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>{staffOnly ? "Select staff" : "Select participants"}</Label>
          <ContactPicker
            contacts={staffOnly ? contacts.filter((c) => c.role === "staff") : contacts}
            contactsApiBase={contactsApiBase}
            mode="multiple"
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            onSelectedContactsChange={setSelectedContacts}
            excludeIds={existingParticipantIds}
            roleFilter={staffOnly ? "staff" : undefined}
          />
          {resolvedSelectedContacts.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {resolvedSelectedContacts.length} participant
              {resolvedSelectedContacts.length === 1 ? "" : "s"} selected
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#f08c2b] text-white hover:bg-[#e07d1f]"
            disabled={!canAdd}
            onClick={handleAdd}
          >
            {resolvedSelectedContacts.length === 0
              ? "Add participants"
              : resolvedSelectedContacts.length === 1
                ? "Add 1 participant"
                : `Add ${resolvedSelectedContacts.length} participants`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
