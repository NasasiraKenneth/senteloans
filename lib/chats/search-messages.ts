import type { ChatMessage } from "./types"

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase()
}

export function messageMatchesQuery(message: ChatMessage, query: string): boolean {
  const q = normalizeSearchQuery(query)
  if (!q || message.type === "SYSTEM") return false

  const haystack = [message.body, message.attachmentName].filter(Boolean).join(" ").toLowerCase()
  return haystack.includes(q)
}

export function findMessageHits(messages: ChatMessage[], query: string): string[] {
  const q = normalizeSearchQuery(query)
  if (!q) return []

  return messages.filter((message) => messageMatchesQuery(message, q)).map((message) => message.id)
}

export function splitHighlightedText(
  text: string,
  query: string,
): { text: string; highlight: boolean }[] {
  const q = normalizeSearchQuery(query)
  if (!q) return [{ text, highlight: false }]

  const lowerText = text.toLowerCase()
  const parts: { text: string; highlight: boolean }[] = []
  let start = 0
  let index = lowerText.indexOf(q, start)

  while (index !== -1) {
    if (index > start) {
      parts.push({ text: text.slice(start, index), highlight: false })
    }
    parts.push({ text: text.slice(index, index + q.length), highlight: true })
    start = index + q.length
    index = lowerText.indexOf(q, start)
  }

  if (start < text.length) {
    parts.push({ text: text.slice(start), highlight: false })
  }

  return parts.length > 0 ? parts : [{ text, highlight: false }]
}
