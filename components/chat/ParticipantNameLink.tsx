"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { getMemberProfileHref } from "@/lib/chats/participant-links"
import type { ChatParticipant } from "@/lib/chats/types"

type ParticipantNameLinkProps = {
  participant?: ChatParticipant | null
  className?: string
  children: ReactNode
  enableMemberLinks?: boolean
}

export function ParticipantNameLink({
  participant,
  className,
  children,
  enableMemberLinks = true,
}: ParticipantNameLinkProps) {
  const href = enableMemberLinks ? getMemberProfileHref(participant) : null

  if (!href) {
    return <span className={className}>{children}</span>
  }

  return (
    <Link
      href={href}
      className={cn(
        "rounded-sm transition-colors hover:text-[#c46f12] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f08c2b]/40",
        className,
      )}
    >
      {children}
    </Link>
  )
}
