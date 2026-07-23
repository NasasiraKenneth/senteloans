"use client"

import { useMemo, useRef, useState } from "react"
import { upload } from "@vercel/blob/client"
import {
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  ImageIcon,
  Loader2,
  Upload,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ProfileCard, ProfileField } from "@/components/client-portal-profile-ui"
import {
  CLIENT_KYC_DOC_TYPE_OPTIONS,
  buildClientKycFieldState,
  clientKycPreviewUrl,
  computeClientKycProgress,
  getClientKycUploadSlots,
  type ClientKycDocState,
  type ClientKycUploadSlot,
} from "@/lib/client-portal-kyc"
import type { KycDocType, KycUploadField, MemberKycDocRow } from "@/lib/members/kyc-docs"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/toast"

function isImageUrl(url: string) {
  return /\.(png|jpe?g|webp|gif|bmp|svg)(\?|$)/i.test(url)
}

function recordStatusLabel(row: MemberKycDocRow | null): string {
  if (!row) return "Not started"
  if (row.status === "verified") return "Verified"
  if (row.status === "pending_review") return "Pending review"
  if (row.status === "rejected") return "Rejected"
  return "In progress"
}

function fieldStatusBadge(state: ClientKycDocState) {
  if (state.status === "verified") {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-200 bg-background/90 text-emerald-700">
        <CheckCircle className="h-3 w-3" />
        Verified
      </Badge>
    )
  }
  if (state.status === "pending") {
    return (
      <Badge variant="outline" className="gap-1 bg-background/90">
        <Clock className="h-3 w-3" />
        Pending
      </Badge>
    )
  }
  if (state.status === "rejected") {
    return (
      <Badge variant="destructive" className="gap-1 bg-background/90">
        <AlertCircle className="h-3 w-3" />
        Rejected
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="bg-background/90 font-normal">
      Missing
    </Badge>
  )
}

type KycDocumentViewCardProps = {
  slot: ClientKycUploadSlot
  state: ClientKycDocState
  uploading: boolean
  isEditing: boolean
  onUpload: (file: File) => Promise<void>
}

