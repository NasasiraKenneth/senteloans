"use client"

import { ChatsShell } from "@/components/chat/ChatsShell"

export default function ChatsPage() {
  return <ChatsShell apiBase="/api/institution/chats" />
}
