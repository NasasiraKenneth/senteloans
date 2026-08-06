"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import StyledSelect from "@/components/newUI/styled_select"
import { ReeveModal } from "@/components/modals/ReeveModal"
import { Loader2, AlertCircle, Mail, Key, Server, Eye, EyeOff, CheckCircle2 } from "lucide-react"

interface BranchEmailSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  institutionId: string
  branch: {
    branch_id: string
    branch_name: string
    provider?: string
    from_email?: string | null
    reply_to_email?: string | null
    domain?: string | null
    api_key?: string | null
    smtp_host?: string | null
    smtp_port?: number | null
    smtp_username?: string | null
    email_is_active?: boolean
  } | null
  onSuccess?: () => void
}

const inputClass = () =>
  "w-full px-3 py-2.5 text-sm border border-gray-300 rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none hover:border-gray-400"

const providerOptions = [
  { value: "mailgun", label: "Mailgun (API / HTTP)", description: "Recommended for transaction emails" },
  { value: "smtp", label: "Custom SMTP Server", description: "Use custom SMTP host & credentials" },
  { value: "postmark", label: "Postmark API", description: "Fast delivery via Postmark API" },
  { value: "sendgrid", label: "SendGrid API", description: "SendGrid Web API integration" },
]

export function BranchEmailSettingsModal({
  isOpen,
  onClose,
  institutionId,
  branch,
  onSuccess,
}: BranchEmailSettingsModalProps) {
  const [formData, setFormData] = useState({
    provider: "mailgun",
    from_email: "",
    reply_to_email: "",
    domain: "",
    api_key: "",
    smtp_host: "",
    smtp_port: "587",
    smtp_username: "",
    smtp_password: "",
    is_active: false,
  })

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [showSmtpPassword, setShowSmtpPassword] = useState(false)

  useEffect(() => {
    if (branch) {
      setFormData({
        provider: branch.provider || "mailgun",
        from_email: branch.from_email || "",
        reply_to_email: branch.reply_to_email || "",
        domain: branch.domain || "",
        api_key: "",
        smtp_host: branch.smtp_host || "",
        smtp_port: branch.smtp_port ? String(branch.smtp_port) : "587",
        smtp_username: branch.smtp_username || "",
        smtp_password: "",
        is_active: Boolean(branch.email_is_active),
      })
    }
  }, [branch])

  if (!branch) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    try {
      setSubmitting(true)
      const res = await fetch(`/api/admin/institutions/${institutionId}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_email_settings",
          branch_id: branch.branch_id,
          provider: formData.provider,
          from_email: formData.from_email.trim() || undefined,
          reply_to_email: formData.reply_to_email.trim() || undefined,
          domain: formData.domain.trim() || undefined,
          api_key: formData.api_key.trim() || undefined,
          smtp_host: formData.smtp_host.trim() || undefined,
          smtp_port: formData.smtp_port ? parseInt(formData.smtp_port, 10) : undefined,
          smtp_username: formData.smtp_username.trim() || undefined,
          smtp_password: formData.smtp_password.trim() || undefined,
          is_active: formData.is_active,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to save branch email settings")
      }

      if (onSuccess) onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || "An error occurred while saving email settings")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ReeveModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Email Settings - ${branch.branch_name}`}
      className="w-[34rem] max-w-[95vw] border-slate-200 shadow-2xl"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[52vh] overflow-y-auto">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-lg text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Header & Status Toggle */}
        <div className="flex items-center justify-between p-3.5 bg-amber-50/60 border border-amber-200/70 rounded-xl">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-100 text-[#f08c2b]">
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-900">Email Dispatch Service</p>
              <p className="text-[11px] text-gray-500">Enable or disable outbound emails for this branch</p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#f08c2b]"></div>
          </label>
        </div>

        {/* Provider Selection */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Email Provider Service
          </label>
          <StyledSelect
            value={formData.provider}
            onChange={(val) => setFormData((prev) => ({ ...prev, provider: val }))}
            placeholder="Select Email Provider"
            options={providerOptions}
          />
        </div>

        {/* Sender Email Credentials */}
        <div className="space-y-3 pt-1 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-[#f08c2b]" />
            Sender Addresses
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">From Email</label>
              <input
                type="email"
                placeholder="noreply@institution.com"
                value={formData.from_email}
                onChange={(e) => setFormData((prev) => ({ ...prev, from_email: e.target.value }))}
                className={inputClass()}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Reply-To Email</label>
              <input
                type="email"
                placeholder="support@institution.com"
                value={formData.reply_to_email}
                onChange={(e) => setFormData((prev) => ({ ...prev, reply_to_email: e.target.value }))}
                className={inputClass()}
              />
            </div>
          </div>
        </div>

        {/* Provider API / Domain Config */}
        {formData.provider !== "smtp" && (
          <div className="space-y-3 pt-1 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5 text-[#f08c2b]" />
              Provider Domain & API Key
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sending Domain</label>
                <input
                  type="text"
                  placeholder="mg.institution.com"
                  value={formData.domain}
                  onChange={(e) => setFormData((prev) => ({ ...prev, domain: e.target.value }))}
                  className={inputClass()}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  API Key <span className="text-xs text-gray-400 font-normal ml-1">(Leave blank to keep existing key)</span>
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    placeholder="key-••••••••••••••••"
                    value={formData.api_key}
                    onChange={(e) => setFormData((prev) => ({ ...prev, api_key: e.target.value }))}
                    className={inputClass()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SMTP Details (If SMTP selected or optional) */}
        {formData.provider === "smtp" && (
          <div className="space-y-3 pt-1 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5 text-[#f08c2b]" />
              SMTP Server Parameters
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">SMTP Host</label>
                <input
                  type="text"
                  placeholder="smtp.mailgun.org"
                  value={formData.smtp_host}
                  onChange={(e) => setFormData((prev) => ({ ...prev, smtp_host: e.target.value }))}
                  className={inputClass()}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Port</label>
                <input
                  type="number"
                  placeholder="587"
                  value={formData.smtp_port}
                  onChange={(e) => setFormData((prev) => ({ ...prev, smtp_port: e.target.value }))}
                  className={inputClass()}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">SMTP Username</label>
                <input
                  type="text"
                  placeholder="postmaster@domain.com"
                  value={formData.smtp_username}
                  onChange={(e) => setFormData((prev) => ({ ...prev, smtp_username: e.target.value }))}
                  className={inputClass()}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  SMTP Password <span className="text-xs text-gray-400 font-normal ml-1">(Optional edit)</span>
                </label>
                <div className="relative">
                  <input
                    type={showSmtpPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.smtp_password}
                    onChange={(e) => setFormData((prev) => ({ ...prev, smtp_password: e.target.value }))}
                    className={inputClass()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                  >
                    {showSmtpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting} className="text-xs">
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting}
            className="bg-[#f08c2b] hover:bg-[#e07b1a] text-white text-xs px-5 flex items-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Save Email Settings</span>
              </>
            )}
          </Button>
        </div>
      </form>
    </ReeveModal>
  )
}
