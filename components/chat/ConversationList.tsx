"use client"

import { ConversationListItem } from "./ConversationListItem"
import { splitInboxSections } from "@/lib/chats/conversation-inbox"
import type { ChatConversation } from "@/lib/chats/types"

type ConversationListProps = {
  conversations: ChatConversation[]
  activeId: string | null
  currentUserId: string
  onSelect: (id: string) => void
  typingByConversation?: Record<string, string>
}

export function ConversationList({
  conversations,
  activeId,
  currentUserId,
  onSelect,
  typingByConversation = {},
}: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-8 text-center text-sm text-muted-foreground">
        No conversations match your search.
      </div>
    )
  }

  const { pinned, recent } = splitInboxSections(conversations)

  return (
    <div className="flex-1 overflow-y-auto">
      {pinned.length > 0 ? (
        <div>
          <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Pinned
          </p>
          {pinned.map((conversation) => (
            <ConversationListItem
              key={conversation.id}
              conversation={conversation}
              isActive={conversation.id === activeId}
              currentUserId={currentUserId}
              onSelect={onSelect}
              typingLabel={typingByConversation[conversation.id]}
            />
          ))}
        </div>
      ) : null}

      {recent.length > 0 ? (
        <div>
          {pinned.length > 0 ? (
            <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Recent
            </p>
          ) : null}
          {recent.map((conversation) => (
            <ConversationListItem
              key={conversation.id}
              conversation={conversation}
              isActive={conversation.id === activeId}
              currentUserId={currentUserId}
              onSelect={onSelect}
              typingLabel={typingByConversation[conversation.id]}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
