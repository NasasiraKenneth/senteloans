type ApiLogLevel = "info" | "warn" | "error"

type ApiLogMeta = Record<string, unknown>

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return JSON.stringify({ note: "unserializable_meta" })
  }
}

export function apiLog(level: ApiLogLevel, event: string, meta: ApiLogMeta = {}) {
  const payload = {
    ts: new Date().toISOString(),
    event,
    ...meta,
  }
  const line = `[api] ${safeStringify(payload)}`
  if (level === "error") {
    console.error(line)
    return
  }
  if (level === "warn") {
    console.warn(line)
    return
  }
  console.info(line)
}

export function getApiPath(req: Request): string {
  try {
    return new URL(req.url).pathname
  } catch {
    return req.url
  }
}
