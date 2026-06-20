"use client"

import { useEffect, useState } from "react"
import { upload } from "@vercel/blob/client"
import StyledSelect from "@/components/newUI/styled_select"
import { FileUpload } from "@/components/ui/file-upload"
import { useToast } from "@/components/ui/toast"
import { KYC_DOC_TYPES, type KycDocType, type KycUploadField } from "@/lib/members/kyc-docs"
import { mapMemberWriteGateClientMessage } from "@/lib/members/member-status"

export type KycDocsState = {
  passportPhoto: string
  passportBiodataPage: string
  nationalIdFront: string
  nationalIdBack: string
  drivingLicenseFront: string
  drivingLicenseBack: string
}

/** Shared member photo — same upload for every document type. */
const PASSPORT_PHOTO_FIELD = {
  field: "passport_photo" as const,
  label: "Passport Photo",
  description: "Upload a clear passport-style photo of the member (JPG, PNG, or PDF)",
  savedUrlKey: "passportPhoto" as const,
}

const DOC_TYPE_OPTIONS = [
  { value: "national_id", label: "National ID" },
  { value: "passport", label: "Passport" },
  { value: "driving_license", label: "Driving License" },
] as const satisfies ReadonlyArray<{ value: KycDocType; label: string }>

type UploadFieldConfig = {
  field: KycUploadField
  label: string
  description: string
  savedUrlKey: keyof KycDocsState
}

const UPLOAD_FIELDS_BY_DOC_TYPE: Record<KycDocType, UploadFieldConfig[]> = {
  passport: [
    {
      field: "passport_document_front",
      label: "Passport (Front)",
      description: "Upload the biodata page of the passport (JPG, PNG, or PDF)",
      savedUrlKey: "passportBiodataPage",
    },
  ],
  national_id: [
    {
      field: "national_id_front",
      label: "National ID (Front)",
      description: "Upload the front side of the national ID card",
      savedUrlKey: "nationalIdFront",
    },
    {
      field: "national_id_back",
      label: "National ID (Back)",
      description: "Upload the back side of the national ID card",
      savedUrlKey: "nationalIdBack",
    },
  ],
  driving_license: [
    {
      field: "driving_license_front",
      label: "Driving License (Front)",
      description: "Upload the front side of the driving license",
      savedUrlKey: "drivingLicenseFront",
    },
    {
      field: "driving_license_back",
      label: "Driving License (Back)",
      description: "Upload the back side of the driving license",
      savedUrlKey: "drivingLicenseBack",
    },
  ],
}

interface KycFormProps {
  memberId: string
  initialDocs?: Partial<KycDocsState>
  onUploadSuccess?: () => void
  onClose?: () => void
}

function mapKycError(code: string): string {
  switch (code) {
    case "missing_permission:edit_kyc":
      return "You do not have permission to upload KYC documents."
    default:
      return mapMemberWriteGateClientMessage(code, "uploading KYC documents")
  }
}

function emptySavedDocs(initialDocs?: Partial<KycDocsState>): KycDocsState {
  return {
    passportPhoto: initialDocs?.passportPhoto || "",
    passportBiodataPage: initialDocs?.passportBiodataPage || "",
    nationalIdFront: initialDocs?.nationalIdFront || "",
    nationalIdBack: initialDocs?.nationalIdBack || "",
    drivingLicenseFront: initialDocs?.drivingLicenseFront || "",
    drivingLicenseBack: initialDocs?.drivingLicenseBack || "",
  }
}

function fieldLabel(field: KycUploadField, docType: KycDocType): string {
  if (field === PASSPORT_PHOTO_FIELD.field) return PASSPORT_PHOTO_FIELD.label
  return UPLOAD_FIELDS_BY_DOC_TYPE[docType].find((f) => f.field === field)?.label || field
}

