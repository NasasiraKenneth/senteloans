import type { ChatConversation } from "./types"

/** Dummy staff identity used for outgoing messages in the institution inbox demo. */
export const DEMO_STAFF_USER_ID = "staff-001"

/** Dummy member identity for the client portal inbox demo. */
export const DEMO_CLIENT_USER_ID = "member-042"

/** Stable reference instant so demo timestamps match on server and client. */
const DEMO_REFERENCE_MS = Date.parse("2026-07-09T12:00:00.000Z")

const hoursAgo = (hours: number) =>
  new Date(DEMO_REFERENCE_MS - hours * 60 * 60 * 1000).toISOString()

const daysAgo = (days: number, hour = 10) => {
  const d = new Date(DEMO_REFERENCE_MS)
  d.setUTCDate(d.getUTCDate() - days)
  d.setUTCHours(hour, 15, 0, 0)
  return d.toISOString()
}

const readAfter = (sentAt: string, minutes = 4) => {
  const d = new Date(sentAt)
  d.setMinutes(d.getMinutes() + minutes)
  return d.toISOString()
}

export const STAFF_DUMMY_CONVERSATIONS: ChatConversation[] = [
  {
    id: "conv-001",
    type: "DIRECT",
    title: "Grace Nakato",
    unreadCount: 2,
    participants: [
      { id: DEMO_STAFF_USER_ID, name: "You", role: "staff", isOnline: true },
      {
        id: "member-042",
        name: "Grace Nakato",
        role: "member",
        memberId: "member-042",
        subtitle: "M-1042 · Main Branch",
        isOnline: true,
      },
    ],
    lastMessage: {
      body: "Can I get a statement for my savings account?",
      sentAt: hoursAgo(0.4),
      senderId: "member-042",
      type: "TEXT",
    },
    messages: [
      {
        id: "m-001",
        conversationId: "conv-001",
        senderId: "member-042",
        type: "TEXT",
        body: "Good afternoon. I applied for a top-up last week — any update?",
        sentAt: daysAgo(2, 14),
      },
      {
        id: "m-002",
        conversationId: "conv-001",
        senderId: DEMO_STAFF_USER_ID,
        type: "TEXT",
        body: "Hi Grace, your application is with the credit committee. We expect feedback by Friday. Please ensure your guarantor forms are complete and that your last three months of savings contributions are reflected on your account before the review meeting.",
        sentAt: daysAgo(2, 15),
        readAt: readAfter(daysAgo(2, 15)),
        pinned: true,
        pinnedAt: daysAgo(1, 9),
      },
      {
        id: "m-003",
        conversationId: "conv-001",
        senderId: "member-042",
        type: "TEXT",
        body: "Thank you. Also, can I get a statement for my savings account?",
        sentAt: hoursAgo(0.4),
      },
    ],
  },
  {
    id: "conv-002",
    type: "LOAN",
    title: "Loan #LN-2024-0891",
    unreadCount: 1,
    reference: { type: "LOAN", label: "LN-2024-0891", id: "loan-891" },
    participants: [
      { id: DEMO_STAFF_USER_ID, name: "You", role: "staff" },
      { id: "member-118", name: "James Okello", role: "member", memberId: "member-118", subtitle: "Borrower" },
      { id: "staff-014", name: "Sarah Mirembe", role: "staff", subtitle: "Loan Officer" },
    ],
    lastMessage: {
      body: "Guarantor form uploaded.",
      sentAt: hoursAgo(1.2),
      senderId: "member-118",
      type: "FILE",
    },
    messages: [
      {
        id: "m-010",
        conversationId: "conv-002",
        senderId: "system",
        type: "SYSTEM",
        body: "Loan thread created for application LN-2024-0891",
        sentAt: daysAgo(5, 9),
      },
      {
        id: "m-011",
        conversationId: "conv-002",
        senderId: "staff-014",
        type: "TEXT",
        body: "James, please upload the signed guarantor form before disbursement.",
        sentAt: daysAgo(1, 11),
      },
      {
        id: "m-012",
        conversationId: "conv-002",
        senderId: "member-118",
        type: "FILE",
        body: "guarantor_form_okello.pdf",
        attachmentName: "guarantor_form_okello.pdf",
        sentAt: hoursAgo(1.2),
      },
    ],
  },
  {
    id: "conv-003",
    type: "GROUP",
    title: "Credit Committee — July",
    unreadCount: 0,
    participants: [
      { id: DEMO_STAFF_USER_ID, name: "You", role: "staff" },
      { id: "staff-007", name: "David Kato", role: "staff", isOnline: true },
      { id: "staff-014", name: "Sarah Mirembe", role: "staff" },
      { id: "staff-022", name: "Amina Hassan", role: "staff" },
    ],
    lastMessage: {
      body: "Agenda shared for tomorrow's session.",
      sentAt: hoursAgo(3),
      senderId: DEMO_STAFF_USER_ID,
      type: "TEXT",
    },
    messages: [
      {
        id: "m-020",
        conversationId: "conv-003",
        senderId: "staff-007",
        type: "TEXT",
        body: "Team, we have 12 applications on the docket this week.",
        sentAt: daysAgo(1, 8),
      },
      {
        id: "m-021",
        conversationId: "conv-003",
        senderId: DEMO_STAFF_USER_ID,
        type: "TEXT",
        body: "Agenda shared for tomorrow's session. Please review the high-value cases first.",
        sentAt: hoursAgo(3),
        readAt: readAfter(hoursAgo(3)),
      },
    ],
  },
  {
    id: "conv-004",
    type: "SUPPORT",
    title: "Member Help Desk",
    unreadCount: 4,
    participants: [
      { id: DEMO_STAFF_USER_ID, name: "You", role: "staff" },
      { id: "member-205", name: "Peter Lubega", role: "member", memberId: "member-205" },
      { id: "member-311", name: "Faith Nambi", role: "member", memberId: "member-311", isOnline: true },
    ],
    lastMessage: {
      body: "I can't log in to the client portal.",
      sentAt: hoursAgo(0.15),
      senderId: "member-311",
      type: "TEXT",
    },
    messages: [
      {
        id: "m-030",
        conversationId: "conv-004",
        senderId: "member-205",
        type: "TEXT",
        body: "How do I reset my PIN?",
        sentAt: hoursAgo(5),
      },
      {
        id: "m-031",
        conversationId: "conv-004",
        senderId: DEMO_STAFF_USER_ID,
        type: "TEXT",
        body: "Peter, use the Forgot PIN link on the login page or visit your branch with ID.",
        sentAt: hoursAgo(4.5),
        readAt: readAfter(hoursAgo(4.5)),
      },
      {
        id: "m-032",
        conversationId: "conv-004",
        senderId: "member-311",
        type: "TEXT",
        body: "I can't log in to the client portal.",
        sentAt: hoursAgo(0.15),
      },
    ],
  },
  {
    id: "conv-005",
    type: "DIRECT",
    title: "Robert Ssemwogerere",
    unreadCount: 0,
    participants: [
      { id: DEMO_STAFF_USER_ID, name: "You", role: "staff" },
      {
        id: "member-077",
        name: "Robert Ssemwogerere",
        role: "member",
        memberId: "member-077",
        subtitle: "M-1077",
      },
    ],
    lastMessage: {
      body: "Payment received. Thank you!",
      sentAt: daysAgo(1, 16),
      senderId: DEMO_STAFF_USER_ID,
      type: "TEXT",
    },
    messages: [
      {
        id: "m-040",
        conversationId: "conv-005",
        senderId: "member-077",
        type: "TEXT",
        body: "I've made my monthly repayment via mobile money.",
        sentAt: daysAgo(1, 15),
      },
      {
        id: "m-041",
        conversationId: "conv-005",
        senderId: DEMO_STAFF_USER_ID,
        type: "TEXT",
        body: "Payment received. Thank you!",
        sentAt: daysAgo(1, 16),
        readAt: readAfter(daysAgo(1, 16)),
      },
    ],
  },
  {
    id: "conv-006",
    type: "BRANCH",
    title: "Nakawa Branch Ops",
    unreadCount: 0,
    reference: { type: "BRANCH", label: "Nakawa", id: "branch-nakawa" },
    participants: [
      { id: DEMO_STAFF_USER_ID, name: "You", role: "staff" },
      { id: "staff-031", name: "Branch Manager", role: "staff" },
      { id: "staff-032", name: "Teller Team", role: "staff" },
    ],
    lastMessage: {
      body: "Cash reconciliation complete for today.",
      sentAt: daysAgo(0, 18),
      senderId: "staff-031",
      type: "TEXT",
    },
    messages: [
      {
        id: "m-050",
        conversationId: "conv-006",
        senderId: "staff-031",
        type: "TEXT",
        body: "Cash reconciliation complete for today.",
        sentAt: daysAgo(0, 18),
      },
    ],
  },
  {
    id: "conv-007",
    type: "COMMITTEE",
    title: "Board — Q3 Planning",
    unreadCount: 0,
    participants: [
      { id: DEMO_STAFF_USER_ID, name: "You", role: "staff" },
      { id: "staff-001", name: "CEO Office", role: "staff" },
      { id: "staff-002", name: "Finance Lead", role: "staff" },
    ],
    lastMessage: {
      body: "Draft minutes attached.",
      sentAt: daysAgo(3, 12),
      senderId: "staff-002",
      type: "FILE",
    },
    messages: [
      {
        id: "m-060",
        conversationId: "conv-007",
        senderId: "staff-002",
        type: "FILE",
        body: "Q3_board_minutes_draft.pdf",
        attachmentName: "Q3_board_minutes_draft.pdf",
        sentAt: daysAgo(3, 12),
      },
    ],
  },
  {
    id: "conv-008",
    type: "DIRECT",
    title: "Aisha Namukasa",
    unreadCount: 0,
    participants: [
      { id: DEMO_STAFF_USER_ID, name: "You", role: "staff" },
      { id: "member-156", name: "Aisha Namukasa", role: "member", memberId: "member-156", subtitle: "M-1156" },
    ],
    lastMessage: {
      body: "Welcome to the SACCO! Let us know if you need help with shares.",
      sentAt: daysAgo(7, 10),
      senderId: DEMO_STAFF_USER_ID,
      type: "TEXT",
    },
    messages: [
      {
        id: "m-070",
        conversationId: "conv-008",
        senderId: DEMO_STAFF_USER_ID,
        type: "TEXT",
        body: "Welcome to the SACCO! Let us know if you need help with shares.",
        sentAt: daysAgo(7, 10),
        readAt: readAfter(daysAgo(7, 10)),
      },
    ],
  },
]

