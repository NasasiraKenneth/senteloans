export type KeysetCursor = {
  t: string // timestamp ISO
  id: string
}

export function encodeCursor(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")
}

export function decodeCursor(raw: string | null): KeysetCursor | null {
  if (!raw) return null
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8")
    const parsed = JSON.parse(json) as Record<string, unknown>
    const t = String(parsed.t || "").trim()
    const id = String(parsed.id || "").trim()
    if (!t || !id) return null
    return { t, id }
  } catch {
    return null
  }
}

