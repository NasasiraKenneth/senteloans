import { cn } from "@/lib/utils"
import { getInstitutionInitials, isUsableInstitutionLogo } from "@/lib/institution-brand"

type InstitutionLogoProps = {
  name?: string
  logo?: string | null
  className?: string
  imageClassName?: string
  initialsClassName?: string
}

export function InstitutionLogo({
  name = "Sente Loan",
  logo,
  className,
  imageClassName,
  initialsClassName,
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
        "flex items-center justify-center border border-[#f08c2b]/15 font-semibold text-[#f08c2b]",
        className,
      )}
      style={{
        background: "linear-gradient(135deg, rgba(240,140,43,0.15) 0%, rgba(240,140,43,0.05) 100%)",
      }}
      aria-label={label}
    >
      <span className={cn("leading-none", initialsClassName)}>{getInstitutionInitials(label)}</span>
    </div>
  )
}
