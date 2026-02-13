"use client"

import type React from "react"
import { useState, useRef, useCallback } from "react"
import { Upload, FileText, ImageIcon, AlertCircle, CheckCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface FileUploadProps {
  onUpload: (file: File) => Promise<void>
  accept?: string
  maxSize?: number // in MB
  currentUrl?: string
  label: string
  description?: string
  disabled?: boolean
  uploading?: boolean
  layout?: "inline" | "stacked"
}

export function FileUpload({
  onUpload,
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

  const validateFile = (file: File): string | null => {
    if (file.size > maxSize * 1024 * 1024) {
      return `File size must be less than ${maxSize}MB`
    }

    const acceptedTypes = accept.split(",").map((type) => type.trim())
    const isValidType = acceptedTypes.some((type) => {
      if (type === "image/*") return file.type.startsWith("image/")
      if (type === "application/pdf") return file.type === "application/pdf"
      return file.type === type
    })

    if (!isValidType) {
      return "File type not supported"
    }

    return null
  }

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)

      const validationError = validateFile(file)
      if (validationError) {
        setError(validationError)
        setSelectedFile(null)
        setPreview(null)
        return
      }

      // Stage file for upload and create preview for images
      setSelectedFile(file)
      if (file.type.startsWith("image/")) {
        const reader = new FileReader()
        reader.onload = (e) => setPreview(e.target?.result as string)
        reader.readAsDataURL(file)
      } else {
        setPreview(null)
      }
    },
    [],
  )

  const startUpload = useCallback(async () => {
    if (!selectedFile || disabled || uploading) return
    setError(null)
    try {
      await onUpload(selectedFile)
      // Clear staged file and preview on success
      setSelectedFile(null)
      setPreview(null)
      setJustUploaded(true)
      // auto-hide success after 3 seconds
      window.setTimeout(() => setJustUploaded(false), 3000)
    } catch (err: any) {
      // Keep preview so user can retry
      setError(err?.message || "Upload failed")
    }
  }, [onUpload, selectedFile, disabled, uploading])

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)

      if (disabled || uploading) return

      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) {
        handleFile(files[0])
      }
    },
    [disabled, uploading, handleFile],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.preventDefault()
      if (disabled || uploading) return

      const files = Array.from(e.target.files || [])
      if (files.length > 0) {
        handleFile(files[0])
      }
    },
    [disabled, uploading, handleFile],
  )

  const openFileDialog = () => {
    if (disabled || uploading) return
    // If a file is staged (preview/selection visible), clicking confirms upload
    if (selectedFile) {
      void startUpload()
      return
    }
    inputRef.current?.click()
  }

  const getFileIcon = (url: string) => {
    if (url.includes(".pdf")) return <FileText className="h-4 w-4" />
    return <ImageIcon className="h-4 w-4" />
  }

  const isImageUrl = (url: string) => /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(url)
  const fileNameFromUrl = (url: string) => {
    try {
      const u = new URL(url)
      const base = u.pathname.split("/").pop() || "document"
      return decodeURIComponent(base)
    } catch {
      return url
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        {currentUrl && layout === "stacked" && (
          <a
            href={currentUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            {getFileIcon(currentUrl)}
            View current
          </a>
        )}
      </div>

      {description && <p className="text-xs text-muted-foreground">{description}</p>}

      <div
        className={cn(
          "relative border-2 border-dashed rounded-lg p-6 transition-colors",
          dragActive && !disabled && !uploading ? "border-primary bg-primary/5" : "border-muted-foreground/25",
          disabled || uploading ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-primary/50",
          error ? "border-destructive bg-destructive/5" : "",
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={openFileDialog}
      >
        {selectedFile && (
          <div className="absolute top-2 left-2 flex items-center gap-2 text-xs" aria-live="polite">
            <span className="inline-flex items-center rounded bg-amber-100 text-amber-800 px-2 py-0.5 border border-amber-200">Pending update</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                inputRef.current?.click()
              }}
              className="text-primary hover:underline"
            >
              Change file
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setSelectedFile(null)
                setPreview(null)
                setError(null)
              }}
              className="text-muted-foreground hover:underline"
              aria-label="Cancel pending file"
            >
              Cancel
            </button>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleChange}
          disabled={disabled || uploading}
          className="hidden"
        />

        <div
          className="flex flex-col items-center justify-center space-y-2 text-center"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              openFileDialog()
            }
          }}
        >
          {uploading ? (
            <>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="text-sm text-muted-foreground">Uploading...</p>
            </>
          ) : selectedFile ? (
            <>
              {selectedFile.type.startsWith("image/") ? (
                <img src={preview || "/placeholder.svg"} alt="Preview" className="max-h-32 max-w-full rounded" />
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-6 w-6" />
                  <span className="text-sm font-medium truncate max-w-[16rem]" title={selectedFile.name}>
                    {selectedFile.name}
                  </span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Click to upload this file</p>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Drop files here or click to browse</p>
                <p className="text-xs text-muted-foreground">Supports images and PDF files up to {maxSize}MB</p>
              </div>
            </>
          )}
        </div>
      </div>
      {layout === "inline" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
          {/* Left: Dropzone already rendered above; Right: Current Document */}
          <div className="hidden md:block" />
          <div className={cn("relative border rounded-lg p-3", disabled ? "opacity-60" : "")}
               aria-live="polite">
            {justUploaded && (
              <div className="mb-2 text-sm text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded">
                Document uploaded successfully
              </div>
            )}
            {currentUrl ? (
              <a
                href={currentUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open current ${label}`}
                className="group block"
              >
                {isImageUrl(currentUrl) ? (
                  <div className="relative">
                    <img
                      src={currentUrl}
                      alt={label}
                      className={cn("max-h-32 w-auto rounded border object-cover",
                        selectedFile ? "opacity-80" : "")}
                    />
                    <div className="absolute inset-0 hidden md:flex items-end justify-end p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">Open current</span>
                    </div>
                  </div>
                ) : (
                  <div className={cn("flex items-center gap-2 p-2 rounded border",
                    selectedFile ? "opacity-80" : "")}
                  >
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm truncate max-w-[16rem]" title={fileNameFromUrl(currentUrl)}>
                      {fileNameFromUrl(currentUrl)}
                    </span>
                  </div>
                )}
                <div className="mt-1 md:hidden text-xs text-muted-foreground">Open current</div>
              </a>
            ) : (
              <div className="text-xs text-muted-foreground">No document on file</div>
            )}
            {currentUrl && !selectedFile && (
              <div className="absolute top-2 right-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
              </div>
            )}
          </div>
        </div>
      ) : null}

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive" aria-live="polite">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
    </div>
  )
}
