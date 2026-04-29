export function makePrefixedNumber(prefix: string): string {
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `${prefix}-${ts}-${rand}`
}

