"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { initialsFromName } from "@/lib/chats/format"
import { buildChatsQueryString } from "@/lib/chats/client/build-query"
import type { ChatContact, ChatContactsResponse } from "@/lib/chats/types"

type ContactFilter = "all" | "member" | "staff"

type ContactPickerProps = {
  contacts?: ChatContact[]
  contactsApiBase?: string | null
  mode: "single" | "multiple"
  selectedIds: string[]
  onSelectedIdsChange: (ids: string[]) => void
  onSelectedContactsChange?: (contacts: ChatContact[]) => void
  excludeIds?: string[]
  /** Lock filter to staff (support agent adds) */
  roleFilter?: ContactFilter
}

const FILTERS: { id: ContactFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "member", label: "Members" },
  { id: "staff", label: "Staff" },
]

export function ContactPicker({
  contacts = [],
  contactsApiBase = null,
  mode,
  selectedIds,
  onSelectedIdsChange,
  onSelectedContactsChange,
  excludeIds = [],
  roleFilter,
}: ContactPickerProps) {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [filter, setFilter] = useState<ContactFilter>(roleFilter ?? "all")
  const [remoteContacts, setRemoteContacts] = useState<ChatContact[]>([])
  const [loading, setLoading] = useState(Boolean(contactsApiBase))
  const [selectedById, setSelectedById] = useState<Record<string, ChatContact>>({})

  useEffect(() => {
    if (roleFilter) setFilter(roleFilter)
  }, [roleFilter])

  useEffect(() => {
    if (selectedIds.length === 0) {
      setSelectedById({})
    }
  }, [selectedIds])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (!contactsApiBase) return

    let cancelled = false
    setLoading(true)

    const loadContacts = async () => {
      try {
        const response = await fetch(
          `${contactsApiBase}${buildChatsQueryString({
            search: debouncedQuery,
            role: filter,
          })}`,
          { cache: "no-store" },
        )
        const data = (await response.json()) as ChatContactsResponse & { error?: string }
        if (!response.ok) {
          throw new Error(data.error || "Failed to load contacts")
        }
        if (!cancelled) setRemoteContacts(data.contacts ?? [])
      } catch {
        if (!cancelled) setRemoteContacts([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadContacts()

    return () => {
      cancelled = true
    }
  }, [contactsApiBase, debouncedQuery, filter])

  const sourceContacts = contactsApiBase ? remoteContacts : contacts

  const visibleContacts = useMemo(() => {
    const excluded = new Set(excludeIds)
    const q = contactsApiBase ? "" : query.trim().toLowerCase()

    return sourceContacts.filter((contact) => {
      if (excluded.has(contact.id)) return false
      if (contactsApiBase) return true
      if (filter !== "all" && contact.role !== filter) return false
      if (!q) return true

      const haystack = [contact.name, contact.subtitle, contact.role]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [contactsApiBase, excludeIds, filter, query, sourceContacts])

  const toggleContact = (contactId: string) => {
    const contact = sourceContacts.find((item) => item.id === contactId)

    if (mode === "single") {
      const nextMap = contact ? { [contactId]: contact } : {}
      setSelectedById(nextMap)
      onSelectedIdsChange(contact ? [contactId] : [])
      onSelectedContactsChange?.(contact ? [contact] : [])
      return
    }

    if (selectedIds.includes(contactId)) {
      const nextIds = selectedIds.filter((id) => id !== contactId)
      const nextMap = { ...selectedById }
      delete nextMap[contactId]
      setSelectedById(nextMap)
      onSelectedIdsChange(nextIds)
      onSelectedContactsChange?.(nextIds.map((id) => nextMap[id]).filter(Boolean))
      return
    }

    if (!contact) return

    const nextMap = { ...selectedById, [contactId]: contact }
    const nextIds = [...selectedIds, contactId]
    setSelectedById(nextMap)
    onSelectedIdsChange(nextIds)
    onSelectedContactsChange?.(nextIds.map((id) => nextMap[id]).filter(Boolean))
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or role..."
          className="h-9 pl-9 focus-visible:ring-[#f08c2b]/40"
        />
      </div>

      {!roleFilter ? (
        <div className="flex gap-1.5">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                filter === item.id
                  ? "bg-[#f08c2b] text-white"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="max-h-56 overflow-y-auto rounded-lg border border-border/80">
        {loading ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading contacts…</p>
        ) : visibleContacts.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No contacts found.</p>
        ) : (
          visibleContacts.map((contact) => {
            const isSelected = selectedIds.includes(contact.id)
            return (
              <button
                key={contact.id}
                type="button"
                onClick={() => toggleContact(contact.id)}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-border/60 px-3 py-2.5 text-left transition-colors last:border-b-0",
                  isSelected ? "bg-[#fff7ed]" : "hover:bg-muted/40",
                )}
              >
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback
                    className={cn(
                      "text-xs font-semibold",
                      contact.role === "member"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {initialsFromName(contact.name)}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{contact.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {contact.subtitle ?? (contact.role === "member" ? "Member" : "Staff")}
                  </p>
                </div>

                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    isSelected
                      ? "border-[#f08c2b] bg-[#f08c2b] text-white"
                      : "border-border bg-background text-transparent",
                  )}
                >
                  <Check className="h-3 w-3" />
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
