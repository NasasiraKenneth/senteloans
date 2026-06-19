export function getInstitutionInitials(name: string): string {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return "SL"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function isUsableInstitutionLogo(logo: unknown): logo is string {
  if (typeof logo !== "string") return false
  const trimmed = logo.trim()
  if (!trimmed || trimmed === "false" || trimmed === "null") return false
  return true
}
