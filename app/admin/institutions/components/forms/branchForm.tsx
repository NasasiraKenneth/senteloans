"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import StyledSelect from "@/components/newUI/styled_select"
import { motion, AnimatePresence } from "framer-motion"
import { Loader2, AlertCircle, Eye, EyeOff, UserCheck, ChevronDown } from "lucide-react"

interface BranchFormProps {
  institutionId: string
  branchId?: string
  initialData?: any
  isEditMode?: boolean
  onSuccess?: (branch: any) => void
  onCancel?: () => void
}

const inputClass = (hasError: boolean = false) =>
  `w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
    hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
  }`

const statusOptions = [
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
]

export function BranchForm({
  institutionId,
  branchId,
  initialData,
  isEditMode = false,
  onSuccess,
  onCancel,
}: BranchFormProps) {
  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    branch_type_id: initialData?.branch_type_id || "",
    phone_number: initialData?.phone_number || "",
    email: initialData?.email || "",
    address: initialData?.address || "",
    status: initialData?.status || "Active",
    // Admin fields (only used in create mode)
    adminFullName: "",
    adminUsername: "",
    adminEmail: "",
    adminPhone: "",
    adminPassword: "",
    adminConfirmPassword: "",
  })

  const [branchTypes, setBranchTypes] = useState<
    { value: string; label: string; description?: string }[]
  >([])
  const [loadingTypes, setLoadingTypes] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isAdminExpanded, setIsAdminExpanded] = useState(false)

  useEffect(() => {
    if (initialData) {
      let resolvedTypeId = initialData.branch_type_id || ""
      if (!resolvedTypeId && initialData.branch_type && branchTypes.length > 0) {
        const matched = branchTypes.find(
          (bt) => bt.label?.toLowerCase() === initialData.branch_type?.toLowerCase()
        )
        if (matched) resolvedTypeId = matched.value
      }

      setFormData((prev) => ({
        ...prev,
        name: initialData.name || "",
        branch_type_id: resolvedTypeId,
        phone_number: initialData.phone_number || "",
        email: initialData.email || "",
        address: initialData.address || "",
        status: initialData.status || "Active",
      }))
    }
  }, [initialData, branchTypes])

  useEffect(() => {
    async function loadBranchTypes() {
      try {
        setLoadingTypes(true)
        const res = await fetch("/api/branch-types")
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data)) {
            const formatted = data.map((bt: any) => ({
              value: bt.id,
              label: bt.name,
              description: bt.description,
            }))
            setBranchTypes(formatted)

            // Resolve initial branch_type_id if editing
            if (initialData) {
              let matchedTypeId = initialData.branch_type_id || ""
              if (!matchedTypeId && initialData.branch_type) {
                const matched = formatted.find(
                  (bt: any) => bt.label?.toLowerCase() === initialData.branch_type?.toLowerCase()
                )
                if (matched) matchedTypeId = matched.value
              }
              if (matchedTypeId) {
                setFormData((prev) => ({ ...prev, branch_type_id: matchedTypeId }))
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed to load branch types:", err)
      } finally {
        setLoadingTypes(false)
      }
    }
    loadBranchTypes()
  }, [initialData])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!formData.name.trim()) {
      setError("Branch Name is required.")
      return
    }

    if (!formData.branch_type_id) {
      setError("Please select a Branch Type.")
      return
    }

    // Password validation if admin email or password supplied (only in create mode)
    if (!isEditMode && (formData.adminEmail || formData.adminPassword)) {
      if (!formData.adminEmail.trim()) {
        setError("Admin Email Address is required.")
        setIsAdminExpanded(true)
        return
      }
      if (!formData.adminPassword) {
        setError("Admin Password is required.")
        setIsAdminExpanded(true)
        return
      }
      if (formData.adminPassword.length < 6) {
        setError("Admin Password must be at least 6 characters.")
        setIsAdminExpanded(true)
        return
      }
      if (formData.adminPassword !== formData.adminConfirmPassword) {
        setError("Admin Passwords do not match.")
        setIsAdminExpanded(true)
        return
      }
    }

    try {
      setSubmitting(true)
      const targetBranchId = branchId || initialData?.id
      const url = isEditMode && targetBranchId
        ? `/api/admin/institutions/${institutionId}/branches/${targetBranchId}`
        : `/api/admin/institutions/${institutionId}/branches`

      const method = isEditMode ? "PUT" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Failed to ${isEditMode ? "update" : "create"} branch`)
      }

      if (onSuccess) {
        onSuccess(data.branch)
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-5 flex flex-col max-h-[52vh] overflow-hidden">
      {/* Scrollable Form Body */}
      <div className="flex-1 overflow-y-auto pr-1.5 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-md text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        {/* SECTION 1: BRANCH DETAILS */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5 pb-1 border-b border-gray-100">
            Branch Information
          </h4>

          {/* Branch Name & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Branch Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                placeholder="e.g. Jinja Regional Branch"
                value={formData.name}
                onChange={handleChange}
                required
                className={inputClass(!formData.name.trim() && !!error)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Status
              </label>
              <StyledSelect
                value={formData.status}
                onChange={(val) => setFormData((prev) => ({ ...prev, status: val }))}
                placeholder="Select Status"
                options={statusOptions}
              />
            </div>
          </div>

          {/* Branch Type */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Branch Type <span className="text-red-500">*</span>
            </label>
            {loadingTypes ? (
              <div className="h-10 w-full bg-gray-100 animate-pulse rounded-md flex items-center justify-center text-xs text-gray-400">
                Loading branch types...
              </div>
            ) : (
              <StyledSelect
                value={formData.branch_type_id}
                onChange={(val) => setFormData((prev) => ({ ...prev, branch_type_id: val }))}
                placeholder="Select Branch Type"
                options={[
                  { value: "", label: "Select Branch Type" },
                  ...branchTypes,
                ]}
              />
            )}
          </div>

          {/* Phone Number & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Phone Number
              </label>
              <input
                type="text"
                name="phone_number"
                placeholder="e.g. +256 700 123 456"
                value={formData.phone_number}
                onChange={handleChange}
                className={inputClass()}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                name="email"
                placeholder="e.g. jinja@sacco.com"
                value={formData.email}
                onChange={handleChange}
                className={inputClass()}
              />
            </div>
          </div>

          {/* Physical Address */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Physical Address
            </label>
            <input
              type="text"
              name="address"
              placeholder="e.g. Plot 45 Main Street, Jinja City"
              value={formData.address}
              onChange={handleChange}
              className={inputClass()}
            />
          </div>
        </div>

        {/* SECTION 2: COLLAPSIBLE ADMIN USER DETAILS (HIDDEN IN EDIT MODE) */}
        {!isEditMode && (
          <div className="border border-orange-200/80 rounded-xl overflow-hidden bg-orange-50/20">
            <button
              type="button"
              onClick={() => setIsAdminExpanded(!isAdminExpanded)}
              className="w-full flex items-center justify-between p-3.5 bg-orange-50/60 hover:bg-orange-100/60 text-xs font-bold text-[#f08c2b] uppercase tracking-wider transition-colors text-left"
            >
              <span className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-[#f08c2b]" />
                Branch Admin User Account (Optional)
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 text-[#f08c2b] ${
                  isAdminExpanded ? "rotate-180" : ""
                }`}
              />
            </button>

            <AnimatePresence>
              {isAdminExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="p-4 border-t border-orange-100 bg-white space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Full Name
                        </label>
                        <input
                          type="text"
                          name="adminFullName"
                          placeholder="e.g. John Okello"
                          value={formData.adminFullName}
                          onChange={handleChange}
                          className={inputClass()}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Username
                        </label>
                        <input
                          type="text"
                          name="adminUsername"
                          placeholder="e.g. john"
                          value={formData.adminUsername}
                          onChange={handleChange}
                          className={inputClass()}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Email
                        </label>
                        <input
                          type="email"
                          name="adminEmail"
                          placeholder="e.g. jokello@sacco.com"
                          value={formData.adminEmail}
                          onChange={handleChange}
                          className={inputClass()}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Phone
                        </label>
                        <input
                          type="text"
                          name="adminPhone"
                          placeholder="e.g. +256 770 000 111"
                          value={formData.adminPhone}
                          onChange={handleChange}
                          className={inputClass()}
                        />
                      </div>
                    </div>

                    {/* Passwords */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Password
                        </label>
                        <div className="relative">
                          <input
                            type={showPassword ? "text" : "password"}
                            name="adminPassword"
                            placeholder="••••••••"
                            value={formData.adminPassword}
                            onChange={handleChange}
                            className={`${inputClass()} pr-10`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Confirm Password
                        </label>
                        <div className="relative">
                          <input
                            type={showConfirmPassword ? "text" : "password"}
                            name="adminConfirmPassword"
                            placeholder="••••••••"
                            value={formData.adminConfirmPassword}
                            onChange={handleChange}
                            className={`${inputClass()} pr-10`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                          >
                            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Form Actions */}
      <div className="flex items-center justify-end space-x-3 pt-4 mt-2 border-t border-gray-100 flex-shrink-0">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={submitting}
            className="text-xs rounded-md border-gray-300 hover:bg-gray-50"
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={submitting}
          className="bg-[#f08c2b] hover:bg-[#e07b1a] text-white font-semibold text-xs rounded-md px-5 shadow-xs"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              {isEditMode ? "Updating Branch..." : "Creating Branch..."}
            </>
          ) : isEditMode ? (
            "Update Branch"
          ) : (
            "Create Branch"
          )}
        </Button>
      </div>
    </form>
  )
}

export default BranchForm
