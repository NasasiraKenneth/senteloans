"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChatInboxToolbar } from "./ChatInboxToolbar"
import { ConversationList } from "./ConversationList"
import { ChatThread } from "./ChatThread"
import { ChatEmptyState } from "./ChatInboxToolbar"
import { NewConversationDialog } from "./NewConversationDialog"
import { CreateGroupDialog } from "./CreateGroupDialog"
import { ForwardMessageDialog } from "./ForwardMessageDialog"
import { AddParticipantDialog } from "./AddParticipantDialog"
import { cn } from "@/lib/utils"
import { CHAT_DUMMY_CONTACTS } from "@/lib/chats/dummy-contacts"
import {
  buildDirectConversation,
  buildGroupConversation,
  buildParticipantsAddedSystemMessage,
  findExistingDirectConversation,
  mergeParticipants,
} from "@/lib/chats/create-conversation"
import { buildForwardedMessage, getForwardedLastMessagePreview } from "@/lib/chats/forward-message"
import { useToast } from "@/components/ui/toast"
import { subscribeInboxUpdates } from "@/lib/chats/client/inbox-realtime"
import { subscribeThreadUpdates } from "@/lib/chats/client/thread-realtime"
import { buildChatsQueryString } from "@/lib/chats/client/build-query"
import { sortConversationsForInbox } from "@/lib/chats/conversation-inbox"
import type {
  ChatContact,
  ChatConversation,
  ChatInboxResponse,
  ChatMessage,
  ConversationFilter,
  CreateConversationResponse,
  AddParticipantsResponse,
  ForwardMessagesResponse,
  ListMessagesResponse,
  SendMessageResponse,
  TogglePinResponse,
} from "@/lib/chats/types"

type ChatsShellProps = {
  apiBase?: string
  initialConversations?: ChatConversation[]
  currentIdentityId?: string
  className?: string
  enableMemberLinks?: boolean
  allowCreateGroup?: boolean
  contacts?: ChatContact[]
}