export default function KycForm({ memberId, initialDocs, onUploadSuccess, onClose }: KycFormProps) {
  const { toast } = useToast()
  const [docType, setDocType] = useState<KycDocType>("national_id")
  const [savedDocs, setSavedDocs] = useState<KycDocsState>(() => emptySavedDocs(initialDocs))
  const [pendingFiles, setPendingFiles] = useState<Partial<Record<KycUploadField, File>>>({})
  const [saving, setSaving] = useState(false)
  const [uploadKeys, setUploadKeys] = useState<Partial<Record<KycUploadField, number>>>({})

  useEffect(() => {
    setSavedDocs(emptySavedDocs(initialDocs))
  }, [
    initialDocs?.passportPhoto,
    initialDocs?.passportBiodataPage,
    initialDocs?.nationalIdFront,
    initialDocs?.nationalIdBack,
    initialDocs?.drivingLicenseFront,
    initialDocs?.drivingLicenseBack,
  ])

  const docTypeFields = UPLOAD_FIELDS_BY_DOC_TYPE[docType]
  const pendingCount =
    (pendingFiles[PASSPORT_PHOTO_FIELD.field] ? 1 : 0) +
    docTypeFields.filter((f) => pendingFiles[f.field]).length

  const handleDocTypeChange = (value: string) => {
    if (!(KYC_DOC_TYPES as readonly string[]).includes(value)) return
    setDocType(value as KycDocType)
  }

  const setPendingFile = (field: KycUploadField, file: File | null) => {
    setPendingFiles((prev) => {
      const next = { ...prev }
      if (file) next[field] = file
      else delete next[field]
      return next
    })
  }

  const uploadBlob = async (field: KycUploadField, file: File): Promise<string> => {
    const name = `client-kyc/${memberId}/${field}-${Date.now()}-${file.name}`
    const blobResult = await upload(name, file, {
      handleUploadUrl: "/api/vercel_blob/upload",
      access: "public",
      contentType: file.type,
    })
    if (!blobResult?.url) {
      throw new Error("Upload completed but no URL was returned")
    }
    return blobResult.url
  }

  const saveUploads = async (uploads: Array<{ field: KycUploadField; url: string }>) => {
    const saveRes = await fetch(`/api/institution/members/${memberId}/kyc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploads }),
    })
    const saveData = await saveRes.json().catch(() => ({}))
    if (!saveRes.ok) {
      const code = String(saveData?.code || saveData?.error || "")
      throw new Error(mapKycError(code))
    }
    return saveData
  }

  const handleSave = async () => {
    const entries: Array<[KycUploadField, File]> = []
    const passportPhotoFile = pendingFiles[PASSPORT_PHOTO_FIELD.field]
    if (passportPhotoFile) entries.push([PASSPORT_PHOTO_FIELD.field, passportPhotoFile])
    for (const config of docTypeFields) {
      const file = pendingFiles[config.field]
      if (file) entries.push([config.field, file])
    }

    if (entries.length === 0) {
      toast({
        variant: "warning",
        title: "No documents selected",
        description: "Choose at least one file to upload before saving.",
      })
      return
    }

    setSaving(true)
    const blobErrors: string[] = []
    const stagedUploads: Array<{ field: KycUploadField; url: string; label: string }> = []

    for (const [field, file] of entries) {
      const label = fieldLabel(field, docType)
      try {
        const url = await uploadBlob(field, file)
        stagedUploads.push({ field, url, label })
      } catch (e: unknown) {
        blobErrors.push(`${label}: ${(e as Error).message}`)
      }
    }

    let savedUrls: Partial<Record<KycUploadField, string>> = {}
    let saveError: string | null = null

    if (stagedUploads.length > 0) {
      try {
        await saveUploads(stagedUploads.map(({ field, url }) => ({ field, url })))
        savedUrls = Object.fromEntries(stagedUploads.map(({ field, url }) => [field, url])) as Partial<
          Record<KycUploadField, string>
        >
      } catch (e: unknown) {
        saveError = (e as Error).message
      }
    }

    const errors = [...blobErrors, ...(saveError ? [saveError] : [])]

    if (Object.keys(savedUrls).length > 0) {
      setSavedDocs((prev) => {
        const next = { ...prev }
        if (savedUrls[PASSPORT_PHOTO_FIELD.field]) {
          next[PASSPORT_PHOTO_FIELD.savedUrlKey] = savedUrls[PASSPORT_PHOTO_FIELD.field]!
        }
        for (const config of docTypeFields) {
          const url = savedUrls[config.field]
          if (url) next[config.savedUrlKey] = url
        }
        return next
      })
      setPendingFiles((prev) => {
        const next = { ...prev }
        for (const [field] of entries) {
          if (savedUrls[field]) delete next[field]
        }
        return next
      })
      setUploadKeys((prev) => {
        const next = { ...prev }
        for (const [field] of entries) {
          if (savedUrls[field]) next[field] = (next[field] || 0) + 1
        }
        return next
      })
      onUploadSuccess?.()
    }

    if (errors.length === 0) {
      toast({
        variant: "success",
        title: "KYC documents saved",
        description: `${entries.length} document${entries.length === 1 ? "" : "s"} uploaded successfully. The member will be notified.`,
      })
      onClose?.()
    } else if (Object.keys(savedUrls).length > 0) {
      toast({
        variant: "warning",
        title: "Partially saved",
        description: errors.join(" "),
      })
    } else {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: errors.join(" "),
      })
    }

    setSaving(false)
  }

  return (
    <div className="max-h-[75vh] space-y-6 overflow-y-auto p-5">
      <p className="text-sm text-gray-600">
        Choose a document type, attach the required files, then click Save to upload them all at once.
      </p>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Document Type <span className="text-red-500">*</span>
        </label>
        <StyledSelect
          value={docType}
          onChange={handleDocTypeChange}
          placeholder="Select document type"
          options={[...DOC_TYPE_OPTIONS]}
        />
      </div>

      <FileUpload
        key={`${PASSPORT_PHOTO_FIELD.field}-${uploadKeys[PASSPORT_PHOTO_FIELD.field] || 0}`}
        label={PASSPORT_PHOTO_FIELD.label}
        description={PASSPORT_PHOTO_FIELD.description}
        currentUrl={savedDocs[PASSPORT_PHOTO_FIELD.savedUrlKey]}
        manualUpload
        onFileSelect={(file) => setPendingFile(PASSPORT_PHOTO_FIELD.field, file)}
        accept="image/*,application/pdf"
        maxSize={5}
        layout="inline"
        disabled={saving}
      />

      {docTypeFields.map((config) => (
        <FileUpload
          key={`${config.field}-${uploadKeys[config.field] || 0}`}
          label={config.label}
          description={config.description}
          currentUrl={savedDocs[config.savedUrlKey]}
          manualUpload
          onFileSelect={(file) => setPendingFile(config.field, file)}
          accept="image/*,application/pdf"
          maxSize={5}
          layout="inline"
          disabled={saving}
        />
      ))}

      <div className="flex items-center justify-between border-t border-gray-100 pt-4">
        <p className="text-xs text-gray-500">
          {pendingCount > 0
            ? `${pendingCount} file${pendingCount === 1 ? "" : "s"} ready to save`
            : "No new files selected"}
        </p>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || pendingCount === 0}
          className="inline-flex h-9 items-center justify-center rounded-md bg-[#f08c2b] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save KYC Documents"}
        </button>
      </div>
    </div>
  )
}
