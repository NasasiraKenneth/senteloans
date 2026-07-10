export const CHAT_PERMISSIONS = {
  viewChats: "view_chats",
  sendMessages: "send_chat_messages",
  createGroup: "create_chat_group",
  createDomainThread: "create_chat_domain_thread",
  manageParticipants: "manage_chat_participants",
  manageSupportChatParticipants: "manage_support_chat_participants",
} as const

export type ChatPermission = (typeof CHAT_PERMISSIONS)[keyof typeof CHAT_PERMISSIONS]
