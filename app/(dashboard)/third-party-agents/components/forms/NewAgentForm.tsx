"use client"

import { useEffect, useState } from "react"
import Popover from "@mui/material/Popover"
import { Button } from "@/components/ui/button"
import { Mail, Phone, MapPin } from "lucide-react"
import { FiUser } from "react-icons/fi"

export type AgentFormData = {
  name: string
  status: string
  email: string
  address: string
  phone: string
}

interface AgentFormProps {
  initialValues?: Partial<AgentFormData>
  onSubmit: (data: AgentFormData) => void | Promise<void>
  onCancel: () => void
  loading?: boolean
  submitLabel?: string
}

const STATUS_OPTIONS = ["Active", "Inactive", "Suspended"]

const formInputClass =
  "w-full pl-10 pr-3 py-2.5 text-sm border rounded-md focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none transition-all duration-200 border-gray-300 hover:border-gray-400"

function StatusSelect({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const open = Boolean(anchorEl)

  return (
    <>
      <div
        onClick={(e) => setAnchorEl(e.currentTarget)}
        className={`flex items-center justify-between w-full px-3 py-2.5 text-sm border rounded-md cursor-pointer transition-all duration-200 ${
          open ? "ring-[1.5px] ring-[#f08c2b] border-transparent" : "border-gray-300 hover:border-gray-400"
        }`}
      >
        <span className={value ? "text-gray-900" : "text-gray-400"}>{value || "Select status"}</span>
        <svg className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        PaperProps={{
          sx: {
            width: anchorEl?.offsetWidth || 200,
            borderRadius: "10px",
            boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
            mt: 0.5,
          },
        }}
      >
        <div className="p-2">
          {STATUS_OPTIONS.map((opt) => {
            const isSelected = value === opt
            return (
              <div
                key={opt}
                onClick={() => {
                  onChange(opt)
                  setAnchorEl(null)
                }}
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors"
              >
                <div className={`relative w-4.5 h-4.5 border-2 flex items-center justify-center rounded-md transition-all ${
                  isSelected ? "bg-[#f08c2b] border-[#f08c2b]" : "bg-white border-gray-400 hover:border-gray-600"
                }`}>
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-gray-800">{opt}</span>
              </div>
            )
          })}
        </div>
      </Popover>
    </>
  )
}

const EMPTY_FORM: AgentFormData = { name: "", status: "Active", email: "", address: "", phone: "" }

export default function NewAgentForm({ initialValues, onSubmit, onCancel, loading = false, submitLabel = "Save" }: AgentFormProps) {
  const [formData, setFormData] = useState<AgentFormData>({ ...EMPTY_FORM, ...initialValues })
  const [nameError, setNameError] = useState<string | null>(null)

  useEffect(() => {
    setFormData({ ...EMPTY_FORM, ...initialValues })
    setNameError(null)
  }, [initialValues])

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      setNameError("Name is required")
      return
    }
    setNameError(null)
    onSubmit({
      ...formData,
      name: formData.name.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      address: formData.address.trim(),
    })
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Name <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <FiUser className="absolute left-3 top-1/2 transform -translate-y-1/2 text-lg text-gray-400" />
          <input
            className={`${formInputClass} ${nameError ? "border-red-500 focus:ring-red-500" : ""}`}
            placeholder="Agent name"
            value={formData.name}
            onChange={(e) => {
              setFormData((p) => ({ ...p, name: e.target.value }))
              if (nameError) setNameError(null)
            }}
          />
        </div>
        {nameError && <p className="mt-1 text-xs text-red-500">{nameError}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Status <span className="text-red-500">*</span>
        </label>
        <StatusSelect value={formData.status} onChange={(next) => setFormData((p) => ({ ...p, status: next }))} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-base text-gray-400" />
          <input
            className={formInputClass}
            placeholder="Email"
            value={formData.email}
            onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-base text-gray-400" />
          <input
            className={formInputClass}
            placeholder="Phone"
            value={formData.phone}
            onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-base text-gray-400" />
          <input
            className={formInputClass}
            placeholder="Address"
            value={formData.address}
            onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={loading}>{loading ? "Saving..." : submitLabel}</Button>
      </div>
    </div>
  )
}
