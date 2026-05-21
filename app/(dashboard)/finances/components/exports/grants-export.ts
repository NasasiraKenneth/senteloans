export type GrantsExportFormat = "excel" | "pdf"

function buildExportQuery(
  activeFilters: Record<string, string>,
  format: GrantsExportFormat,
): URLSearchParams {
  const q = new URLSearchParams()
  Object.entries(activeFilters).forEach(([k, v]) => {
    if (v === undefined || v === null) return
    const value = String(v).trim()
    if (!value) return
    q.set(k, value)
  })
  q.set("format", format)
  return q
}

export async function downloadGrantsExport(
  activeFilters: Record<string, string>,
  format: GrantsExportFormat,
): Promise<void> {
  const q = buildExportQuery(activeFilters, format)
  const res = await fetch(
    `/api/institution/finances/grants/export?${q.toString()}`,
    { method: "GET" },
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error || `Failed to download ${format.toUpperCase()}`)
  }
  const blob = await res.blob()
  const disposition = res.headers.get("content-disposition") || ""
  const match = disposition.match(/filename="?([^"]+)"?/)
  const fallback = `grants-report-${new Date()
    .toISOString()
    .slice(0, 10)}.${format === "excel" ? "xlsx" : "pdf"}`
  const filename = match?.[1] || fallback
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
