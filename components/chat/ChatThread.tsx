"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ConversationHeader } from "./ConversationHeader"
import { ConversationSearchBar } from "./ConversationSearchBar"
import { PinnedMessagesBar } from "./PinnedMessagesBar"
import { MessageBubble } from "./MessageBubble"
import { ChatComposer, type ReplyPreview, type SendMessagePayload } from "./ChatComposer"
import { buildChatsQueryString } from "@/lib/chats/client/build-query"
import {
  emitTypingStart,
  emitTypingStop,
  formatTypingLabel,
  subscribeTypingUpdates,
} from "@/lib/chats/client/thread-realtime"
import { dedupeMessagesById } from "@/lib/chats/conversation-inbox"
import { formatMessageDayLabel } from "@/lib/chats/format"
import { findMessageHits } from "@/lib/chats/search-messages"
import type { ChatConversation, ChatMessage, ListMessagesResponse } from "@/lib/chats/types"

type ChatThreadProps = {
  conversation: ChatConversation
  currentUserId: string
  onSend: (payload: SendMessagePayload) => void | Promise<void>
  onPinMessage?: (messageId: string) => void
  onForwardMessage?: (message: ChatMessage, senderName: string) => void
  onAddParticipants?: () => void
  onBack?: () => void
  showBack?: boolean
  enableMemberLinks?: boolean
  messagesLoading?: boolean
  messagesApiBase?: string | null
  enableInternalNotes?: boolean
  /** Hide add-people for member support desk view */
  hideAddParticipants?: boolean
}

function groupMessagesByDay(messages: ChatMessage[]): { day: string; messages: ChatMessage[] }[] {
  const groups: { day: string; messages: ChatMessage[] }[] = []

  for (const message of messages) {
    const day = formatMessageDayLabel(message.sentAt)
    const last = groups[groups.length - 1]
    if (last?.day === day) {
      last.messages.push(message)
    } else {
      groups.push({ day, messages: [message] })
    }
  }

  return groups
}

