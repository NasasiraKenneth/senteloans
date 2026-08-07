import React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Building2,
  Users,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  Landmark,
  Plus,
  Activity,
  Layers,
} from "lucide-react"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { authOptions } from "@/lib/auth"
import Link from "next/link"

const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3000}`

function getInitials(name: string): string {
  if (!name) return "IN"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatDate(iso: string | null): string {
  if (!iso) return "Recent"
  try {
    const d = new Date(iso)
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
  } catch {
    return "Recent"
  }
}

export default async function AdminDashboard() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.authUserId) return redirect("/admin-login")
  if (session.user.role !== "system_admin") return redirect("/admin-login")

  const headersList = await headers()
  const res = await fetch(`${baseUrl}/api/admin/dashboard-stats`, {
    cache: "no-store",
    headers: { Cookie: headersList.get("cookie") ?? "" },
  })
  if (res.status === 401 || res.status === 403) return redirect("/admin-login")
  if (!res.ok) throw new Error("Failed to load dashboard stats")
  const stats = await res.json()

  const {
    institutionsCount,
    recentInstitutions,
    totalUsers,
    pendingInstitutions,
    saccoCount,
    mfiCount,
    activeInstitutions,
    inactiveInstitutions,
  } = stats

  const totalTypesCount = (saccoCount || 0) + (mfiCount || 0)
  const saccoPercent = totalTypesCount > 0 ? Math.round((saccoCount / totalTypesCount) * 100) : 0
  const mfiPercent = totalTypesCount > 0 ? Math.round((mfiCount / totalTypesCount) * 100) : 0

  return (
    <div className="p-6 space-y-6 w-full">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 rounded-2xl text-white shadow-md border border-slate-800">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-[#F08C2B]/20 text-[#F08C2B] border border-[#F08C2B]/30 shrink-0">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-white">System Admin Overview</h1>
              <Badge variant="outline" className="border-[#F08C2B]/40 bg-[#F08C2B]/10 text-[#F08C2B] font-semibold text-xs px-2.5 py-0.5 rounded-full">
                Global Super Admin
              </Badge>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Monitor network performance, institution onboarding, and user activity across SenteLoans
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link href="/admin/institutions">
            <Button className="bg-[#F08C2B] hover:bg-[#d97706] text-white font-semibold rounded-xl text-xs px-4 py-2 gap-2 cursor-pointer shadow-sm">
              <Building2 className="h-4 w-4" />
              Manage Institutions
            </Button>
          </Link>
          <Link href="/admin/users">
            <Button variant="outline" className="border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700 hover:text-white rounded-xl text-xs px-3.5 py-2 gap-2 cursor-pointer">
              <Users className="h-4 w-4 text-[#F08C2B]" />
              System Admins
            </Button>
          </Link>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Institutions */}
        <Card className="border border-slate-200 border-t-2 border-t-[#F08C2B] bg-white shadow-2xs rounded-2xl transition-all hover:border-slate-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Registered Institutions
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#F08C2B]/20 bg-[#F08C2B]/10 text-[#F08C2B]">
              <Building2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{institutionsCount}</div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{activeInstitutions} Active Institutions</span>
            </div>
          </CardContent>
        </Card>

        {/* Institution Users */}
        <Card className="border border-slate-200 border-t-2 border-t-indigo-500 bg-white shadow-2xs rounded-2xl transition-all hover:border-slate-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Institution Users
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{Number(totalUsers)}</div>
            <div className="mt-1 text-xs text-slate-500 font-medium">
              Staff & admin accounts across platform
            </div>
          </CardContent>
        </Card>

        {/* Pending Reviews / Suspended */}
        <Card className="border border-slate-200 border-t-2 border-t-amber-500 bg-white shadow-2xs rounded-2xl transition-all hover:border-slate-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Suspended Accounts
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-600">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{pendingInstitutions}</div>
            <div className="mt-1 text-xs text-amber-600 font-medium">
              Require compliance review
            </div>
          </CardContent>
        </Card>

        {/* Inactive Institutions */}
        <Card className="border border-slate-200 border-t-2 border-t-slate-400 bg-white shadow-2xs rounded-2xl transition-all hover:border-slate-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Inactive Institutions
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
              <Building2 className="h-4 w-4 text-slate-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{inactiveInstitutions ?? 0}</div>
            <div className="mt-1 text-xs text-slate-500 font-medium">
              Disabled or dormant institution accounts
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid: Institution Breakdown & Recent Registered */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Recent Institutions */}
        <Card className="lg:col-span-2 border border-slate-200 bg-white shadow-2xs rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <CardTitle className="text-base font-bold text-slate-900">
                Recently Registered Institutions
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Latest institution accounts onboarded on the SenteLoans platform
              </p>
            </div>
            <Link href="/admin/institutions">
              <Button variant="ghost" size="sm" className="text-xs font-semibold text-[#F08C2B] hover:text-[#d97706] hover:bg-[#F08C2B]/10 gap-1.5 rounded-xl cursor-pointer">
                View All <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardHeader>

          <CardContent className="p-4 pt-2">
            <div className="divide-y divide-slate-100">
              {recentInstitutions && recentInstitutions.length > 0 ? (
                recentInstitutions.map((inst: { id: string; name: string; type: string; status: string; created_at?: string }) => {
                  const isActive = inst.status === "Active" || inst.status === "active"
                  return (
                    <div key={inst.id} className="flex items-center justify-between py-3.5 hover:bg-slate-50/80 px-2 rounded-xl transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-[#F08C2B]/15 text-[#F08C2B] border border-[#F08C2B]/30 flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                          {getInitials(inst.name)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{inst.name}</p>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                            <span className="font-medium text-slate-700">{inst.type}</span>
                            <span>•</span>
                            <span>{formatDate(inst.created_at || null)}</span>
                          </div>
                        </div>
                      </div>

                      <Badge
                        variant={isActive ? "default" : "secondary"}
                        className={
                          isActive
                            ? "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 font-semibold text-xs px-2.5 py-0.5"
                            : "bg-slate-100 text-slate-600 border border-slate-200 font-medium text-xs px-2.5 py-0.5"
                        }
                      >
                        {inst.status || "Active"}
                      </Badge>
                    </div>
                  )
                })
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">
                  No recently registered institutions found.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right Column (1 Col): Institution Types Breakdown */}
        <Card className="border border-slate-200 bg-white shadow-2xs rounded-2xl flex flex-col justify-between">
          <div>
            <CardHeader className="pb-4 border-b border-slate-100">
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Layers className="h-4 w-4 text-[#F08C2B]" />
                Institution Classification
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Distribution by institutional license and operations
              </p>
            </CardHeader>

            <CardContent className="p-5 space-y-5">
              {/* SACCOs */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <Landmark className="h-3.5 w-3.5 text-[#F08C2B]" /> SACCOs
                  </span>
                  <span className="font-bold text-slate-900">{saccoCount} ({saccoPercent}%)</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[#F08C2B] h-2 rounded-full transition-all duration-500"
                    style={{ width: `${saccoPercent}%` }}
                  />
                </div>
              </div>

              {/* Microfinance (MFIs) */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-indigo-500" /> Microfinance (MFIs)
                  </span>
                  <span className="font-bold text-slate-900">{mfiCount} ({mfiPercent}%)</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${mfiPercent}%` }}
                  />
                </div>
              </div>

              {/* Money Lenders - Commented out as requested */}
              {/*
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-700">Money Lenders</span>
                  <span className="font-bold text-slate-900">{moneyLenderCount}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: '0%' }}
                  />
                </div>
              </div>
              */}
            </CardContent>
          </div>

          {/* System Integrity - Commented out as requested */}
          {/*
          <div className="p-5 pt-0">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 space-y-1">
              <div className="font-semibold text-slate-800 flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-[#F08C2B]" /> System Integrity
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500">
                Institutional queries strictly exclude unverified or Money Lender categories.
              </p>
            </div>
          </div>
          */}
        </Card>
      </div>
    </div>
  )
}
