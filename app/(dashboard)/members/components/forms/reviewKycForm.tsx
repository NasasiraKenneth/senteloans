"use client"

import { useState } from "react"
import Image from "next/image"
import StyledSelect from "@/components/newUI/styled_select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { Clock, ExternalLink, FileText, Loader2 } from "lucide-react"
import {
  formatKycDocTypeLabel,
  type KycDocType,
  type PendingKycItem,
} from "@/lib/members/kyc-docs"
import type { KycReviewDecision } from "@/lib/members/kyc-review"

interface ReviewKycFormProps {
  memberId: string
  pending: PendingKycItem[]
  loading?: boolean
  onReviewComplete?: () => void
  onClose?: () => void
}

const REVIEW_DECISION_OPTIONS = [
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
] as const satisfies ReadonlyArray<{ value: KycReviewDecision; label: string }>

type DocPreview = {
  label: string
  url: string
}

function previewsForItem(item: PendingKycItem): DocPreview[] {
  const docType = item.docType as KycDocType
  const previews: DocPreview[] = []

  if (item.passportPhoto) {
    previews.push({ label: "Passport Photo", url: item.passportPhoto })
  }

  if (item.documentFront) {
    const label =
      docType === "passport"
        ? "Passport (Biodata Page)"
        : docType === "driving_license"
          ? "Driving License (Front)"
          : "National ID (Front)"
    previews.push({ label, url: item.documentFront })
  }

  if (item.documentBack) {
    const label = docType === "driving_license" ? "Driving License (Back)" : "National ID (Back)"
    previews.push({ label, url: item.documentBack })
  }

  if (previews.length === 0 && item.url) {
    previews.push({ label: "Submitted Document", url: item.url })
  }

  return previews
}

function DocPreviewCard({ label, url }: DocPreview) {
  const isPdf = url.toLowerCase().includes(".pdf")

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
        <span className="text-xs font-medium text-gray-700">{label}</span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-[#f08c2b] hover:underline"
        >
          Open
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="flex min-h-[140px] items-center justify-center p-3">
        {isPdf ? (
          <div className="flex flex-col items-center gap-2 text-center text-sm text-gray-500">
            <FileText className="h-8 w-8 text-gray-400" />
            <span>PDF document</span>
          </div>
        ) : (
          <Image
            src={url}
            alt={label}
            width={280}
            height={180}
            className="max-h-44 w-auto rounded-md object-contain"
            unoptimized
          />
        )}
      </div>
    </div>
  )
}

export default function ReviewKycForm({
  memberId,
  pending,
  loading = false,
  onReviewComplete,
  onClose,
}: ReviewKycFormProps) {
  const { toast } = useToast()
  const [decision, setDecision] = useState<KycReviewDecision>("approved")
  const [rejectionReason, setRejectionReason] = useState("")
  const [busy, setBusy] = useState(false)

  const item = pending[0] ?? null

  const handleSubmit = async () => {
    if (!item) return

    if (decision === "rejected" && !rejectionReason.trim()) {
      toast({
        variant: "warning",
        title: "Reason required",
        description: "Enter a rejection reason when the decision is Rejected.",
      })
      return
    }

    setBusy(true)
    try {
      const res = await fetch(`/api/institution/members/${memberId}/kyc/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendingId: item.pendingId,
          decision,
          rejectionReason: decision === "rejected" ? rejectionReason.trim() : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.message || data?.error || data?.code || "Review failed")
      }

      toast({
        variant: "success",
        title: decision === "approved" ? "KYC approved" : "KYC rejected",
        description:
          decision === "approved"
            ? `${formatKycDocTypeLabel(item.docType)} documents have been verified.`
            : "The member will be notified to resubmit with corrections.",
      })
      setRejectionReason("")
      setDecision("approved")
      onReviewComplete?.()
      onClose?.()
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Review failed",
        description: (e as Error).message || "Could not save the KYC review decision.",
      })
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!item) {
    return (
      <div className="space-y-3 p-5">
        <p className="text-sm text-gray-600">
          There are no KYC documents waiting for review. When a member submits documents, they will appear here.
        </p>
        <div className="flex justify-end border-t border-gray-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    )
  }

  const previews = previewsForItem(item)
  const submittedLabel = item.submittedAt
    ? new Date(item.submittedAt).toLocaleString()
    : "Unknown"

  return (
    <div className="max-h-[75vh] space-y-5 overflow-y-auto p-5">
      <p className="text-sm text-gray-600">
        Review the submitted documents, choose Approved or Rejected, then save your decision.
      </p>

      <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-amber-300 bg-white text-amber-800">
            {formatKycDocTypeLabel(item.docType)}
          </Badge>
          <span className="inline-flex items-center gap-1 text-xs text-amber-900/80">
            <Clock className="h-3.5 w-3.5" />
            Submitted {submittedLabel}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {previews.map((preview) => (
            <DocPreviewCard key={`${preview.label}-${preview.url}`} {...preview} />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">
          Decision <span className="text-red-500">*</span>
        </label>
        <StyledSelect
          value={decision}
          onChange={(value) => {
            if (value === "approved" || value === "rejected") {
              setDecision(value)
            }
          }}
          placeholder="Select decision"
          options={[...REVIEW_DECISION_OPTIONS]}
        />
      </div>

      {decision === "rejected" && (
        <div className="space-y-2">
          <label htmlFor="kyc-reject-reason" className="text-sm font-medium text-gray-700">
            Rejection reason <span className="text-red-500">*</span>
          </label>
          <Textarea
            id="kyc-reject-reason"
            placeholder="Explain what needs to be corrected..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={3}
            disabled={busy}
          />
          <p className="text-xs text-gray-500">This message is shown to the member when documents are rejected.</p>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          type="button"
          className="bg-[#f08c2b] hover:bg-[#e07d1f] text-white"
          onClick={() => void handleSubmit()}
          disabled={busy}
        >
          {busy ? "Saving…" : "Save Decision"}
        </Button>
      </div>
    </div>
  )
}