export function ChatThread({
  conversation,
  currentUserId,
  onSend,
  onPinMessage,
  onForwardMessage,
  onAddParticipants,
  onBack,
  showBack,
  enableMemberLinks = true,
  messagesLoading = false,
  messagesApiBase = null,
  enableInternalNotes = false,
  hideAddParticipants = false,
}: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const messageRefs = useRef(new Map<string, HTMLDivElement>())
  const isGroup = conversation.type !== "DIRECT"
  const isMemberSupportDesk =
    conversation.type === "SUPPORT" &&
    conversation.participants.some((participant) => participant.id === "support-desk")
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)
  const [replyTo, setReplyTo] = useState<ReplyPreview | null>(null)
  const [jumpHighlightId, setJumpHighlightId] = useState<string | null>(null)
  const [typingLabel, setTypingLabel] = useState<string | null>(null)
  const jumpHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const useServerSearch = Boolean(messagesApiBase)

  useEffect(() => {
    if (!messagesApiBase || !conversation.id || !currentUserId) {
      setTypingLabel(null)
      return
    }

    return subscribeTypingUpdates(conversation.id, currentUserId, (typers) => {
      setTypingLabel(formatTypingLabel(typers))
    })
  }, [conversation.id, currentUserId, messagesApiBase])

  const handleTypingActivity = useCallback(() => {
    if (!messagesApiBase) return
    emitTypingStart(conversation.id)
  }, [conversation.id, messagesApiBase])

  const handleTypingStop = useCallback(() => {
    if (!messagesApiBase) return
    emitTypingStop(conversation.id)
  }, [conversation.id, messagesApiBase])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 300)
    return () => window.clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    if (!useServerSearch || !searchOpen) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }

    const query = debouncedSearchQuery.trim()
    if (!query) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }

    let cancelled = false
    setSearchLoading(true)

    const loadSearchResults = async () => {
      try {
        const response = await fetch(
          `${messagesApiBase}/${conversation.id}/messages${buildChatsQueryString({
            search: query,
            markRead: "false",
          })}`,
          { cache: "no-store" },
        )
        const data = (await response.json()) as ListMessagesResponse & { error?: string }
        if (!response.ok) {
          throw new Error(data.error || "Search failed")
        }
        if (!cancelled) setSearchResults(data.messages ?? [])
      } catch {
        if (!cancelled) setSearchResults([])
      } finally {
        if (!cancelled) setSearchLoading(false)
      }
    }

    void loadSearchResults()

    return () => {
      cancelled = true
    }
  }, [conversation.id, debouncedSearchQuery, messagesApiBase, searchOpen, useServerSearch])

  const displayMessages = useMemo(() => {
    const query = searchQuery.trim()
    const messages = dedupeMessagesById(conversation.messages)
    if (!searchOpen || !query) return messages
    if (useServerSearch) return dedupeMessagesById(searchResults)
    return messages
  }, [conversation.messages, searchOpen, searchQuery, searchResults, useServerSearch])

  const matchIds = useMemo(() => {
    const query = searchQuery.trim()
    if (!searchOpen || !query) return []
    if (useServerSearch) return searchResults.map((message) => message.id)
    return findMessageHits(conversation.messages, query)
  }, [conversation.messages, searchOpen, searchQuery, searchResults, useServerSearch])

  const dayGroups = useMemo(() => groupMessagesByDay(displayMessages), [displayMessages])

  const participantMap = useMemo(
    () => new Map(conversation.participants.map((p) => [p.id, p])),
    [conversation.participants],
  )

  const pinnedMessages = useMemo(
    () =>
      conversation.messages
        .filter((message) => message.pinned && message.type !== "SYSTEM")
        .sort((a, b) => a.sentAt.localeCompare(b.sentAt)),
    [conversation.messages],
  )

  const scrollToMessage = useCallback((messageId: string) => {
    const node = messageRefs.current.get(messageId)
    node?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [])

  useEffect(() => {
    setSearchOpen(false)
    setSearchQuery("")
    setDebouncedSearchQuery("")
    setSearchResults([])
    setActiveMatchIndex(0)
    setReplyTo(null)
    setJumpHighlightId(null)
  }, [conversation.id])

  useEffect(() => {
    return () => {
      if (jumpHighlightTimerRef.current) clearTimeout(jumpHighlightTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (matchIds.length === 0) {
      setActiveMatchIndex(0)
      return
    }
    if (activeMatchIndex >= matchIds.length) {
      setActiveMatchIndex(0)
    }
  }, [activeMatchIndex, matchIds])

  useEffect(() => {
    if (!searchOpen || matchIds.length === 0) return
    scrollToMessage(matchIds[activeMatchIndex])
  }, [activeMatchIndex, matchIds, scrollToMessage, searchOpen])

  useEffect(() => {
    if (searchOpen) return
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [conversation.messages.length, conversation.id, searchOpen])

  const goToNextMatch = () => {
    if (matchIds.length === 0) return
    setActiveMatchIndex((prev) => (prev + 1) % matchIds.length)
  }

  const goToPreviousMatch = () => {
    if (matchIds.length === 0) return
    setActiveMatchIndex((prev) => (prev - 1 + matchIds.length) % matchIds.length)
  }

  const closeSearch = () => {
    setSearchOpen(false)
    setSearchQuery("")
    setDebouncedSearchQuery("")
    setSearchResults([])
    setActiveMatchIndex(0)
  }

  const activeMatchId = matchIds[activeMatchIndex] ?? null
  const hasSearchQuery = searchQuery.trim().length > 0

  const handleReply = useCallback(
    (message: ChatMessage) => {
      const sender =
        message.senderId === currentUserId
          ? "You"
          : (participantMap.get(message.senderId)?.name ?? "Unknown")

      setReplyTo({
        messageId: message.id,
        senderName: sender,
        body: message.attachmentName ?? message.body,
        type: message.type,
      })
    },
    [currentUserId, participantMap],
  )

  const handleForward = useCallback(
    (message: ChatMessage) => {
      const sender =
        message.senderId === currentUserId
          ? "You"
          : (participantMap.get(message.senderId)?.name ?? "Unknown")

      onForwardMessage?.(message, sender)
    },
    [currentUserId, onForwardMessage, participantMap],
  )

  const handlePin = useCallback(
    (message: ChatMessage) => {
      onPinMessage?.(message.id)
    },
    [onPinMessage],
  )

  const handlePinnedJump = useCallback(
    (messageId: string) => {
      scrollToMessage(messageId)
      setJumpHighlightId(messageId)
      if (jumpHighlightTimerRef.current) clearTimeout(jumpHighlightTimerRef.current)
      jumpHighlightTimerRef.current = setTimeout(() => {
        setJumpHighlightId(null)
        jumpHighlightTimerRef.current = null
      }, 2000)
    },
    [scrollToMessage],
  )

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,hsl(var(--muted)/0.15)_0%,transparent_120px)]">
      <ConversationHeader
        conversation={conversation}
        currentUserId={currentUserId}
        onBack={onBack}
        showBack={showBack}
        enableMemberLinks={enableMemberLinks}
        searchActive={searchOpen}
        onSearchMessages={() => setSearchOpen(true)}
        onAddParticipants={
          hideAddParticipants || conversation.type === "DIRECT"
            ? undefined
            : onAddParticipants
        }
      />

      {searchOpen ? (
        <ConversationSearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          matchCount={matchIds.length}
          activeMatchIndex={activeMatchIndex}
          onPrevious={goToPreviousMatch}
          onNext={goToNextMatch}
          onClose={closeSearch}
          scopeLabel="Search in this chat..."
        />
      ) : null}

      <PinnedMessagesBar
        messages={pinnedMessages}
        participants={conversation.participants}
        currentUserId={currentUserId}
        isGroup={isGroup}
        onJump={handlePinnedJump}
      />

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messagesLoading && conversation.messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading messages…</p>
        ) : null}

        {searchLoading && hasSearchQuery ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Searching messages…</p>
        ) : null}

        {dayGroups.map((group) => {
          const visibleMessages = hasSearchQuery
            ? group.messages.filter((message) => matchIds.includes(message.id))
            : group.messages

          if (visibleMessages.length === 0) return null

          return (
            <div key={group.day}>
              <div className="mb-4 flex justify-center">
                <span className="rounded-full bg-muted/80 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                  {group.day}
                </span>
              </div>
              <div className="space-y-3">
                {visibleMessages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    sender={
                      participantMap.get(message.senderId) ??
                      (isMemberSupportDesk ? conversation.participants[0] : undefined)
                    }
                    isOwn={message.senderId === currentUserId}
                    showSender={isGroup && !isMemberSupportDesk}
                    enableMemberLinks={enableMemberLinks}
                    highlightQuery={hasSearchQuery ? searchQuery : ""}
                    isActiveSearchMatch={message.id === activeMatchId}
                    isJumpHighlight={message.id === jumpHighlightId}
                    messageRef={(node) => {
                      if (node) messageRefs.current.set(message.id, node)
                      else messageRefs.current.delete(message.id)
                    }}
                    onReply={handleReply}
                    onForward={handleForward}
                    onPin={handlePin}
                  />
                ))}
              </div>
            </div>
          )
        })}

        {hasSearchQuery && !searchLoading && matchIds.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No messages in this chat match &ldquo;{searchQuery.trim()}&rdquo;.
          </p>
        ) : null}

        <div ref={bottomRef} />
      </div>

      {typingLabel ? (
        <div className="px-4 pb-1">
          <p className="text-xs italic text-muted-foreground">{typingLabel}</p>
        </div>
      ) : null}

      <ChatComposer
        onSend={onSend}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        enableAttachments={Boolean(messagesApiBase)}
        conversationId={conversation.id}
        showDemoBanner={!messagesApiBase}
        enableInternalNotes={enableInternalNotes}
        onTypingActivity={handleTypingActivity}
        onTypingStop={handleTypingStop}
      />
    </div>
  )
}
