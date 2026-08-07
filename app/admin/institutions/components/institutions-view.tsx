"use client"

import React, { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import StyledSelect from "@/components/newUI/styled_select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Building2,
  Building,
  Landmark,
  CheckCircle2,
  Search,
  X,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  MapPin,
  Loader2,
  Calendar,
} from "lucide-react"
import AddNewInstitutionModal from "./add/new"
import EditInstitutionModal from "./edit/edit"
import InstitutionDetailsDrawer from "./institution-details-drawer"

interface InstitutionItem {
  id: string
  name: string
  type: string
  status: string
  registration_number?: string
  license_number?: string
  website?: string
  logo?: string
  created_at: string
  branch_name?: string
  branch_type?: string
  email?: string
  phone_number?: string
  address?: string
}

interface StatsData {
  totalInstitutions: number
  activeInstitutions: number
  saccos: number
  mfis: number
}

interface PaginationData {
  total: number
  page: number
  limit: number
  totalPages: number
}

const statusOptions = [
  { value: "ALL", label: "All Statuses" },
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
  { value: "Pending", label: "Pending" },
  { value: "Suspended", label: "Suspended" },
]

const typeOptions = [
  { value: "ALL", label: "All Types" },
  { value: "SACCO", label: "SACCO" },
  { value: "MFI", label: "Microfinance (MFI)" },
]

function getInitials(name: string) {
  if (!name) return "INS"
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.substring(0, 2).toUpperCase()
}

