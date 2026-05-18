"use client"

import { ReeveModal } from "@/components/modals/ReeveModal"
import { Button } from "@/components/ui/button"

type FinancesPlaceholderPanelProps = {
  isOpen: boolean
  onClose: () => void
  title: string
  description: string
  fields: string[]
}

export default function FinancesPlaceholderPanel({
  isOpen,
  onClose,
  title,
  description,
  fields,
}: FinancesPlaceholderPanelProps) {
  return (
    <ReeveModal isOpen={isOpen} onClose={onClose} title={title} className="z-[1000] w-[28rem]">
        <div className="space-y-4 p-4">
          <p className="text-sm text-muted-foreground">{description}</p>
          <div className="rounded-lg border border-dashed border-[#f08c2b]/40 bg-[#f08c2b]/5 p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#a85a16]">Planned fields</p>
            <ul className="list-inside list-disc space-y-1 text-sm text-foreground">
              {fields.map((field) => (
                <li key={field}>{field}</li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">API and form wiring will be added in a follow-up.</p>
          <div className="flex justify-end gap-2 border-t pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button type="button" disabled className="bg-[#f08c2b] text-white opacity-60">
              Save (soon)
            </Button>
          </div>
        </div>
    </ReeveModal>
  )
}
