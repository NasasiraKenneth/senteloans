export function buildChatsQueryString(
  params: Record<string, string | undefined | null | false>,
): string {
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.trim()) {
      searchParams.set(key, value.trim())
    }
  }

  const query = searchParams.toString()
  return query ? `?${query}` : ""
}