export function InstitutionsView() {
  const [institutions, setInstitutions] = useState<InstitutionItem[]>([])
  const [stats, setStats] = useState<StatsData>({
    totalInstitutions: 0,
    activeInstitutions: 0,
    saccos: 0,
    mfis: 0,
  })
  const [pagination, setPagination] = useState<PaginationData>({
    total: 0,
    page: 1,
    limit: 9,
    totalPages: 1,
  })
  const [loading, setLoading] = useState(true)

  // Filters
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [typeFilter, setTypeFilter] = useState("ALL")
  const [currentPage, setCurrentPage] = useState(1)
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid")

  // SlideModal Details Drawer State
  const [selectedInstDrawer, setSelectedInstDrawer] = useState<InstitutionItem | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm)
      setCurrentPage(1)
    }, 300)
    return () => clearTimeout(handler)
  }, [searchTerm])

  // Fetch institutions list
  const fetchInstitutions = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (debouncedSearch) params.set("search", debouncedSearch)
      if (statusFilter !== "ALL") params.set("status", statusFilter)
      if (typeFilter !== "ALL") params.set("type", typeFilter)
      params.set("page", String(currentPage))
      params.set("limit", "9")

      let res = await fetch(`/api/admin/institutions/list?${params.toString()}`)
      if (!res.ok && res.status === 404) {
        res = await fetch(`/api/admin/institutions?${params.toString()}`)
      }
      if (res.ok) {
        const result = await res.json()
        if (Array.isArray(result)) {
          setInstitutions(result)
          setStats({
            totalInstitutions: result.length,
            activeInstitutions: result.filter((i: any) => i.status === "Active").length,
            saccos: result.filter((i: any) => i.type === "SACCO").length,
            mfis: result.filter((i: any) => i.type === "MFI").length,
          })
          setPagination({ total: result.length, page: 1, limit: 9, totalPages: 1 })
        } else {
          setInstitutions(result.data || [])
          setStats(result.stats || { totalInstitutions: 0, activeInstitutions: 0, saccos: 0, mfis: 0 })
          setPagination(result.pagination || { total: 0, page: 1, limit: 9, totalPages: 1 })
        }
      }
    } catch (err) {
      console.error("Failed to fetch institutions:", err)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, statusFilter, typeFilter, currentPage])

  useEffect(() => {
    fetchInstitutions()
  }, [fetchInstitutions])

  const handleStatusChange = (val: string) => {
    setStatusFilter(val)
    setCurrentPage(1)
  }

  const handleTypeChange = (val: string) => {
    setTypeFilter(val)
    setCurrentPage(1)
  }

  const handleOpenDetails = (inst: InstitutionItem) => {
    setSelectedInstDrawer(inst)
    setIsDrawerOpen(true)
  }

  const fromItemIndex = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1
  const toItemIndex = Math.min(pagination.page * pagination.limit, pagination.total)

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6 text-[#f08c2b]" />
            Institutions Directory
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage partner SACCOs, Microfinance Institutions, branches, and configurations.
          </p>
        </div>
        <AddNewInstitutionModal />
      </div>

      {/* KPI Cards Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Institutions</p>
            <h3 className="text-2xl font-bold text-gray-900 mt-1">{stats.totalInstitutions}</h3>
          </div>
          <div className="h-10 w-10 rounded-lg bg-orange-50 text-[#f08c2b] flex items-center justify-center">
            <Building2 className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Active Institutions</p>
            <h3 className="text-2xl font-bold text-emerald-600 mt-1">{stats.activeInstitutions}</h3>
          </div>
          <div className="h-10 w-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">SACCOs</p>
            <h3 className="text-2xl font-bold text-blue-600 mt-1">{stats.saccos}</h3>
          </div>
          <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Landmark className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Microfinances (MFI)</p>
            <h3 className="text-2xl font-bold text-purple-600 mt-1">{stats.mfis}</h3>
          </div>
          <div className="h-10 w-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
            <Building className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Filter and Action Controls Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Search Bar */}
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, reg number, email, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:ring-[1.5px] focus:ring-[#f08c2b] focus:border-transparent focus:outline-none transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* StyledSelect Dropdowns & View Switcher */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-[170px]">
            <StyledSelect
              value={statusFilter}
              onChange={handleStatusChange}
              placeholder="Status"
              options={statusOptions}
            />
          </div>

          <div className="w-[180px]">
            <StyledSelect
              value={typeFilter}
              onChange={handleTypeChange}
              placeholder="Institution Type"
              options={typeOptions}
            />
          </div>

          {/* Grid / Table View Toggle */}
          <div className="flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === "grid"
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-gray-500 hover:text-gray-900"
              }`}
              title="Grid View"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === "table"
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-gray-500 hover:text-gray-900"
              }`}
              title="Table View"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center flex flex-col items-center justify-center space-y-3">
          <Loader2 className="h-8 w-8 text-[#f08c2b] animate-spin" />
          <p className="text-sm text-gray-500 font-medium">Loading institutions...</p>
        </div>
      ) : institutions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center flex flex-col items-center justify-center space-y-3">
          <div className="h-12 w-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center">
            <Building2 className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">No institutions found</h3>
          <p className="text-sm text-gray-500 max-w-sm">
            No partner institutions match your current search or filter criteria. Try adjusting your query or filters.
          </p>
        </div>
      ) : viewMode === "grid" ? (
        /* GRID VIEW */
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {institutions.map((inst) => (
            <div
              key={inst.id}
              className="bg-white rounded-xl border border-gray-200 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden"
            >
              <div className="p-5 space-y-4">
                {/* Header Row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="h-11 w-11 rounded-lg bg-orange-100 text-[#f08c2b] font-bold text-sm flex items-center justify-center shadow-2xs border border-orange-200 flex-shrink-0">
                      {getInitials(inst.name)}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-gray-900 line-clamp-1 leading-snug">
                        {inst.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${
                            inst.type === "SACCO"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : "bg-purple-50 text-purple-700 border-purple-200"
                          }`}
                        >
                          {inst.type}
                        </Badge>
                        {inst.registration_number && (
                          <span className="text-xs text-gray-400 font-mono">
                            {inst.registration_number}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      inst.status === "Active"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-gray-100 text-gray-700 border border-gray-200"
                    }`}
                  >
                    {inst.status}
                  </span>
                </div>

                {/* Contact Information Details */}
                <div className="space-y-2 pt-2 border-t border-gray-100 text-xs text-gray-600">
                  <div className="flex items-center gap-2 truncate">
                    <Mail className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                    <span className="truncate">{inst.email || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2 truncate">
                    <Phone className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                    <span>{inst.phone_number || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2 truncate">
                    <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                    <span className="truncate">{inst.address || "—"}</span>
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <div className="text-[11px] text-gray-400 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(inst.created_at).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-2">
                  <EditInstitutionModal
                    institution={inst}
                    buttonText="Edit"
                    buttonVariant="outline"
                    buttonSize="sm"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleOpenDetails(inst)}
                    className="bg-[#000] hover:bg-[#f08c2b] text-white transition-colors text-xs px-3 py-1.5"
                  >
                    View Details
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Institution Name</th>
                  <th className="py-3.5 px-4">Type</th>
                  <th className="py-3.5 px-4">Branch Contact</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Created Date</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-sm text-gray-700">
                {institutions.map((inst) => (
                  <tr key={inst.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="h-9 w-9 rounded-md bg-orange-100 text-[#f08c2b] font-bold text-xs flex items-center justify-center flex-shrink-0 border border-orange-200">
                          {getInitials(inst.name)}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">{inst.name}</p>
                          {inst.registration_number && (
                            <p className="text-xs text-gray-400 font-mono">{inst.registration_number}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${
                          inst.type === "SACCO"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-purple-50 text-purple-700 border-purple-200"
                        }`}
                      >
                        {inst.type}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      <p className="text-gray-900 font-medium">{inst.email || "—"}</p>
                      <p className="text-gray-400">{inst.phone_number || "—"}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          inst.status === "Active"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-gray-100 text-gray-700 border border-gray-200"
                        }`}
                      >
                        {inst.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-gray-500">
                      {new Date(inst.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <EditInstitutionModal
                          institution={inst}
                          buttonText="Edit"
                          buttonVariant="outline"
                          buttonSize="sm"
                        />
                        <Button
                          size="sm"
                          onClick={() => handleOpenDetails(inst)}
                          className="bg-[#000] hover:bg-[#f08c2b] text-white transition-colors text-xs px-3 py-1.5"
                        >
                          View Details
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Controls Bar */}
      {pagination.total > 0 && (
        <div className="bg-white px-4 py-3 rounded-xl border border-gray-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600">
          <div>
            Showing <span className="font-semibold text-gray-900">{fromItemIndex}</span> to{" "}
            <span className="font-semibold text-gray-900">{toItemIndex}</span> of{" "}
            <span className="font-semibold text-gray-900">{pagination.total}</span> institutions
          </div>

          <div className="flex items-center space-x-1">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1 || loading}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="h-8 px-2.5 text-xs text-gray-700 border-gray-300"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>

            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((pg) => (
              <button
                key={pg}
                onClick={() => setCurrentPage(pg)}
                className={`h-8 w-8 rounded-md text-xs font-semibold transition-all ${
                  pg === currentPage
                    ? "bg-[#f08c2b] text-white shadow-xs"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {pg}
              </button>
            ))}

            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= pagination.totalPages || loading}
              onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
              className="h-8 px-2.5 text-xs text-gray-700 border-gray-300"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Institution Details SlideModal Drawer */}
      <InstitutionDetailsDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        institutionId={selectedInstDrawer?.id || null}
        initialData={selectedInstDrawer}
        onInstitutionUpdated={() => fetchInstitutions()}
      />
    </div>
  )
}

export default InstitutionsView