export const CLIENT_DUMMY_CONVERSATIONS: ChatConversation[] = [
  {
    id: "client-conv-001",
    type: "DIRECT",
    title: "Loan Officer — Sarah Mirembe",
    unreadCount: 1,
    participants: [
      { id: DEMO_CLIENT_USER_ID, name: "You", role: "member" },
      {
        id: "staff-014",
        name: "Sarah Mirembe",
        role: "staff",
        subtitle: "Loan Officer",
        isOnline: true,
      },
    ],
    lastMessage: {
      body: "Your top-up is scheduled for review on Friday.",
      sentAt: hoursAgo(2),
      senderId: "staff-014",
      type: "TEXT",
    },
    messages: [
      {
        id: "cm-001",
        conversationId: "client-conv-001",
        senderId: DEMO_CLIENT_USER_ID,
        type: "TEXT",
        body: "Hello, I'd like an update on my loan top-up application.",
        sentAt: daysAgo(1, 9),
        readAt: readAfter(daysAgo(1, 9)),
      },
      {
        id: "cm-002",
        conversationId: "client-conv-001",
        senderId: "staff-014",
        type: "TEXT",
        body: "Your top-up is scheduled for review on Friday. I'll notify you once a decision is made.",
        sentAt: hoursAgo(2),
      },
    ],
  },
  {
    id: "client-conv-002",
    type: "SUPPORT",
    title: "Member Support",
    unreadCount: 0,
    participants: [
      { id: DEMO_CLIENT_USER_ID, name: "You", role: "member" },
      { id: DEMO_STAFF_USER_ID, name: "Help Desk", role: "staff" },
    ],
    lastMessage: {
      body: "Your PIN reset request has been approved.",
      sentAt: daysAgo(4, 14),
      senderId: DEMO_STAFF_USER_ID,
      type: "TEXT",
    },
    messages: [
      {
        id: "cm-010",
        conversationId: "client-conv-002",
        senderId: DEMO_CLIENT_USER_ID,
        type: "TEXT",
        body: "I forgot my client portal PIN.",
        sentAt: daysAgo(5, 10),
        readAt: readAfter(daysAgo(5, 10)),
      },
      {
        id: "cm-011",
        conversationId: "client-conv-002",
        senderId: DEMO_STAFF_USER_ID,
        type: "TEXT",
        body: "Your PIN reset request has been approved. Check your registered phone for the temporary PIN.",
        sentAt: daysAgo(4, 14),
      },
    ],
  },
  {
    id: "client-conv-003",
    type: "LOAN",
    title: "Loan #LN-2024-0612",
    unreadCount: 0,
    reference: { type: "LOAN", label: "LN-2024-0612", id: "loan-612" },
    participants: [
      { id: DEMO_CLIENT_USER_ID, name: "You", role: "member" },
      { id: "staff-014", name: "Sarah Mirembe", role: "staff" },
    ],
    lastMessage: {
      body: "Next repayment is due on 15 Jul.",
      sentAt: daysAgo(2, 11),
      senderId: "staff-014",
      type: "TEXT",
    },
    messages: [
      {
        id: "cm-020",
        conversationId: "client-conv-003",
        senderId: "system",
        type: "SYSTEM",
        body: "Loan thread linked to LN-2024-0612",
        sentAt: daysAgo(30, 9),
      },
      {
        id: "cm-021",
        conversationId: "client-conv-003",
        senderId: "staff-014",
        type: "TEXT",
        body: "Next repayment is due on 15 Jul. You can pay via mobile money or at any branch.",
        sentAt: daysAgo(2, 11),
      },
    ],
  },
]