export function ChatsShell({
  apiBase,
  initialConversations = [],
  currentIdentityId: initialCurrentIdentityId = "",
  className,
  enableMemberLinks = true,
  allowCreateGroup = true,
  contacts: initialContacts = CHAT_DUMMY_CONTACTS,
}: ChatsShellProps) {
  const { toast } = useToast()
  const contactsApiBase = apiBase ? `${apiBase}/contacts` : null
  const conversationsApiBase = apiBase ? `${apiBase}/conversations` : null
  const messagesApiBase = apiBase ? `${apiBase}/conversations` : null
  const isClientPortalApi = Boolean(apiBase?.startsWith("/api/client/"))
  const [conversations, setConversations] = useState<ChatConversation[]>(initialConversations)
  const [contacts] = useState<ChatContact[]>(initialContacts)
  const [currentIdentityId, setCurrentIdentityId] = useState(initialCurrentIdentityId)
  const [inboxLoading, setInboxLoading] = useState(Boolean(apiBase))
  const [inboxError, setInboxError] = useState<string | null>(null)
  const [totalUnread, setTotalUnread] = useState(0)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [filter, setFilter] = useState<ConversationFilter>("all")
  const [mobileShowThread, setMobileShowThread] = useState(false)
  const [newConversationOpen, setNewConversationOpen] = useState(false)
  const [createGroupOpen, setCreateGroupOpen] = useState(false)
  const [addParticipantsOpen, setAddParticipantsOpen] = useState(false)
  const [forwardPayload, setForwardPayload] = useState<{
    message: ChatMessage
    senderName: string
    sourceConversationId: string
  } | null>(null)
  const [messagesLoadingId, setMessagesLoadingId] = useState<string | null>(null)

  const fetchInbox = useCallback(
    async (options?: { skipCache?: boolean }) => {
      if (!apiBase) return

      setInboxLoading(true)
      setInboxError(null)

      try {
        const url = `${apiBase}${buildChatsQueryString({
          refresh: options?.skipCache ? "true" : undefined,
          filter: filter !== "all" ? filter : undefined,
          search: debouncedSearch,
        })}`
        const response = await fetch(url, { cache: "no-store" })
        const data = (await response.json()) as ChatInboxResponse & { error?: string }
        if (!response.ok) {
          throw new Error(data.error || "Failed to load inbox")
        }

        setConversations(data.conversations ?? [])
        setCurrentIdentityId(data.currentIdentityId ?? "")
        setTotalUnread(data.totalUnread ?? 0)
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to load inbox"
        setInboxError(message)
        setConversations([])
        setCurrentIdentityId("")
        setTotalUnread(0)
      } finally {
        setInboxLoading(false)
      }
    },
    [apiBase, debouncedSearch, filter],
  )

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    void fetchInbox()
  }, [fetchInbox])

  useEffect(() => {
    if (!apiBase || !currentIdentityId) return
    return subscribeInboxUpdates(currentIdentityId, () => {
      void fetchInbox({ skipCache: true })
    })
  }, [apiBase, currentIdentityId, fetchInbox])

  const fetchMessages = useCallback(
    async (conversationId: string) => {
      if (!messagesApiBase) return

      setMessagesLoadingId(conversationId)
      try {
        const response = await fetch(`${messagesApiBase}/${conversationId}/messages`, {
          cache: "no-store",
        })
        const data = (await response.json()) as ListMessagesResponse & {
          error?: string
          message?: string
        }
        if (!response.ok) {
          throw new Error(data.message || data.error || "Failed to load messages")
        }

        setConversations((prev) =>
          prev.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  messages: data.messages ?? [],
                  unreadCount: 0,
                }
              : conversation,
          ),
        )
      } catch (error: unknown) {
        toast({
          title: "Could not load messages",
          description: error instanceof Error ? error.message : "Please try again.",
        })
      } finally {
        setMessagesLoadingId((current) => (current === conversationId ? null : current))
      }
    },
    [messagesApiBase, toast],
  )

  const applyThreadEvent = useCallback(
    (event: {
      type: string
      conversationId: string
      message?: ChatMessage
      latestPinnedAt?: string | null
      systemMessage?: ChatMessage
    }) => {
      if (event.type === "message:new" && event.message) {
        const incoming = event.message
        setConversations((prev) =>
          sortConversationsForInbox(
            prev.map((conversation) => {
              if (conversation.id !== event.conversationId) return conversation

              const hasMessage = conversation.messages.some((message) => message.id === incoming.id)
              const messages = hasMessage
                ? conversation.messages.map((message) =>
                    message.id === incoming.id ? incoming : message,
                  )
                : [...conversation.messages, incoming]

              const isActive = activeId === conversation.id
              const fromSelf = incoming.senderId === currentIdentityId

              return {
                ...conversation,
                messages,
                unreadCount:
                  isActive || fromSelf
                    ? isActive
                      ? 0
                      : conversation.unreadCount
                    : conversation.unreadCount + (hasMessage ? 0 : 1),
                lastMessage: {
                  body: incoming.body,
                  sentAt: incoming.sentAt,
                  senderId: incoming.senderId,
                  type: incoming.type,
                },
              }
            }),
          ),
        )
        return
      }

      if (event.type === "message:updated" && event.message) {
        const updated = event.message
        setConversations((prev) =>
          prev.map((conversation) => {
            if (conversation.id !== event.conversationId) return conversation
            return {
              ...conversation,
              latestPinnedAt:
                event.latestPinnedAt !== undefined
                  ? event.latestPinnedAt
                  : conversation.latestPinnedAt,
              messages: conversation.messages.map((message) =>
                message.id === updated.id ? updated : message,
              ),
            }
          }),
        )
        return
      }

      if (event.type === "participants:added") {
        void fetchInbox({ skipCache: true })
        if (activeId === event.conversationId) {
          void fetchMessages(event.conversationId)
        }
        if (!event.systemMessage) return

        const systemMessage = event.systemMessage
        setConversations((prev) =>
          prev.map((conversation) => {
            if (conversation.id !== event.conversationId) return conversation
            const hasMessage = conversation.messages.some(
              (message) => message.id === systemMessage.id,
            )
            return {
              ...conversation,
              messages: hasMessage
                ? conversation.messages
                : [...conversation.messages, systemMessage],
              lastMessage: {
                body: systemMessage.body,
                sentAt: systemMessage.sentAt,
                senderId: systemMessage.senderId,
                type: systemMessage.type,
              },
            }
          }),
        )
      }
    },
    [activeId, currentIdentityId, fetchInbox, fetchMessages],
  )

  useEffect(() => {
    if (!apiBase || !activeId) return
    return subscribeThreadUpdates(activeId, applyThreadEvent)
  }, [activeId, apiBase, applyThreadEvent])

  const displayList = useMemo(() => {
    if (apiBase) return conversations

    const query = search.trim().toLowerCase()
    return sortConversationsForInbox(
      conversations.filter((conversation) => {
        const matchesFilter = filter === "all" || conversation.type === filter
        if (!matchesFilter) return false
        if (!query) return true

        const peerName =
          conversation.type === "DIRECT"
            ? conversation.participants.find((p) => p.id !== currentIdentityId)?.name
            : conversation.title

        const haystack = [
          conversation.title,
          peerName,
          conversation.lastMessage?.body,
          conversation.reference?.label,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()

        return haystack.includes(query)
      }),
    )
  }, [apiBase, conversations, currentIdentityId, filter, search])

  const demoTotalUnread = useMemo(
    () => conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0),
    [conversations],
  )

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null

  const openConversation = useCallback(
    (id: string) => {
      setActiveId(id)
      setMobileShowThread(true)
      setConversations((prev) => {
        const opened = prev.find((conversation) => conversation.id === id)
        if (apiBase && opened?.unreadCount) {
          setTotalUnread((current) => Math.max(0, current - opened.unreadCount))
        }
        return prev.map((conversation) =>
          conversation.id === id ? { ...conversation, unreadCount: 0 } : conversation,
        )
      })

      if (messagesApiBase) {
        void fetchMessages(id)
      }
    },
    [apiBase, fetchMessages, messagesApiBase],
  )

  const handleSelect = (id: string) => {
    openConversation(id)
  }

  const handleNewConversation = useCallback(
    async (contact: ChatContact) => {
      if (conversationsApiBase) {
        try {
          const response = await fetch(conversationsApiBase, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              isClientPortalApi
                ? { targetChatIdentityId: contact.id }
                : { type: "direct", targetChatIdentityId: contact.id },
            ),
          })
          const data = (await response.json()) as CreateConversationResponse & {
            error?: string
            message?: string
          }
          if (!response.ok) {
            throw new Error(data.message || data.error || "Failed to start conversation")
          }

          setConversations((prev) => {
            const without = prev.filter((conversation) => conversation.id !== data.conversation.id)
            return sortConversationsForInbox([data.conversation, ...without])
          })
          setFilter("all")
          openConversation(data.conversation.id)
          toast({
            title: data.created ? "Conversation created" : "Conversation opened",
            description: data.created
              ? `Started a direct chat with ${contact.name}.`
              : `You already have a thread with ${contact.name}.`,
          })
        } catch (error: unknown) {
          toast({
            title: "Could not start conversation",
            description: error instanceof Error ? error.message : "Please try again.",
          })
        }
        return
      }

      const existing = findExistingDirectConversation(conversations, contact.id)
      if (existing) {
        openConversation(existing.id)
        toast({
          title: "Conversation opened",
          description: `You already have a thread with ${contact.name}.`,
        })
        return
      }

      const conversation = buildDirectConversation(contact, currentIdentityId)
      setConversations((prev) => sortConversationsForInbox([conversation, ...prev]))
      setFilter("all")
      openConversation(conversation.id)
      toast({
        title: "Conversation created",
        description: `Started a direct chat with ${contact.name}.`,
      })
    },
    [conversations, conversationsApiBase, currentIdentityId, isClientPortalApi, openConversation, toast],
  )

  const handleCreateGroup = useCallback(
    async (name: string, description: string, members: ChatContact[]) => {
      if (conversationsApiBase) {
        try {
          const response = await fetch(conversationsApiBase, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "group",
              name,
              description,
              participantChatIdentityIds: members.map((member) => member.id),
            }),
          })
          const data = (await response.json()) as CreateConversationResponse & {
            error?: string
            message?: string
          }
          if (!response.ok) {
            throw new Error(data.message || data.error || "Failed to create group")
          }

          setConversations((prev) => {
            const without = prev.filter((conversation) => conversation.id !== data.conversation.id)
            return sortConversationsForInbox([data.conversation, ...without])
          })
          setFilter("GROUP")
          openConversation(data.conversation.id)
          toast({
            title: "Group created",
            description: `"${name}" is ready for messaging.`,
          })
        } catch (error: unknown) {
          toast({
            title: "Could not create group",
            description: error instanceof Error ? error.message : "Please try again.",
          })
        }
        return
      }

      const conversation = buildGroupConversation(name, members, currentIdentityId, "You", description)
      setConversations((prev) => sortConversationsForInbox([conversation, ...prev]))
      setFilter("GROUP")
      openConversation(conversation.id)
      toast({
        title: "Group created",
        description: `"${name}" is ready for messaging.`,
      })
    },
    [conversationsApiBase, currentIdentityId, openConversation, toast],
  )

  const handleSend = useCallback(
    async (body: string, replyToId?: string) => {
      if (!activeId) return

      const trimmedBody = body.trim()
      if (!trimmedBody) return

      if (messagesApiBase) {
        const clientMessageId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        const now = new Date().toISOString()
        const optimisticMessage: ChatMessage = {
          id: clientMessageId,
          conversationId: activeId,
          senderId: currentIdentityId,
          type: "TEXT",
          body: trimmedBody,
          sentAt: now,
          replyToId,
        }

        setConversations((prev) =>
          prev.map((conversation) => {
            if (conversation.id !== activeId) return conversation
            return {
              ...conversation,
              messages: [...conversation.messages, optimisticMessage],
              lastMessage: {
                body: trimmedBody,
                sentAt: now,
                senderId: currentIdentityId,
                type: "TEXT",
              },
            }
          }),
        )

        try {
          const response = await fetch(`${messagesApiBase}/${activeId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              body: trimmedBody,
              replyToMessageId: replyToId,
              clientMessageId,
            }),
          })
          const data = (await response.json()) as SendMessageResponse & {
            error?: string
            message?: string
          }
          if (!response.ok) {
            throw new Error(data.message || data.error || "Failed to send message")
          }

          setConversations((prev) =>
            sortConversationsForInbox(
              prev.map((conversation) => {
                if (conversation.id !== activeId) return conversation
                const withoutOptimistic = conversation.messages.filter(
                  (message) => message.id !== clientMessageId,
                )
                return {
                  ...conversation,
                  messages: [...withoutOptimistic, data.message],
                  lastMessage: {
                    body: data.message.body,
                    sentAt: data.message.sentAt,
                    senderId: data.message.senderId,
                    type: data.message.type,
                  },
                }
              }),
            ),
          )
        } catch (error: unknown) {
          setConversations((prev) =>
            prev.map((conversation) => {
              if (conversation.id !== activeId) return conversation
              return {
                ...conversation,
                messages: conversation.messages.filter(
                  (message) => message.id !== clientMessageId,
                ),
              }
            }),
          )
          toast({
            title: "Could not send message",
            description: error instanceof Error ? error.message : "Please try again.",
          })
        }
        return
      }

      const now = new Date().toISOString()
      const newMessage = {
        id: `local-${Date.now()}`,
        conversationId: activeId,
        senderId: currentIdentityId,
        type: "TEXT" as const,
        body: trimmedBody,
        sentAt: now,
        replyToId,
      }

      setConversations((prev) =>
        prev.map((conversation) => {
          if (conversation.id !== activeId) return conversation
          return {
            ...conversation,
            messages: [...conversation.messages, newMessage],
            lastMessage: {
              body: trimmedBody,
              sentAt: now,
              senderId: currentIdentityId,
              type: "TEXT",
            },
          }
        }),
      )
    },
    [activeId, currentIdentityId, messagesApiBase, toast],
  )

  const handlePinMessage = useCallback(
    async (messageId: string) => {
      if (!activeId) return

      if (messagesApiBase) {
        try {
          const response = await fetch(
            `${messagesApiBase}/${activeId}/messages/${messageId}/pin`,
            { method: "POST" },
          )
          const data = (await response.json()) as TogglePinResponse & {
            error?: string
            message?: string
          }
          if (!response.ok) {
            throw new Error(data.message || data.error || "Failed to pin message")
          }

          setConversations((prev) =>
            prev.map((conversation) => {
              if (conversation.id !== activeId) return conversation
              return {
                ...conversation,
                latestPinnedAt: data.latestPinnedAt,
                messages: conversation.messages.map((message) =>
                  message.id === messageId ? data.message : message,
                ),
              }
            }),
          )
        } catch (error: unknown) {
          toast({
            title: "Could not pin message",
            description: error instanceof Error ? error.message : "Please try again.",
          })
        }
        return
      }

      setConversations((prev) =>
        prev.map((conversation) => {
          if (conversation.id !== activeId) return conversation
          return {
            ...conversation,
            messages: conversation.messages.map((message) => {
              if (message.id !== messageId) return message
              const nextPinned = !message.pinned
              return {
                ...message,
                pinned: nextPinned,
                pinnedAt: nextPinned ? new Date().toISOString() : undefined,
              }
            }),
          }
        }),
      )
    },
    [activeId, messagesApiBase, toast],
  )

  const handleForwardRequest = useCallback(
    (message: ChatMessage, senderName: string) => {
      if (!activeId) return
      setForwardPayload({
        message,
        senderName,
        sourceConversationId: activeId,
      })
    },
    [activeId],
  )

  const handleForwardConfirm = useCallback(
    async (targetConversationIds: string[], caption: string) => {
      if (!forwardPayload) return

      const { message, senderName, sourceConversationId } = forwardPayload

      if (apiBase) {
        try {
          const response = await fetch(`${apiBase}/messages/forward`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sourceConversationId,
              sourceMessageId: message.id,
              targetConversationIds,
              caption,
            }),
          })
          const data = (await response.json()) as ForwardMessagesResponse & {
            error?: string
            message?: string
          }
          if (!response.ok) {
            throw new Error(data.message || data.error || "Failed to forward message")
          }

          setConversations((prev) => {
            let updated = [...prev]
            for (const result of data.results) {
              updated = updated.map((conversation) => {
                if (conversation.id !== result.conversationId) return conversation
                const hasMessage = conversation.messages.some(
                  (item) => item.id === result.message.id,
                )
                return {
                  ...conversation,
                  messages: hasMessage
                    ? conversation.messages
                    : [...conversation.messages, result.message],
                  lastMessage: {
                    body: getForwardedLastMessagePreview(result.message),
                    sentAt: result.message.sentAt,
                    senderId: result.message.senderId,
                    type: result.message.type,
                  },
                }
              })
            }
            return sortConversationsForInbox(updated)
          })

          const count = data.results.length
          toast({
            title: "Message forwarded",
            description:
              count === 1
                ? "The message was sent to the selected conversation."
                : `The message was sent to ${count} conversations.`,
          })

          if (count === 1) {
            openConversation(data.results[0].conversationId)
          }
        } catch (error: unknown) {
          toast({
            title: "Could not forward message",
            description: error instanceof Error ? error.message : "Please try again.",
          })
        }

        setForwardPayload(null)
        return
      }

      const forwardBatchId = Date.now()

      setConversations((prev) => {
        const updated = prev.map((conversation) => {
          if (!targetConversationIds.includes(conversation.id)) return conversation

          const forwardedMessage = buildForwardedMessage({
            original: message,
            forwardedFromName: senderName,
            caption,
            conversationId: conversation.id,
            senderId: currentIdentityId,
            idSuffix: `${forwardBatchId}-${conversation.id}`,
          })

          return {
            ...conversation,
            messages: [...conversation.messages, forwardedMessage],
            lastMessage: {
              body: getForwardedLastMessagePreview(forwardedMessage),
              sentAt: forwardedMessage.sentAt,
              senderId: currentIdentityId,
              type: forwardedMessage.type,
            },
          }
        })

        return sortConversationsForInbox(updated)
      })

      const count = targetConversationIds.length
      toast({
        title: "Message forwarded",
        description:
          count === 1
            ? "The message was sent to the selected conversation."
            : `The message was sent to ${count} conversations.`,
      })

      if (count === 1) {
        openConversation(targetConversationIds[0])
      }

      setForwardPayload(null)
    },
    [apiBase, currentIdentityId, forwardPayload, openConversation, toast],
  )

  const handleAddParticipants = useCallback(
    async (newContacts: ChatContact[]) => {
      if (!activeId || newContacts.length === 0) return

      const existingIds = new Set(
        activeConversation?.participants.map((participant) => participant.id) ?? [],
      )
      const contactsToAdd = newContacts.filter((contact) => !existingIds.has(contact.id))
      if (contactsToAdd.length === 0) {
        toast({
          title: "Already in conversation",
          description: "The selected people are already participants.",
        })
        return
      }

      if (messagesApiBase) {
        try {
          const response = await fetch(`${messagesApiBase}/${activeId}/participants`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              participantChatIdentityIds: contactsToAdd.map((contact) => contact.id),
            }),
          })
          const data = (await response.json()) as AddParticipantsResponse & {
            error?: string
            message?: string
          }
          if (!response.ok) {
            throw new Error(data.message || data.error || "Failed to add participants")
          }

          setConversations((prev) =>
            prev.map((conversation) =>
              conversation.id === activeId ? data.conversation : conversation,
            ),
          )
          void fetchMessages(activeId)

          toast({
            title: "Participants added",
            description:
              contactsToAdd.length === 1
                ? `${contactsToAdd[0].name} was added to the conversation.`
                : `${contactsToAdd.length} people were added to the conversation.`,
          })
        } catch (error: unknown) {
          toast({
            title: "Could not add participants",
            description: error instanceof Error ? error.message : "Please try again.",
          })
        }
        return
      }

      const systemMessage = buildParticipantsAddedSystemMessage(
        activeId,
        contactsToAdd.map((contact) => contact.name),
      )

      setConversations((prev) =>
        prev.map((conversation) => {
          if (conversation.id !== activeId) return conversation

          return {
            ...conversation,
            participants: mergeParticipants(conversation.participants, contactsToAdd),
            messages: [...conversation.messages, systemMessage],
            lastMessage: {
              body: systemMessage.body,
              sentAt: systemMessage.sentAt,
              senderId: systemMessage.senderId,
              type: systemMessage.type,
            },
          }
        }),
      )

      toast({
        title: "Participants added",
        description:
          contactsToAdd.length === 1
            ? `${contactsToAdd[0].name} was added to the conversation.`
            : `${contactsToAdd.length} people were added to the conversation.`,
      })
    },
    [activeConversation?.participants, activeId, fetchMessages, messagesApiBase, toast],
  )

  return (
    <>
      <div
        className={cn(
          "-m-6 flex h-[calc(100vh-4rem)] overflow-hidden border-t border-border bg-background",
          className,
        )}
      >
        <aside
          className={cn(
            "flex w-full flex-col border-r border-border bg-card lg:w-[340px] xl:w-[380px]",
            mobileShowThread ? "hidden lg:flex" : "flex",
          )}
        >
          <ChatInboxToolbar
            search={search}
            onSearchChange={setSearch}
            filter={filter}
            onFilterChange={setFilter}
            totalUnread={apiBase ? totalUnread : demoTotalUnread}
            onNewConversation={() => setNewConversationOpen(true)}
            onCreateGroup={allowCreateGroup ? () => setCreateGroupOpen(true) : undefined}
          />
          {inboxLoading ? (
            <div className="flex flex-1 items-center justify-center px-4 py-8 text-sm text-muted-foreground">
              Loading conversations…
            </div>
          ) : inboxError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
              <p className="text-sm text-destructive">{inboxError}</p>
              <button
                type="button"
                onClick={() => void fetchInbox()}
                className="text-sm font-medium text-[#c46f12] hover:underline"
              >
                Try again
              </button>
            </div>
          ) : (
            <ConversationList
              conversations={displayList}
              activeId={activeId}
              currentUserId={currentIdentityId}
              onSelect={handleSelect}
            />
          )}
        </aside>

        <section
          className={cn(
            "flex min-w-0 flex-1 flex-col",
            mobileShowThread ? "flex" : "hidden lg:flex",
          )}
        >
          {activeConversation ? (
            <ChatThread
              conversation={activeConversation}
              currentUserId={currentIdentityId}
              onSend={handleSend}
              onPinMessage={handlePinMessage}
              onForwardMessage={handleForwardRequest}
              onAddParticipants={() => setAddParticipantsOpen(true)}
              onBack={() => setMobileShowThread(false)}
              showBack
              enableMemberLinks={enableMemberLinks}
              messagesLoading={messagesLoadingId === activeConversation.id}
              messagesApiBase={messagesApiBase}
            />
          ) : (
            <ChatEmptyState />
          )}
        </section>
      </div>

      {newConversationOpen ? (
        <NewConversationDialog
          open
          onOpenChange={setNewConversationOpen}
          contacts={contactsApiBase ? undefined : contacts}
          contactsApiBase={contactsApiBase}
          currentUserId={currentIdentityId}
          onStart={handleNewConversation}
        />
      ) : null}

      {createGroupOpen && allowCreateGroup ? (
        <CreateGroupDialog
          open
          onOpenChange={setCreateGroupOpen}
          contacts={contactsApiBase ? undefined : contacts}
          contactsApiBase={contactsApiBase}
          currentUserId={currentIdentityId}
          onCreate={handleCreateGroup}
        />
      ) : null}

      {forwardPayload ? (
        <ForwardMessageDialog
          open
          onOpenChange={(open) => {
            if (!open) setForwardPayload(null)
          }}
          message={forwardPayload.message}
          senderName={forwardPayload.senderName}
          sourceConversationId={forwardPayload.sourceConversationId}
          conversations={apiBase ? undefined : conversations}
          inboxApiBase={apiBase}
          currentUserId={currentIdentityId}
          onForward={handleForwardConfirm}
        />
      ) : null}

      {addParticipantsOpen && activeConversation && activeConversation.type !== "DIRECT" ? (
        <AddParticipantDialog
          open
          onOpenChange={setAddParticipantsOpen}
          conversation={activeConversation}
          contacts={contactsApiBase ? undefined : contacts}
          contactsApiBase={contactsApiBase}
          onAdd={handleAddParticipants}
        />
      ) : null}
    </>
  )
}
