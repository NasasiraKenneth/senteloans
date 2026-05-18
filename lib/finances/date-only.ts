/** Normalize DB / API date values to `YYYY-MM-DD` for date inputs. */
export function toDateOnlyString(value: unknown): string {
  if (value == null) return ""
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ""
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, "0")
    const d = String(value.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
  }
  const raw = String(value).trim()
  if (!raw) return ""
  const isoPrefix = raw.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoPrefix)) return isoPrefix
  if (raw.includes("T")) {
    const s = raw.split("T")[0]
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ""
  const y = parsed.getFullYear()
  const m = String(parsed.getMonth() + 1).padStart(2, "0")
  const d = String(parsed.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}
