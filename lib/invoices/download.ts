export function resolveDownloadFileName(
  contentDisposition: string | null,
  fallbackName: string,
): string {
  const raw = contentDisposition || ""
  const match =
    raw.match(/filename\*=UTF-8''([^;]+)/i) ||
    raw.match(/filename="([^"]+)"/i) ||
    raw.match(/filename=([^;]+)/i)

  const parsed = decodeURIComponent((match?.[1] || "").trim().replace(/^["']|["']$/g, ""))
  return parsed || fallbackName
}

export async function downloadInvoicePdfFile(params: {
  invoiceId: string
  fallbackName: string
}): Promise<string> {
  const { invoiceId, fallbackName } = params
  const url = `/api/institution/invoices/${invoiceId}/pdf?download=1`
  const res = await fetch(url, { method: "GET" })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error || "Failed to generate invoice PDF")
  }

  const fileName = resolveDownloadFileName(res.headers.get("content-disposition"), fallbackName)
  const blob = await res.blob()
  const href = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = href
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(href)

  return fileName
}

export async function downloadClientInvoicePdfFile(params: {
  invoiceId: string
  fallbackName: string
}): Promise<string> {
  const { invoiceId, fallbackName } = params
  const url = `/api/client/invoices/${encodeURIComponent(invoiceId)}/pdf?download=1`
  const res = await fetch(url, { method: "GET" })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error || "Failed to generate invoice PDF")
  }

  const fileName = resolveDownloadFileName(res.headers.get("content-disposition"), fallbackName)
  const blob = await res.blob()
  const href = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = href
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(href)

  return fileName
}
