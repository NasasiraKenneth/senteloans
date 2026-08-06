"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import StyledSelect from "@/components/newUI/styled_select"
import { Loader2, AlertCircle, Eye, EyeOff, UserCheck } from "lucide-react"

interface AdminFormProps {
  institutionId: string
  adminId?: string
  initialData?: any
  isEditMode?: boolean
  initialBranches?: Array<{ id: string; name: string; branch_type?: string }>
  onSuccess?: (admin?: any) => void
  onCancel?: () => void
}

const inputClass = (hasError: boolean = false) =>
  `w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
    hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
  }`

export function AdminForm({
  institutionId,
  adminId,
  initialData,
  isEditMode = false,
  initialBranches,
  onSuccess,
  onCancel,
}: AdminFormProps) {
  const [formData, setFormData] = useState({
    name: initialData?.full_name || initialData?.name || "",
    username: initialData?.username || "",
    email: initialData?.email || "",
    phone: initialData?.phone_number || initialData?.phone || "",
    branch_id: initialData?.branch_id || initialData?.branchId || "",
    password: "",
    confirmPassword: "",
  })

  const [branchOptions, setBranchOptions] = useState<
    { value: string; label: string; description?: string }[]
  >([])
  const [loadingBranches, setLoadingBranches] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Populate form if initialData is provided
  useEffect(() => {
    if (initialData) {
      setFormData((prev) => ({
        ...prev,
        name: initialData.full_name || initialData.name || "",
        username: initialData.username || "",
        email: initialData.email || "",
        phone: initialData.phone_number || initialData.phone || "",
        branch_id: initialData.branch_id || initialData.branchId || prev.branch_id || "",
      }))
    }
  }, [initialData])

  // Fetch or initialize branches for the dropdown
  useEffect(() => {
    async function loadBranches() {
      try {
        setLoadingBranches(true)
        let branchList: any[] = []

        if (initialBranches && initialBranches.length > 0) {
          branchList = initialBranches
        } else {
          const res = await fetch(`/api/admin/institutions/${institutionId}/branches`)
          if (res.ok) {
            const data = await res.json()
            branchList = Array.isArray(data) ? data : data.branches || []
          }
        }

        const formatted = branchList.map((b: any) => ({
          value: b.id,
          label: b.name || "Unnamed Branch",
          description: b.branch_type || b.branch_code || "Branch",
        }))

        setBranchOptions(formatted)

        // Default to first branch if none selected
        if (formatted.length > 0 && !formData.branch_id) {
          setFormData((prev) => ({ ...prev, branch_id: formatted[0].value }))
        }
      } catch (err) {
        console.error("Failed to load branches for admin form:", err)
      } finally {
        setLoadingBranches(false)
      }
    }

    if (institutionId) {
      loadBranches()
    }
  }, [institutionId, initialBranches])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Basic Validation
    if (!formData.name.trim()) {
      setError("Full name is required")
      return
    }
    if (!formData.username.trim()) {
      setError("Username is required")
      return
    }
    if (!formData.email.trim()) {
      setError("Email address is required")
      return
    }
    if (!formData.branch_id) {
      setError("Please select a branch")
      return
    }

    if (!isEditMode && !formData.password) {
      setError("Password is required")
      return
    }

    if (formData.password) {
      if (formData.password.length < 6) {
        setError("Password must be at least 6 characters")
        return
      }
      if (formData.password !== formData.confirmPassword) {
        setError("Passwords do not match")
        return
      }
    }

    try {
      setSubmitting(true)
      const targetAdminId = adminId || initialData?.id
      const url = isEditMode && targetAdminId
        ? `/api/admin/institutions/${institutionId}/admins/${targetAdminId}`
        : `/api/admin/institutions/${institutionId}/admins`

      const method = isEditMode ? "PATCH" : "POST"

      const payload: any = {
        name: formData.name.trim(),
        username: formData.username.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || undefined,
        branch_id: formData.branch_id,
      }

      if (formData.password) {
        payload.password = formData.password
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || `Failed to ${isEditMode ? "update" : "create"} admin account`)
      }

      if (onSuccess) {
        onSuccess(data)
      }
    } catch (err: any) {
      setError(err.message || `An error occurred while ${isEditMode ? "updating" : "creating"} admin account`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[calc(85vh-75px)] overflow-y-auto">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-lg text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Basic Admin Information Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#f08c2b] uppercase tracking-wider">
          <UserCheck className="h-3.5 w-3.5" />
          <span>{isEditMode ? "Edit Administrator Profile" : "Administrator Profile"}</span>
        </div>

        {/* Row 1: Full Name & Username */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Full Name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. John Doe"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              className={inputClass()}
              required
            />
          </div>

          {/* Username */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Username <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. johndoe"
              value={formData.username}
              onChange={(e) => setFormData((prev) => ({ ...prev, username: e.target.value }))}
              className={inputClass()}
              required
            />
          </div>
        </div>

        {/* Row 2: Email Address */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Email Address <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            placeholder="e.g. admin@institution.com"
            value={formData.email}
            onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
            className={inputClass()}
            required
          />
        </div>

        {/* Row 3: Assigned Branch & Phone Number */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Branch Selection */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Assigned Branch <span className="text-red-500">*</span>
            </label>
            {loadingBranches ? (
              <div className="flex items-center gap-2 p-2.5 border border-gray-200 rounded-md text-xs text-gray-500 bg-gray-50">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Loading branches...</span>
              </div>
            ) : branchOptions.length === 0 ? (
              <div className="p-2.5 border border-amber-200 bg-amber-50 rounded-md text-xs text-amber-700">
                No branches found. Please create a branch first.
              </div>
            ) : (
              <StyledSelect
                value={formData.branch_id}
                onChange={(value) => setFormData((prev) => ({ ...prev, branch_id: value }))}
                placeholder="Select assigned branch"
                options={branchOptions}
                searchable={true}
              />
            )}
          </div>

          {/* Phone Number */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Phone Number <span className="text-xs text-gray-400">(Optional)</span>
            </label>
            <input
              type="tel"
              placeholder="e.g. +256 700 000 000"
              value={formData.phone}
              onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
              className={inputClass()}
            />
          </div>
        </div>
      </div>

      {/* Security / Password Credentials */}
      <div className="space-y-3 pt-2 border-t border-gray-100">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          {/* Password */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {isEditMode ? "New Password" : "Password"} {!isEditMode && <span className="text-red-500">*</span>}
              {isEditMode && <span className="text-xs text-gray-400 ml-1">(Leave blank to keep unchanged)</span>}
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                className={inputClass()}
                required={!isEditMode}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {isEditMode ? "Confirm New Password" : "Confirm Password"} {!isEditMode && <span className="text-red-500">*</span>}
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, confirmPassword: e.target.value }))
                }
                className={inputClass()}
                required={!isEditMode && !!formData.password}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Form Action Buttons */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={submitting}
            className="text-xs"
          >
            Cancel
          </Button>
        )}

        <Button
          type="submit"
          disabled={submitting || branchOptions.length === 0}
          className="bg-[#f08c2b] hover:bg-[#e07b1a] text-white text-xs px-5 flex items-center gap-2"
        >
          {submitting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{isEditMode ? "Saving..." : "Creating..."}</span>
            </>
          ) : (
            <span>{isEditMode ? "Save Changes" : "Create Admin Account"}</span>
          )}
        </Button>
      </div>
    </form>
  )
}