function KycDocumentViewCard({
  slot,
  state,
  uploading,
  isEditing,
  onUpload,
}: KycDocumentViewCardProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const previewUrl = clientKycPreviewUrl(state)
  const isImage = previewUrl ? isImageUrl(previewUrl) : false

  const pickFile = () => inputRef.current?.click()
  const showUpload = !previewUrl || isEditing

  const handleFile = async (file: File) => {
    await onUpload(file)
  }

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <div className="relative aspect-[4/3] bg-muted/20">
        {previewUrl ? (
          isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt={slot.label} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <FileText className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">PDF document</p>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#f08c2b] hover:underline"
              >
                View file
              </a>
            </div>
          )
        ) : (
          <button
            type="button"
            onClick={pickFile}
            disabled={uploading}
            className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center transition-colors hover:bg-muted/40 disabled:cursor-wait"
          >
            {uploading ? (
              <Loader2 className="h-8 w-8 animate-spin text-[#f08c2b]" />
            ) : (
              <>
                <ImageIcon className="h-8 w-8 text-muted-foreground/60" />
                <span className="text-sm text-muted-foreground">No file uploaded</span>
              </>
            )}
          </button>
        )}

        <div className="absolute right-3 top-3">{fieldStatusBadge(state)}</div>

        {uploading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 className="h-8 w-8 animate-spin text-[#f08c2b]" />
          </div>
        ) : null}
      </div>

      <CardContent className="space-y-3 p-4">
        <div>
          <h3 className="text-sm font-semibold">{slot.label}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{slot.description}</p>
        </div>

        {state.reason ? (
          <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
            {state.reason}
          </p>
        ) : null}

        {showUpload ? (
          <div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleFile(file)
                e.target.value = ""
              }}
            />
            <Button
              type="button"
              size="sm"
              variant={previewUrl ? "outline" : "default"}
              disabled={uploading}
              onClick={pickFile}
              className="gap-1.5"
            >
              <Upload className="h-3.5 w-3.5" />
              {previewUrl ? "Replace" : "Upload"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export type KycTabViewProps = {
  memberId: string
  docType: KycDocType
  kycRow: MemberKycDocRow | null
  kycStatus: string
  uploading: Record<string, boolean>
  onUploadingChange: (field: string, value: boolean) => void
  onUploadComplete: (field: KycUploadField, pendingId: string | null, url: string) => void
}

export function KycTabView({
  memberId,
  docType,
  kycRow,
  kycStatus,
  uploading,
  onUploadingChange,
  onUploadComplete,
}: KycTabViewProps) {
  const { toast } = useToast()
  const [isEditing, setIsEditing] = useState(false)
  const isVerified =
    kycStatus === "Verified" || kycRow?.status === "verified"
  const slots = useMemo(() => getClientKycUploadSlots(docType), [docType])
  const progress = useMemo(() => computeClientKycProgress(docType, kycRow), [docType, kycRow])

  const docTypeLabel =
    CLIENT_KYC_DOC_TYPE_OPTIONS.find((o) => o.value === docType)?.label ?? "National ID"

  const handleUpload = async (field: KycUploadField, file: File) => {
    onUploadingChange(field, true)
    try {
      const name = `client-kyc-pending/${memberId}/${field}-${Date.now()}-${file.name}`
      const blob = await upload(name, file, {
        handleUploadUrl: "/api/vercel_blob/upload",
        access: "public",
        contentType: file.type,
      })

      const fieldState = buildClientKycFieldState(kycRow, field)
      const endpoint =
        fieldState.status === "verified" ? "/api/client/kyc-docs/replace" : "/api/client/kyc-docs"
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType: field, url: blob.url }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Failed to submit document")
      onUploadComplete(field, data?.pendingId || null, blob.url)
    } catch (e: unknown) {
      toast({
        title: "Upload failed",
        description: (e as Error)?.message || "Unexpected error",
        variant: "destructive",
      })
    } finally {
      onUploadingChange(field, false)
    }
  }

  return (
    <div className="space-y-6">
      <ProfileCard
        title="Verification overview"
        description="Your KYC record and upload progress"
        editable={!isVerified}
        editing={isEditing}
        onEdit={() => setIsEditing(true)}
        onCancel={() => setIsEditing(false)}
        onSave={() => setIsEditing(false)}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <ProfileField label="Record status">
              <p className="text-sm font-medium">{recordStatusLabel(kycRow)}</p>
            </ProfileField>
            <ProfileField label="ID document type">
              <p className="text-sm font-medium">{docTypeLabel}</p>
              {!kycRow?.doc_type ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Set automatically from the ID documents you upload.
                </p>
              ) : null}
            </ProfileField>
          </div>

          <ProfileField label="Upload progress">
            <div className="flex items-end justify-between gap-4">
              <p className="text-2xl font-semibold tabular-nums">
                {progress.uploaded}
                <span className="text-lg font-normal text-muted-foreground"> / {progress.total}</span>
              </p>
              <p className="text-sm text-muted-foreground">{progress.percent}%</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[#f08c2b] transition-all duration-500"
                style={{
                  width: `${progress.total ? (progress.uploaded / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {progress.complete
                ? "All required documents uploaded."
                : `Upload passport photo plus your ${docTypeLabel.toLowerCase()} documents.`}
            </p>
          </ProfileField>
        </div>
      </ProfileCard>

      <div>
        <h2 className="mb-3 text-sm font-medium text-foreground">Documents</h2>
        <div
          className={cn(
            "grid gap-6",
            slots.length <= 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3",
          )}
        >
          {slots.map((slot) => {
            const state = buildClientKycFieldState(kycRow, slot.field)
            return (
              <KycDocumentViewCard
                key={slot.field}
                slot={slot}
                state={state}
                uploading={!!uploading[slot.field]}
                isEditing={isEditing}
                onUpload={(file) => handleUpload(slot.field, file)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
