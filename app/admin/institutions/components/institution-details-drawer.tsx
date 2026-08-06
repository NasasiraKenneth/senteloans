"use client"

import React, { useState, useEffect } from "react"
import { SlideModal } from "@/components/modals/slide-modal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  Globe,
  UserCheck,
  ShieldCheck,
  Sliders,
  CheckCircle2,
  Loader2,
  CreditCard,
  MessageSquare,
  Smartphone,
  GitBranch,
  Users,
  TrendingUp,
  Search,
  Calendar,
  Sparkles,
  Plus,
  Pencil,
  Power,
} from "lucide-react"
import EditInstitutionModal from "./edit/edit"
import AddNewBranchModal from "./add/newBranch"
import EditBranchModal from "./edit/editBranch"

interface InstitutionDetailsDrawerProps {
  isOpen: boolean
  onClose: () => void
  institutionId: string | null
  initialData?: any
  onInstitutionUpdated?: () => void | Promise<void>
}

function getInitials(name: string) {
  if (!name) return "INS"
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.substring(0, 2).toUpperCase()
}

export function InstitutionDetailsDrawer({
  isOpen,
  onClose,
  institutionId,
  initialData,
  onInstitutionUpdated,
}: InstitutionDetailsDrawerProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "branches" | "admins" | "config">("overview")
  const [details, setDetails] = useState<any>(initialData || null)
  const [branches, setBranches] = useState<any[]>([])
  const [admins, setAdmins] = useState<any[]>([])
  const [branchSearch, setBranchSearch] = useState("")
  const [branchFilter, setBranchFilter] = useState<"ALL" | "HEAD_OFFICE" | "SUB_BRANCH">("ALL")
  const [editingBranch, setEditingBranch] = useState<any | null>(null)
  const [togglingStatus, setTogglingStatus] = useState(false)

  const handleToggleStatus = async () => {
    if (!institutionId || !details) return
    const newStatus = details.status === "Active" ? "Inactive" : "Active"

    try {
      setTogglingStatus(true)
      const res = await fetch(`/api/admin/institutions/${institutionId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to update status")
      }

      await fetchFullDetails()
      if (onInstitutionUpdated) onInstitutionUpdated()
    } catch (err: any) {
      console.error("Failed to toggle institution status:", err)
      alert(err.message || "Failed to update institution status")
    } finally {
      setTogglingStatus(false)
    }
  }

  const [analytics, setAnalytics] = useState<any>({
    branchesCount: 0,
    membersCount: 0,
    staffUsersCount: 0,
    avgMonthlyMessages: 0,
    monthlyGrowth: [],
  })
  const [loading, setLoading] = useState(false)

  const fetchFullDetails = async () => {
    if (!institutionId) return
    try {
      setLoading(true)
      // Fetch institution detail + analytics + branches
      const res = await fetch(`/api/admin/institutions/${institutionId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.institution) setDetails(data.institution)
        if (Array.isArray(data.branches)) setBranches(data.branches)
        if (data.analytics) setAnalytics(data.analytics)
      }

      // Fetch admin users
      const adminRes = await fetch(`/api/admin/institutions/${institutionId}/admins`)
      if (adminRes.ok) {
        const adminData = await adminRes.json()
        if (Array.isArray(adminData.admins)) {
          setAdmins(adminData.admins)
        }
      }
    } catch (err) {
      console.error("Failed to load institution details:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialData) {
      setDetails(initialData)
    }
  }, [initialData])

  useEffect(() => {
    if (isOpen && institutionId) {
      fetchFullDetails()
    }
  }, [isOpen, institutionId])

  if (!isOpen) return null

  const maxGrowthValue = Math.max(
    ...((analytics.monthlyGrowth as any[])?.flatMap((g) => [g.members, g.messages]) || [10]),
    10
  )

  // Filtered branches list
  const filteredBranches = branches.filter((br) => {
    const matchesSearch =
      !branchSearch.trim() ||
      br.name?.toLowerCase().includes(branchSearch.toLowerCase()) ||
      br.branch_code?.toLowerCase().includes(branchSearch.toLowerCase()) ||
      br.address?.toLowerCase().includes(branchSearch.toLowerCase())

    const isHead = br.branch_type?.toLowerCase().includes("head")
    if (branchFilter === "HEAD_OFFICE") return matchesSearch && isHead
    if (branchFilter === "SUB_BRANCH") return matchesSearch && !isHead
    return matchesSearch
  })

  return (
    <SlideModal
      isOpen={isOpen}
      onClose={onClose}
      title={details?.name || "Institution Details"}
      size="full"
    >
      <div className="flex flex-col h-full overflow-hidden bg-gray-50/50">
        {/* Fixed Hero Banner & Top Header */}
        <div className="bg-white px-8 py-5 border-b border-gray-200 space-y-4 flex-shrink-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-orange-100 via-amber-50 to-orange-100 text-[#f08c2b] font-extrabold text-2xl flex items-center justify-center border border-orange-200 shadow-sm flex-shrink-0">
                {getInitials(details?.name || "")}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 tracking-tight leading-snug">
                  {details?.name || "Loading..."}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <Badge
                    variant="outline"
                    className={`text-xs uppercase font-bold px-2.5 py-0.5 rounded-full ${
                      details?.type === "SACCO"
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : "bg-purple-50 text-purple-700 border-purple-200"
                    }`}
                  >
                    {details?.type || "SACCO"}
                  </Badge>

                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      details?.status === "Active"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-gray-100 text-gray-700 border border-gray-200"
                    }`}
                  >
                    {details?.status || "Active"}
                  </span>
                </div>
              </div>
            </div>

            {details && (
              <div className="flex items-center space-x-3">
                {details.status === "Active" ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={togglingStatus}
                    onClick={handleToggleStatus}
                    className="border-red-200 bg-red-50/60 text-red-600 hover:bg-red-100 hover:text-red-700 font-semibold text-xs rounded-xl shadow-2xs gap-2 px-4 py-2"
                  >
                    {togglingStatus ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Power className="h-3.5 w-3.5 text-red-500" />
                    )}
                    Deactivate Institution
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={togglingStatus}
                    onClick={handleToggleStatus}
                    className="border-emerald-200 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 font-semibold text-xs rounded-xl shadow-2xs gap-2 px-4 py-2"
                  >
                    {togglingStatus ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Power className="h-3.5 w-3.5 text-emerald-600" />
                    )}
                    Activate Institution
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* 4 KPI Analytics Cards Row (Fixed at Top) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
            <div className="bg-gray-50/80 rounded-xl p-3 border border-gray-200/70 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Branches</p>
                <h4 className="text-lg font-bold text-gray-900 mt-0.5">
                  {analytics.branchesCount || branches.length || 1}
                </h4>
              </div>
              <div className="h-8 w-8 rounded-lg bg-orange-100 text-[#f08c2b] flex items-center justify-center">
                <GitBranch className="h-4 w-4" />
              </div>
            </div>

            <div className="bg-gray-50/80 rounded-xl p-3 border border-gray-200/70 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  {details?.type === "SACCO" ? "Members" : "Clients"}
                </p>
                <h4 className="text-lg font-bold text-blue-600 mt-0.5">
                  {analytics.membersCount || 0}
                </h4>
              </div>
              <div className="h-8 w-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                <Users className="h-4 w-4" />
              </div>
            </div>

            <div className="bg-gray-50/80 rounded-xl p-3 border border-gray-200/70 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Staff</p>
                <h4 className="text-lg font-bold text-emerald-600 mt-0.5">
                  {analytics.staffUsersCount || admins.length || 0}
                </h4>
              </div>
              <div className="h-8 w-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <UserCheck className="h-4 w-4" />
              </div>
            </div>

            <div className="bg-gray-50/80 rounded-xl p-3 border border-gray-200/70 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Avg. Monthly Messages</p>
                <h4 className="text-lg font-bold text-purple-600 mt-0.5">
                  {analytics.avgMonthlyMessages || 0}
                </h4>
              </div>
              <div className="h-8 w-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
                <MessageSquare className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>

        {/* Main 2-Column Body Layout */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden p-6 md:p-8 gap-6 w-full">
          {/* LEFT COLUMN: Basic Info & Primary Branch Cards */}
          <div className="w-full lg:w-[320px] xl:w-[340px] flex-shrink-0 flex flex-col gap-4 h-full overflow-y-auto pr-1 pb-4">
            {/* Basic Information Card */}
            <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-xs space-y-3">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-[#f08c2b]" />
                Basic Information
              </h3>

              <div className="space-y-2.5 text-[11px]">
                <div>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Registration Number</p>
                  <p className="font-semibold text-gray-900 font-mono">
                    {details?.registration_number || "—"}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">License Number</p>
                  <p className="font-semibold text-gray-900 font-mono">
                    {details?.license_number || "—"}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Website</p>
                  <p className="font-semibold text-gray-900 truncate">
                    {details?.website ? (
                      <a
                        href={details.website.startsWith("http") ? details.website : `https://${details.website}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline flex items-center gap-1"
                      >
                        {details.website}
                        <Globe className="h-3 w-3" />
                      </a>
                    ) : (
                      "—"
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Registration Date</p>
                  <p className="font-medium text-gray-900">
                    {details?.created_at ? new Date(details.created_at).toLocaleDateString() : "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Primary Branch Details Card */}
            <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-[#f08c2b]" />
                  Primary Branch Details
                </h3>
                {details?.branch_code && (
                  <Badge variant="outline" className="text-[10px] font-mono bg-orange-50 text-[#f08c2b] border-orange-200 px-2 py-0">
                    {details.branch_code}
                  </Badge>
                )}
              </div>

              <div className="space-y-2.5 text-[11px]">
                <div>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Branch Name</p>
                  <p className="font-medium text-gray-900">{details?.branch_name || "Main Branch"}</p>
                </div>

                <div>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Branch Type</p>
                  <p className="font-medium text-gray-900">{details?.branch_type || "Head Office"}</p>
                </div>

                <div>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Branch Email</p>
                  <p className="font-medium text-gray-900 truncate flex items-center gap-1">
                    <Mail className="h-3 w-3 text-gray-400" />
                    {details?.email || "—"}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Branch Phone</p>
                  <p className="font-semibold font-medium text-gray-900 flex items-center gap-1">
                    <Phone className="h-3 w-3 text-gray-400" />
                    {details?.phone_number || "—"}
                  </p>
                </div>

                <div className="pt-2 border-t border-gray-100">
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Physical Address</p>
                  <p className="font-medium text-gray-900">{details?.address || "—"}</p>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Bigger Column with Fixed Tabs & Only Scrollable Content Area */}
          <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0 relative">
            {/* Restored Underline Tab Styles */}
            <div className="flex-shrink-0 flex items-center space-x-2 border-b border-gray-200 text-sm font-semibold mb-4">
              <button
                onClick={() => setActiveTab("overview")}
                className={`pb-3 px-4 relative transition-colors ${
                  activeTab === "overview" ? "text-[#f08c2b]" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Analytics
                </div>
                {activeTab === "overview" && (
                  <motion.div
                    layoutId="detailsTabUnderline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#f08c2b] rounded-full"
                  />
                )}
              </button>

              <button
                onClick={() => setActiveTab("branches")}
                className={`pb-3 px-4 relative transition-colors ${
                  activeTab === "branches" ? "text-[#f08c2b]" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4" />
                  Branches ({branches.length || 1})
                </div>
                {activeTab === "branches" && (
                  <motion.div
                    layoutId="detailsTabUnderline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#f08c2b] rounded-full"
                  />
                )}
              </button>

              <button
                onClick={() => setActiveTab("admins")}
                className={`pb-3 px-4 relative transition-colors ${
                  activeTab === "admins" ? "text-[#f08c2b]" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4" />
                  Admin Accounts ({admins.length})
                </div>
                {activeTab === "admins" && (
                  <motion.div
                    layoutId="detailsTabUnderline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#f08c2b] rounded-full"
                  />
                )}
              </button>

              <button
                onClick={() => setActiveTab("config")}
                className={`pb-3 px-4 relative transition-colors ${
                  activeTab === "config" ? "text-[#f08c2b]" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sliders className="h-4 w-4" />
                  Modules & Configuration
                </div>
                {activeTab === "config" && (
                  <motion.div
                    layoutId="detailsTabUnderline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#f08c2b] rounded-full"
                  />
                )}
              </button>
            </div>

            {/* THE ONLY SCROLLABLE AREA: Tab Panel Content */}
            <div className="flex-1 overflow-y-auto pr-2 pb-4">
              {loading && !details ? (
                <div className="bg-white rounded-2xl p-12 border border-gray-200 text-center flex flex-col items-center justify-center space-y-3">
                  <Loader2 className="h-8 w-8 text-[#f08c2b] animate-spin" />
                  <p className="text-sm text-gray-500 font-medium">Loading details...</p>
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  {/* TAB 1: ANALYTICS */}
                  {activeTab === "overview" && (
                    <motion.div
                      key="tab-analytics"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-6"
                    >
                      {/* 6-Month Activity Growth Bar Chart */}
                      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                              <TrendingUp className="h-4 w-4 text-[#f08c2b]" />
                              6-Month Activity Growth Analytics
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Monthly trend of new member registrations and message volume.
                            </p>
                          </div>
                          <div className="flex items-center gap-4 text-xs font-medium">
                            <span className="flex items-center gap-1.5">
                              <span className="h-3 w-3 rounded-xs bg-[#f08c2b]" />
                              Members
                            </span>
                            <span className="flex items-center gap-1.5">
                              <span className="h-3 w-3 rounded-xs bg-purple-500" />
                              Messages
                            </span>
                          </div>
                        </div>

                        {/* SVG Interactive Chart */}
                        <div className="h-56 w-full flex items-end justify-between gap-4 pt-6 px-4 pb-2 border-b border-gray-100">
                          {((analytics.monthlyGrowth as any[]) || [
                            { month: "Mar", members: 12, messages: 45 },
                            { month: "Apr", members: 18, messages: 72 },
                            { month: "May", members: 24, messages: 110 },
                            { month: "Jun", members: 31, messages: 165 },
                            { month: "Jul", members: 42, messages: 240 },
                            { month: "Aug", members: 58, messages: 310 },
                          ]).map((g, idx) => {
                            const memberHeight = Math.max(12, (g.members / maxGrowthValue) * 150)
                            const messageHeight = Math.max(12, (g.messages / maxGrowthValue) * 150)
                            return (
                              <div key={idx} className="flex-1 flex flex-col items-center gap-2 group">
                                <div className="w-full flex items-end justify-center gap-2 h-[150px]">
                                  {/* Member Bar */}
                                  <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: memberHeight }}
                                    transition={{ duration: 0.5, delay: idx * 0.05 }}
                                    className="w-5 bg-[#f08c2b] rounded-t-xs relative group-hover:brightness-110 transition-all"
                                    title={`Members: ${g.members}`}
                                  />
                                  {/* Message Bar */}
                                  <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: messageHeight }}
                                    transition={{ duration: 0.5, delay: idx * 0.05 + 0.1 }}
                                    className="w-5 bg-purple-500 rounded-t-xs relative group-hover:brightness-110 transition-all"
                                    title={`Messages: ${g.messages}`}
                                  />
                                </div>
                                <span className="text-xs font-semibold text-gray-600">{g.month}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* TAB 2: REDESIGNED BRANCHES LIST */}
                  {activeTab === "branches" && (
                    <motion.div
                      key="tab-branches"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-4"
                    >
                      {/* Search & Type Filters Toolbar with Standalone Add Button */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                        {/* Search & Filter Pills Card (Left) */}
                        <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white rounded-2xl p-3 border border-gray-200 shadow-2xs">
                          <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                            <input
                              type="text"
                              placeholder="Search branches by name, code, or address..."
                              value={branchSearch}
                              onChange={(e) => setBranchSearch(e.target.value)}
                              className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f08c2b]/20 focus:border-[#f08c2b] transition-all"
                            />
                          </div>

                          <div className="flex items-center gap-1.5 text-xs font-medium">
                            <button
                              onClick={() => setBranchFilter("ALL")}
                              className={`px-3 py-1.5 rounded-lg transition-all ${
                                branchFilter === "ALL"
                                  ? "bg-[#f08c2b] text-white shadow-2xs font-semibold"
                                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                              }`}
                            >
                              All ({branches.length || 1})
                            </button>
                            <button
                              onClick={() => setBranchFilter("HEAD_OFFICE")}
                              className={`px-3 py-1.5 rounded-lg transition-all ${
                                branchFilter === "HEAD_OFFICE"
                                  ? "bg-[#f08c2b] text-white shadow-2xs font-semibold"
                                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                              }`}
                            >
                              Head Office
                            </button>
                            <button
                              onClick={() => setBranchFilter("SUB_BRANCH")}
                              className={`px-3 py-1.5 rounded-lg transition-all ${
                                branchFilter === "SUB_BRANCH"
                                  ? "bg-[#f08c2b] text-white shadow-2xs font-semibold"
                                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                              }`}
                            >
                              Sub-Branches
                            </button>
                          </div>
                        </div>

                        {/* Standalone Add Branch Button (Calls ReeveModal via AddNewBranchModal) */}
                        {institutionId && (
                          <AddNewBranchModal
                            institutionId={institutionId}
                            institutionName={details?.name}
                            onSuccess={() => fetchFullDetails()}
                          />
                        )}

                        {/* Edit Branch Modal (Appears in the exact same tab area as Add Branch Modal) */}
                        {institutionId && editingBranch && (
                          <EditBranchModal
                            isOpen={!!editingBranch}
                            onClose={() => setEditingBranch(null)}
                            branch={editingBranch}
                            institutionId={institutionId}
                            institutionName={details?.name}
                            onSuccess={() => {
                              setEditingBranch(null)
                              fetchFullDetails()
                            }}
                          />
                        )}
                      </div>

                      {/* Redesigned Branch Cards Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredBranches.length === 0 ? (
                          <div className="bg-white rounded-2xl p-12 border border-gray-200 text-center space-y-3 col-span-2">
                            <GitBranch className="h-10 w-10 text-gray-300 mx-auto" />
                            <p className="text-sm font-semibold text-gray-700">No branches match your search</p>
                            <p className="text-xs text-gray-400">Try adjusting your search terms or filter selection.</p>
                          </div>
                        ) : (
                          filteredBranches.map((br, idx) => {
                            return (
                              <div
                                key={br.id || idx}
                                className="group bg-white rounded-2xl p-5 border border-gray-200 hover:border-gray-300 shadow-2xs transition-all relative space-y-4"
                              >
                                {/* Header */}
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-center space-x-3">
                                    <div className="h-11 w-11 rounded-2xl font-extrabold text-sm flex items-center justify-center border shadow-2xs flex-shrink-0 tracking-tight bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100 text-[#f08c2b] border-orange-200">
                                      {getInitials(br.name || details?.name || "INS")}
                                    </div>
                                    <div>
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <p className="font-bold text-sm text-gray-900">{br.name}</p>
                                      </div>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <p className="text-xs text-gray-400 font-medium">
                                          {br.branch_type || "Head Office"}
                                        </p>
                                        {br.branch_code && (
                                          <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 bg-gray-100 text-gray-600 rounded-md border border-gray-200">
                                            {br.branch_code}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center space-x-2">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setEditingBranch(br)
                                      }}
                                      title="Edit Branch"
                                      className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1.5 rounded-lg bg-gray-100 hover:bg-orange-100 text-gray-500 hover:text-[#f08c2b] border border-gray-200 hover:border-orange-200 shadow-2xs cursor-pointer"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>

                                    <Badge
                                      className={`text-xs ${
                                        br.status === "Inactive"
                                          ? "bg-gray-100 text-gray-700 border-gray-200"
                                          : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      }`}
                                    >
                                      {br.status || "Active"}
                                    </Badge>
                                  </div>
                                </div>

                                {/* Contact & Details Grid */}
                                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100 text-xs">
                                  <div>
                                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Email Address</p>
                                    <p className="font-medium text-gray-900 truncate flex items-center gap-1.5">
                                      <Mail className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                                      {br.email ? (
                                        <a href={`mailto:${br.email}`} className="hover:text-blue-600 truncate">
                                          {br.email}
                                        </a>
                                      ) : (
                                        "—"
                                      )}
                                    </p>
                                  </div>

                                  <div>
                                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Phone Number</p>
                                    <p className="font-medium text-gray-900 flex items-center gap-1.5">
                                      <Phone className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                                      {br.phone_number ? (
                                        <a href={`tel:${br.phone_number}`} className="hover:text-blue-600">
                                          {br.phone_number}
                                        </a>
                                      ) : (
                                        "—"
                                      )}
                                    </p>
                                  </div>

                                  <div className="col-span-2">
                                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Physical Address</p>
                                    <p className="font-medium text-gray-900 flex items-center gap-1.5">
                                      <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                                      <span className="truncate">{br.address || "—"}</span>
                                    </p>
                                  </div>

                                  {br.created_at && (
                                    <div className="col-span-2 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
                                      <span className="flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        Established: {new Date(br.created_at).toLocaleDateString()}
                                      </span>
                                      <span className="font-mono text-[10px] uppercase text-gray-400">
                                        CODE: {br.branch_code || "BR"}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* TAB 3: ADMIN ACCOUNTS */}
                  {activeTab === "admins" && (
                    <motion.div
                      key="tab-admins"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-4"
                    >
                      {admins.length === 0 ? (
                        <div className="bg-white rounded-2xl p-12 border border-gray-200 text-center space-y-3">
                          <UserCheck className="h-10 w-10 text-gray-300 mx-auto" />
                          <p className="text-sm text-gray-500">No admin accounts registered for this institution.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {admins.map((adm) => (
                            <div
                              key={adm.id}
                              className="bg-white rounded-2xl p-5 border border-gray-200 shadow-xs space-y-3"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                  <div className="h-10 w-10 rounded-full bg-amber-50 text-[#f08c2b] font-bold text-sm flex items-center justify-center border border-amber-200">
                                    {getInitials(adm.full_name || adm.email || "Admin")}
                                  </div>
                                  <div>
                                    <p className="font-bold text-sm text-gray-900">{adm.full_name || "Admin User"}</p>
                                    <p className="text-xs text-gray-400 font-mono">@{adm.username || "admin"}</p>
                                  </div>
                                </div>

                                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                                  {adm.status || "Active"}
                                </Badge>
                              </div>

                              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100 text-xs">
                                <div>
                                  <p className="text-gray-500 font-medium">Email</p>
                                  <p className="font-semibold text-gray-900 truncate">{adm.email || "—"}</p>
                                </div>
                                <div>
                                  <p className="text-gray-500 font-medium">Phone</p>
                                  <p className="font-semibold text-gray-900">{adm.phone_number || "—"}</p>
                                </div>
                                <div>
                                  <p className="text-gray-500 font-medium">Role</p>
                                  <p className="font-semibold text-[#f08c2b]">{adm.role_name || "Admin"}</p>
                                </div>
                                <div>
                                  <p className="text-gray-500 font-medium">Created</p>
                                  <p className="font-semibold text-gray-900">
                                    {adm.created_at ? new Date(adm.created_at).toLocaleDateString() : "—"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* TAB 4: MODULES & CONFIG */}
                  {activeTab === "config" && (
                    <motion.div
                      key="tab-config"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="grid grid-cols-1 md:grid-cols-2 gap-6"
                    >
                      {/* System Modules */}
                      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-4">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                          <Sliders className="h-4 w-4 text-[#f08c2b]" />
                          Active System Modules
                        </h3>

                        <div className="grid grid-cols-1 gap-2.5 text-xs">
                          <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                            <span className="font-medium text-gray-800 flex items-center gap-2">
                              <CreditCard className="h-4 w-4 text-blue-500" />
                              Loans Management Module
                            </span>
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          </div>

                          <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                            <span className="font-medium text-gray-800 flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-purple-500" />
                              Savings Accounts Module
                            </span>
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          </div>

                          <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                            <span className="font-medium text-gray-800 flex items-center gap-2">
                              <ShieldCheck className="h-4 w-4 text-emerald-500" />
                              Member Shares Module
                            </span>
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          </div>

                          <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                            <span className="font-medium text-gray-800 flex items-center gap-2">
                              <Smartphone className="h-4 w-4 text-orange-500" />
                              Mobile Money Payments API
                            </span>
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          </div>

                          <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                            <span className="font-medium text-gray-800 flex items-center gap-2">
                              <MessageSquare className="h-4 w-4 text-amber-500" />
                              Team Chat & Collaboration
                            </span>
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          </div>
                        </div>
                      </div>

                      {/* Default Configuration Settings */}
                      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-4">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-[#f08c2b]" />
                          Default Financial Configuration
                        </h3>

                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <p className="text-gray-500 font-medium">Default Currency</p>
                            <p className="font-semibold text-gray-900 font-mono mt-0.5">UGX (Shillings)</p>
                          </div>

                          <div>
                            <p className="text-gray-500 font-medium">Membership Fee</p>
                            <p className="font-semibold text-gray-900 mt-0.5">UGX 50,000</p>
                          </div>

                          <div>
                            <p className="text-gray-500 font-medium">Share Value</p>
                            <p className="font-semibold text-gray-900 mt-0.5">UGX 50,000</p>
                          </div>

                          <div>
                            <p className="text-gray-500 font-medium">Minimum Shares</p>
                            <p className="font-semibold text-gray-900 mt-0.5">5 Shares</p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          </div>
        </div>
      </div>
    </SlideModal>
  )
}

export default InstitutionDetailsDrawer
