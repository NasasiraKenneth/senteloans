"use client"

import { useEffect, useState } from "react"
import { Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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

type CreateGroupDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  contacts?: ChatContact[]
  contactsApiBase?: string | null
  currentUserId: string
  onCreate: (name: string, description: string, members: ChatContact[]) => void
}

export function CreateGroupDialog({
  open,
  onOpenChange,
  contacts = [],
  contactsApiBase = null,
  currentUserId,
  onCreate,
}: CreateGroupDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedContacts, setSelectedContacts] = useState<ChatContact[]>([])

  useEffect(() => {
    if (!open) {
      setName("")
      setDescription("")
      setSelectedIds([])
      setSelectedContacts([])
    }
  }, [open])

  const resolvedSelectedContacts =
    selectedContacts.length > 0
      ? selectedContacts
      : contacts.filter((contact) => selectedIds.includes(contact.id))
  const canCreate = name.trim().length > 0 && resolvedSelectedContacts.length > 0

  const handleCreate = () => {
    if (!canCreate) return
    onCreate(name.trim(), description.trim(), resolvedSelectedContacts)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[#f08c2b]" />
            Create group
          </DialogTitle>
          <DialogDescription>
            Name your group and add members or staff participants.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="group-name">Group name</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Credit Committee — August"
              className="focus-visible:ring-[#f08c2b]/40"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="group-description">Description (optional)</Label>
            <Textarea
              id="group-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this group for?"
              rows={2}
              className="resize-none focus-visible:ring-[#f08c2b]/40"
            />
          </div>

          <div className="space-y-2">
            <Label>Add participants</Label>
            <ContactPicker
              contacts={contacts}
              contactsApiBase={contactsApiBase}
              mode="multiple"
              selectedIds={selectedIds}
              onSelectedIdsChange={setSelectedIds}
              onSelectedContactsChange={setSelectedContacts}
              excludeIds={[currentUserId]}
            />
            {resolvedSelectedContacts.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {resolvedSelectedContacts.length} participant
                {resolvedSelectedContacts.length === 1 ? "" : "s"} selected
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#f08c2b] text-white hover:bg-[#e07d1f]"
            disabled={!canCreate}
            onClick={handleCreate}
          >
            Create group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
