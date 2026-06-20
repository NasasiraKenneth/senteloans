"use client"

import type React from "react"
import { useState, useRef, useCallback, useEffect } from "react"
import {
  Upload,
  FileText,
  ImageIcon,
  AlertCircle,
  CheckCircle2,
  X,
  ExternalLink,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface FileUploadProps {
  onUpload?: (file: File) => Promise<void>
  /** When true, files are only staged locally; the parent triggers upload (e.g. via a Save button). */
  manualUpload?: boolean
  /** Called when the staged file changes (manualUpload mode). */
  onFileSelect?: (file: File | null) => void
  accept?: string
  maxSize?: number // in MB
  currentUrl?: string
  label: string
  description?: string
  disabled?: boolean
  uploading?: boolean
  layout?: "inline" | "stacked"
}

function isImageUrl(url: string) {
  return /\.(png|jpe?g|webp|gif|bmp|svg)(\?|$)/i.test(url)
}

function fileNameFromUrl(url: string) {
  try {
    const u = new URL(url)
    const base = u.pathname.split("/").pop() || "document"
    return decodeURIComponent(base)
  } catch {
    return url
  }
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type DocumentPreviewProps = {
  label: string
  url?: string | null
  file?: File | null
  previewUrl?: string | null
  dimmed?: boolean
  emptyText?: string
}

function DocumentPreview({ label, url, file, previewUrl, dimmed, emptyText = "No document" }: DocumentPreviewProps) {
  const displayUrl = previewUrl || url

  if (!displayUrl && !file) {
    return (
      <div className="flex min-h-[9rem] flex-col items-center justify-center rounded-lg border border-dashed border-muted-foreground/25 bg-muted/20 px-4 py-6 text-center">
        <ImageIcon className="mb-2 h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </div>
    )
  }

  const isImage = file ? file.type.startsWith("image/") : displayUrl ? isImageUrl(displayUrl) : false
  const name = file?.name || (url ? fileNameFromUrl(url) : "Document")

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border bg-muted/10",
        dimmed && "opacity-60",
      )}
    >
      {isImage && displayUrl ? (
        <img src={displayUrl} alt={label} className="max-h-44 w-full object-contain bg-white" />
      ) : displayUrl ? (
        <div className="flex min-h-[10rem] flex-col items-center justify-center gap-2 px-4 py-6">
          <FileText className="h-10 w-10 text-muted-foreground" />
          <p className="max-w-full truncate text-sm font-medium" title={name}>
            {name}
          </p>
          {file && <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>}
        </div>
      ) : (
        <div className="flex min-h-[10rem] items-center justify-center px-4 py-6">
          <FileText className="h-10 w-10 text-muted-foreground" />
        </div>
      )}
      {url && !file && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-background/90 px-2 py-1 text-xs font-medium text-primary shadow-sm hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-3 w-3" />
          Open
        </a>
      )}
    </div>
  )
}

