"use client"

import { ChatsShell } from "@/components/chat/ChatsShell"

export default function ClientPortalMessagesPage() {
  return (
    <ChatsShell
      apiBase="/api/client/chats"
      className="-m-4 h-[calc(100vh-5rem)] sm:-m-6"
      enableMemberLinks={false}
      allowCreateGroup={false}
    />
  )
}
