"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { CheckCircle2, Circle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  buildOnboardingChecklistItems,
  type OnboardingChecklistMember,
} from "@/lib/members/onboarding-checklist"

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
}

const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] as const } },
}

type OnboardingChecklistProps = {
  member: OnboardingChecklistMember
  onOpenDocuments?: () => void
}

export default function OnboardingChecklist({ member, onOpenDocuments }: OnboardingChecklistProps) {
  const items = buildOnboardingChecklistItems(member)
  const doneCount = items.filter((i) => i.done).length
  if (doneCount === items.length) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Onboarding Checklist</h2>
          <p className="text-sm text-muted-foreground">Complete these steps to finish setup</p>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
          {doneCount} of {items.length} done
        </span>
      </div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="divide-y divide-border overflow-hidden rounded-xl border border-border"
      >
        {items.map((item) => (
          <motion.div key={item.key} variants={staggerItem} className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              {item.done ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
              )}
              <div>
                <p className={cn("text-sm font-medium", item.done && "text-muted-foreground line-through")}>
                  {item.label}
                </p>
                <p className="text-xs text-muted-foreground">{item.hint}</p>
              </div>
            </div>
            {!item.done && (
              item.action === "documents-tab" ? (
                <Button size="sm" variant="outline" type="button" onClick={onOpenDocuments}>
                  Complete
                </Button>
              ) : item.href ? (
                <Link href={item.href}>
                  <Button size="sm" variant="outline">Complete</Button>
                </Link>
              ) : null
            )}
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}