export function FileUpload({
  onUpload,
  manualUpload = false,
  onFileSelect,
  accept = "image/*,application/pdf",
  maxSize = 5,
  currentUrl,
  label,
  description,
  disabled = false,
  uploading = false,
  layout = "stacked",
}: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [justUploaded, setJustUploaded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const objectUrlRef = useRef<string | null>(null)

  const revokePreview = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  const clearSelection = useCallback(() => {
    revokePreview()
    setSelectedFile(null)
    setPreview(null)
    onFileSelect?.(null)
    if (inputRef.current) inputRef.current.value = ""
  }, [revokePreview, onFileSelect])

  useEffect(() => revokePreview, [revokePreview])

  const validateFile = (file: File): string | null => {
    if (file.size > maxSize * 1024 * 1024) {
      return `File must be smaller than ${maxSize}MB`
    }

    const acceptedTypes = accept.split(",").map((type) => type.trim())
    const isValidType = acceptedTypes.some((type) => {
      if (type === "image/*") return file.type.startsWith("image/")
      if (type === "application/pdf") return file.type === "application/pdf"
      return file.type === type
    })

    if (!isValidType) return "File type not supported"
    return null
  }

  const handleFile = useCallback(
    (file: File) => {
      setError(null)
      setJustUploaded(false)

      const validationError = validateFile(file)
      if (validationError) {
        setError(validationError)
        return
      }

      revokePreview()
      const url = URL.createObjectURL(file)
      objectUrlRef.current = url
      setSelectedFile(file)
      setPreview(url)
      onFileSelect?.(file)
    },
    [revokePreview, onFileSelect],
  )

  const startUpload = useCallback(async () => {
    if (!selectedFile || disabled || uploading || !onUpload) return
    setError(null)
    try {
      await onUpload(selectedFile)
      clearSelection()
      setJustUploaded(true)
      window.setTimeout(() => setJustUploaded(false), 3000)
    } catch (err: unknown) {
      setError((err as Error)?.message || "Upload failed")
    }
  }, [onUpload, selectedFile, disabled, uploading, clearSelection])

  const openFilePicker = () => {
    if (disabled || uploading) return
    inputRef.current?.click()
  }

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true)
    else if (e.type === "dragleave") setDragActive(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)
      if (disabled || uploading) return
      const files = Array.from(e.dataTransfer.files)
      if (files[0]) handleFile(files[0])
    },
    [disabled, uploading, handleFile],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.preventDefault()
      if (disabled || uploading) return
      const files = Array.from(e.target.files || [])
      if (files[0]) handleFile(files[0])
    },
    [disabled, uploading, handleFile],
  )

  const statusLabel = uploading
    ? "Uploading"
    : justUploaded
      ? "Saved"
      : selectedFile
        ? manualUpload
          ? "Selected"
          : "Ready to upload"
        : currentUrl
          ? "On file"
          : "Missing"

  const statusClass = uploading
    ? "bg-primary/10 text-primary border-primary/20"
    : justUploaded
      ? "bg-green-50 text-green-700 border-green-200"
      : selectedFile
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : currentUrl
          ? "bg-green-50 text-green-700 border-green-200"
          : "bg-muted text-muted-foreground border-border"

  const gridClass = layout === "inline" ? "md:grid-cols-2" : "grid-cols-1"

  return (
    <div
      className={cn(
        "space-y-4",
        layout === "inline" && "rounded-lg border border-border/40 bg-muted/5 p-4",
      )}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-medium text-foreground">{label}</label>
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", statusClass)}>
              {statusLabel}
            </span>
          </div>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <p className="shrink-0 text-[11px] text-muted-foreground">Max {maxSize}MB · Images or PDF</p>
      </div>

      <div className={cn("grid gap-5", gridClass)}>
        {/* Current document */}
        <div className="flex min-h-[11rem] flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current</p>
          <DocumentPreview
            label={label}
            url={currentUrl}
            emptyText="No document on file"
          />
          {currentUrl && !selectedFile && (
            <p className="flex items-center gap-1.5 text-xs text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Document saved
            </p>
          )}
        </div>

        {/* New selection */}
        <div className="flex min-h-[11rem] flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {selectedFile ? "New selection" : "Upload new"}
          </p>

          <div
            className={cn(
              "relative flex min-h-[9rem] flex-col rounded-lg border-2 border-dashed transition-colors",
              dragActive && !disabled && !uploading
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25",
              disabled || uploading ? "opacity-60" : "",
              error ? "border-destructive/50 bg-destructive/5" : "",
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept={accept}
              onChange={handleChange}
              disabled={disabled || uploading}
              className="hidden"
            />

            {selectedFile ? (
              <div className="p-3">
                <DocumentPreview label={label} file={selectedFile} previewUrl={preview} />
                <p className="mt-2 truncate text-xs text-muted-foreground" title={selectedFile.name}>
                  {selectedFile.name} · {formatFileSize(selectedFile.size)}
                </p>
              </div>
            ) : (
              <button
                type="button"
                disabled={disabled || uploading}
                onClick={openFilePicker}
                className="flex min-h-[9rem] w-full flex-1 flex-col items-center justify-center gap-2 px-4 py-6 text-center transition-colors hover:bg-muted/30 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Uploading…</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm font-medium">Drag & drop or browse</span>
                    <span className="text-xs text-muted-foreground">Choose a file to replace the current document</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={openFilePicker}
              className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {selectedFile ? "Change file" : "Browse files"}
            </button>

            {selectedFile && !manualUpload && onUpload && (
              <button
                type="button"
                disabled={disabled || uploading}
                onClick={() => void startUpload()}
                className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploading ? "Uploading…" : "Upload now"}
              </button>
            )}

            {selectedFile && (
              <button
                type="button"
                disabled={disabled || uploading}
                onClick={clearSelection}
                className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>

          {manualUpload && selectedFile && (
            <p className="text-xs text-amber-800">File selected. Use Save below to upload.</p>
          )}

          {justUploaded && (
            <p className="flex items-center gap-1.5 text-xs text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Document uploaded successfully
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive" aria-live="polite">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  )
}
