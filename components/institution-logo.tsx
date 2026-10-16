import { cn } from "@/lib/utils"
import { getInstitutionInitials, isUsableInstitutionLogo } from "@/lib/institution-brand"

type InstitutionLogoProps = {
  name?: string
  logo?: string | null
  className?: string
  imageClassName?: string
  initialsClassName?: string
  /** "brand" = theme palette gradient fallback; "theme" = uses CSS primary tokens */
  tone?: "brand" | "theme"
}

export function InstitutionLogo({
  name = "Sente Loan",
  logo,
  className,
  imageClassName,
  initialsClassName,
  tone = "brand",
}: InstitutionLogoProps) {
  const label = name.trim() || "Institution"

  if (isUsableInstitutionLogo(logo)) {
    return (
      <div className={cn("overflow-hidden", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo.trim()}
          alt={`${label} logo`}
          className={cn("h-full w-full object-contain", imageClassName)}
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center font-semibold",
        tone === "theme"
          ? "border border-primary/20 bg-primary/10 text-primary"
          : "border border-brand/25 text-brand",
        className,
      )}
      style={
        tone === "theme"
          ? undefined
          : { background: "linear-gradient(135deg, rgba(var(--ui-p-rgb, 240, 140, 43), 0.18) 0%, rgba(var(--ui-p-rgb, 240, 140, 43), 0.05) 100%)" }
      }
      aria-label={label}
    >
      <span className={cn("leading-none", initialsClassName)}>{getInstitutionInitials(label)}</span>
    </div>
  )
}
