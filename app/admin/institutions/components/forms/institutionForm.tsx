"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import StyledSelect from "@/components/newUI/styled_select"
import { Stepper, Step, StepLabel, Button, Box, Alert } from "@mui/material"
import { Loader2, Sparkles, Eye, EyeOff } from "lucide-react"

interface InstitutionFormProps {
  initialData?: any
  institutionId?: string
  isEditMode?: boolean
  onSuccess?: () => void
  onCancel?: () => void
}

const inputClass = (hasError: boolean) =>
  `w-full px-3 py-2.5 text-sm border rounded-md transition-all duration-200 focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none ${
    hasError ? "border-red-500" : "border-gray-300 hover:border-gray-400"
  }`

const institutionTypeOptions = [
  { value: "SACCO", label: "SACCO" },
  { value: "MFI", label: "Microfinance (MFI)" },
]

export function InstitutionForm({
  initialData,
  institutionId,
  isEditMode = false,
  onSuccess,
  onCancel,
}: InstitutionFormProps) {
  const router = useRouter()
  const [activeStep, setActiveStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const activeSteps = isEditMode
    ? ["Basic Details", "Branch Details"]
    : ["Basic Details", "Branch Details", "Admin Details"]

  const [branchTypeOptions, setBranchTypeOptions] = useState<
    { value: string; label: string; description?: string }[]
  >([
    { value: "Head Office", label: "Head Office", description: "Main institution headquarters" },
    { value: "Regional Office", label: "Regional Office", description: "Regional management office" },
    { value: "Branch", label: "Branch", description: "Standard service branch" },
    { value: "Agent", label: "Agent", description: "Agent outlet or partner" },
  ])

  const [formData, setFormData] = useState({
    name: "",
    type: "SACCO",
    registrationNumber: "",
    licenseNumber: "",
    branch_type_id: "",
    branchType: "Head Office",
    branchName: "",
    email: "",
    phone: "",
    address: "",
    adminFullName: "",
    adminUsername: "",
    adminEmail: "",
    adminPhone: "",
    adminPassword: "",
    adminConfirmPassword: "",
    clientTerminology: "Member",
    modules: {
      loans: true,
      savings: true,
      shares: true,
      mobile_money: true,
      chats: true,
    },
  })

  const [errors, setErrors] = useState<{ [k: string]: string }>({})

  // Pre-fill form data when initialData is provided
  useEffect(() => {
    if (initialData) {
      setFormData((prev) => ({
        ...prev,
        name: initialData.name || "",
        type: initialData.type || "SACCO",
        registrationNumber: initialData.registration_number || initialData.registrationNumber || "",
        licenseNumber: initialData.license_number || initialData.licenseNumber || "",
        branch_type_id: initialData.branch_type_id || initialData.branchTypeId || "",
        branchType: initialData.branch_type || initialData.branchType || "Head Office",
        branchName: initialData.branch_name || initialData.branchName || "Main Branch",
        email: initialData.email || "",
        phone: initialData.phone_number || initialData.phone || "",
        address: initialData.address || "",
      }))
    }
  }, [initialData])

  useEffect(() => {
    async function fetchBranchTypes() {
      try {
        const res = await fetch("/api/branch-types")
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data) && data.length > 0) {
            const formatted = data.map((bt: { id?: string; name: string; description?: string }) => ({
              value: bt.id || bt.name,
              label: bt.name,
              description: bt.description || undefined,
            }))
            setBranchTypeOptions(formatted)
            
            const matched = data.find(
              (bt: any) => bt.name?.toLowerCase() === "head office" || bt.name === formData.branchType
            ) || data[0]

            if (matched) {
              setFormData((prev) => ({
                ...prev,
                branch_type_id: matched.id || prev.branch_type_id,
                branchType: matched.name || prev.branchType,
              }))
            }
          }
        }
      } catch (err) {
        console.error("Failed to load branch types from API:", err)
      }
    }
    fetchBranchTypes()
  }, [])

  const validateStep = (step: number) => {
    const errs: { [k: string]: string } = {}

    if (step === 0) {
      if (!formData.name.trim()) errs.name = "Institution name is required"
    } else if (step === 1) {
      if (!formData.branchName.trim()) errs.branchName = "Branch name is required"
      if (!formData.email.trim()) {
        errs.email = "Branch email is required"
      } else {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(formData.email)) errs.email = "Invalid email format"
      }
      if (!formData.phone.trim()) errs.phone = "Branch phone number is required"
      if (!formData.address.trim()) errs.address = "Branch physical address is required"
    } else if (step === 2 && !isEditMode) {
      if (!formData.adminFullName.trim()) errs.adminFullName = "Full name is required"
      if (!formData.adminUsername.trim()) errs.adminUsername = "User name is required"
      if (!formData.adminEmail.trim()) {
        errs.adminEmail = "Admin email is required"
      } else {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(formData.adminEmail)) errs.adminEmail = "Invalid email format"
      }
      if (!formData.adminPhone.trim()) errs.adminPhone = "Admin phone number is required"

      if (!formData.adminPassword) {
        errs.adminPassword = "Password is required"
      } else if (formData.adminPassword.length < 6) {
        errs.adminPassword = "Password must be at least 6 characters"
      }

      if (!formData.adminConfirmPassword) {
        errs.adminConfirmPassword = "Please confirm password"
      } else if (formData.adminPassword !== formData.adminConfirmPassword) {
        errs.adminConfirmPassword = "Passwords do not match"
      }
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleNext = () => {
    if (validateStep(activeStep)) {
      setActiveStep((prev) => prev + 1)
    }
  }

  const handleBack = () => {
    setActiveStep((prev) => prev - 1)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    if (!validateStep(0) || !validateStep(1)) return
    if (!isEditMode && !validateStep(2)) return

    try {
      setSubmitting(true)
      const targetId = institutionId || initialData?.id
      const endpoint = isEditMode && targetId ? `/api/admin/institutions/${targetId}` : "/api/admin/institutions"
      const method = isEditMode ? "PATCH" : "POST"

      const payload = isEditMode
        ? {
            name: formData.name,
            type: formData.type,
            registrationNumber: formData.registrationNumber || undefined,
            licenseNumber: formData.licenseNumber || undefined,
            branchType: formData.branchType,
            branch_type_id: formData.branch_type_id || undefined,
            branchName: formData.branchName,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
          }
        : {
            name: formData.name,
            type: formData.type,
            registrationNumber: formData.registrationNumber || undefined,
            licenseNumber: formData.licenseNumber || undefined,
            branchType: formData.branchType,
            branch_type_id: formData.branch_type_id || undefined,
            branchName: formData.branchName || `${formData.name} Main Branch`,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
            adminFullName: formData.adminFullName,
            adminName: formData.adminFullName.trim(),
            adminUsername: formData.adminUsername.trim(),
            adminEmail: formData.adminEmail,
            adminPhone: formData.adminPhone,
            adminPassword: formData.adminPassword,
            status: "Active",
            modules: formData.modules,
            clientTerminology: formData.type === "SACCO" ? "Member" : "Client",
          }

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `Failed to ${isEditMode ? "update" : "create"} institution`)
      }

      router.refresh()
      if (onSuccess) onSuccess()
    } catch (err: any) {
      setSubmitError(err?.message || `An error occurred while ${isEditMode ? "updating" : "creating"} the institution.`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
      {submitError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {submitError}
        </Alert>
      )}

      {/* Stepper Header */}
      <Stepper
        activeStep={activeStep}
        alternativeLabel
        className="mb-6"
        sx={{
          "& .MuiStepIcon-root.Mui-active": { color: "#f08c2b" },
          "& .MuiStepIcon-root.Mui-completed": { color: "#f08c2b" },
          "& .MuiStepConnector-line": { borderColor: "#e5e7eb" },
          "& .Mui-active .MuiStepConnector-line": { borderColor: "#f08c2b" },
          "& .Mui-completed .MuiStepConnector-line": { borderColor: "#f08c2b" },
        }}
      >
        {activeSteps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* Step 0: Basic Details */}
      {activeStep === 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-gray-800 mb-3">Basic Information</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Institution Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Victoria SACCO Ltd"
                className={inputClass(!!errors.name)}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
              {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Institution Type <span className="text-red-500">*</span>
              </label>
              <StyledSelect
                value={formData.type}
                onChange={(val) =>
                  setFormData({
                    ...formData,
                    type: val,
                    clientTerminology: val === "SACCO" ? "Member" : "Client",
                  })
                }
                placeholder="Select type"
                options={institutionTypeOptions}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reg. Number</label>
              <input
                type="text"
                placeholder="e.g. REG/2026/890"
                className={inputClass(false)}
                value={formData.registrationNumber}
                onChange={(e) => setFormData({ ...formData, registrationNumber: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">License Number</label>
              <input
                type="text"
                placeholder="e.g. MFI-LIC-440"
                className={inputClass(false)}
                value={formData.licenseNumber}
                onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 1: Branch Details */}
      {activeStep === 1 && (
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-gray-800 mb-3">Branch Details</h4>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Branch Type <span className="text-red-500">*</span>
              </label>
              <StyledSelect
                value={formData.branch_type_id || formData.branchType}
                onChange={(val) => {
                  const matched = branchTypeOptions.find((opt) => opt.value === val)
                  setFormData({
                    ...formData,
                    branch_type_id: val,
                    branchType: matched ? matched.label : val,
                  })
                }}
                placeholder="Select branch type"
                options={branchTypeOptions}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Branch Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Kampala Main Branch"
                className={inputClass(!!errors.branchName)}
                value={formData.branchName}
                onChange={(e) => setFormData({ ...formData, branchName: e.target.value })}
              />
              {errors.branchName && (
                <p className="mt-1 text-xs text-red-500">{errors.branchName}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Branch Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                placeholder="branch@institution.org"
                className={inputClass(!!errors.email)}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
              {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Branch Phone Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="+256 700 000000"
                className={inputClass(!!errors.phone)}
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
              {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone}</p>}
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Branch Physical Address <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={2}
              placeholder="Plot 12 Kampala Road, Kampala"
              className={inputClass(!!errors.address)}
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
            {errors.address && <p className="mt-1 text-xs text-red-500">{errors.address}</p>}
          </div>
        </div>
      )}

      {/* Step 2: Admin Details (Only rendered in Create Mode) */}
      {!isEditMode && activeStep === 2 && (
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-gray-800">Institution Admin Account</h4>
            <p className="text-xs text-gray-500 mt-0.5">
              Set up the primary administrator account for this institution.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. John Doe"
                className={inputClass(!!errors.adminFullName)}
                value={formData.adminFullName}
                onChange={(e) => setFormData({ ...formData, adminFullName: e.target.value })}
              />
              {errors.adminFullName && (
                <p className="mt-1 text-xs text-red-500">{errors.adminFullName}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                User Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. johndoe"
                className={inputClass(!!errors.adminUsername)}
                value={formData.adminUsername}
                onChange={(e) => setFormData({ ...formData, adminUsername: e.target.value })}
              />
              {errors.adminUsername && (
                <p className="mt-1 text-xs text-red-500">{errors.adminUsername}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                placeholder="admin@institution.org"
                className={inputClass(!!errors.adminEmail)}
                value={formData.adminEmail}
                onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
              />
              {errors.adminEmail && (
                <p className="mt-1 text-xs text-red-500">{errors.adminEmail}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="+256 700 000000"
                className={inputClass(!!errors.adminPhone)}
                value={formData.adminPhone}
                onChange={(e) => setFormData({ ...formData, adminPhone: e.target.value })}
              />
              {errors.adminPhone && (
                <p className="mt-1 text-xs text-red-500">{errors.adminPhone}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className={`${inputClass(!!errors.adminPassword)} pr-10 [&::-ms-reveal]:hidden [&::-ms-clear]:hidden`}
                  value={formData.adminPassword}
                  onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.adminPassword && (
                <p className="mt-1 text-xs text-red-500">{errors.adminPassword}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className={`${inputClass(!!errors.adminConfirmPassword)} pr-10 [&::-ms-reveal]:hidden [&::-ms-clear]:hidden`}
                  value={formData.adminConfirmPassword}
                  onChange={(e) => setFormData({ ...formData, adminConfirmPassword: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.adminConfirmPassword && (
                <p className="mt-1 text-xs text-red-500">{errors.adminConfirmPassword}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Navigation Footer Controls */}
      <Box sx={{ display: "flex", justifyContent: "space-between", mt: 4, pt: 3, borderTop: "1px solid #e5e7eb" }}>
        <Button
          disabled={activeStep === 0 || submitting}
          onClick={handleBack}
          variant="outlined"
          sx={{
            borderColor: "#777",
            color: "#000",
            textTransform: "none",
            px: 3,
            py: 1,
            "&:hover": {
              borderColor: "#f08c2b",
              backgroundColor: "transparent",
              color: "#000",
            },
          }}
        >
          Back
        </Button>

        <Box sx={{ display: "flex", gap: 1 }}>
          {onCancel && activeStep === 0 && (
            <Button
              onClick={onCancel}
              variant="outlined"
              sx={{ borderColor: "#d1d5db", color: "#374151", textTransform: "none", px: 3, py: 1 }}
            >
              Cancel
            </Button>
          )}

          {activeStep === activeSteps.length - 1 ? (
            <Button
              variant="contained"
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              sx={{ backgroundColor: "#f08c2b", textTransform: "none", px: 4, py: 1, "&:hover": { backgroundColor: "#e07b1a" } }}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {isEditMode ? "Save Changes" : "Create Institution"}
                </>
              )}
            </Button>
          ) : (
            <Button
              variant="contained"
              type="button"
              onClick={handleNext}
              disabled={submitting}
              sx={{
                backgroundColor: "#000",
                color: "#fff",
                textTransform: "none",
                px: 4,
                py: 1,
                boxShadow: "none",
                "&:hover": {
                  backgroundColor: "#f08c2b",
                  boxShadow: "none",
                },
              }}
            >
              Next
            </Button>
          )}
        </Box>
      </Box>
    </form>
  )
}
