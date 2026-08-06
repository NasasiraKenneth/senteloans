"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  X,
  User,
  Phone,
  Mail,
  MapPin,
  ShieldCheck,
  Clock,
  Calendar,
  CreditCard,
  Edit,
  ArrowRight,
  ShieldAlert,
  FileText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import TooltipButton from "@/components/newUI/tooltip_button"

export type DrawerMember = {
  id: string
  fullName: string
  memberNumber: string
  phoneNumber: string
  email: string
  location: string
  status: string
  kycStatus: string
  membershipFeePaid: number
  createdBy: string
  kycApprovedBy: string
  joinDate: string
  kycApprovedAt: string
}

interface MemberQuickViewDrawerProps {
  member: DrawerMember | null
  membershipFee: number
  currency: string
  formatMoney: (amount: number) => string
  isOpen: boolean
  onClose: () => void
  canEdit: boolean
}

function getInitials(name: string): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatDate(date: string): string {
  if (!date) return "—"
  return new Date(date).toLocaleDateString("en-UG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function formatDateTime(date: string): string {
  if (!date) return "—"
  return new Date(date).toLocaleString("en-UG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function MemberQuickViewDrawer({
  member,
  membershipFee,
  currency,
  formatMoney,
  isOpen,
  onClose,
  canEdit,
}: MemberQuickViewDrawerProps) {
  if (!member) return null

  const fee = membershipFee
  const paid = member.membershipFeePaid
  const feePercentage = fee > 0 ? Math.min(Math.round((paid / fee) * 100), 100) : 0
  const isFullyPaid = fee > 0 && paid >= fee

  const statusStyles: Record<string, { border: string; text: string; dot: string }> = {
    Active: { border: "border-emerald-200 text-emerald-700 bg-emerald-50/50", text: "Active", dot: "bg-emerald-500" },
    Inactive: { border: "border-slate-200 text-slate-600 bg-slate-50", text: "Inactive", dot: "bg-slate-400" },
    Suspended: { border: "border-rose-200 text-rose-700 bg-rose-50/50", text: "Suspended", dot: "bg-rose-500" },
  }

  const kycStyles: Record<string, { border: string; text: string; icon: React.ReactNode }> = {
    Verified: {
      border: "border-emerald-200 text-emerald-700 bg-emerald-50/50",
      text: "Verified",
      icon: <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />,
    },
    Pending: {
      border: "border-amber-200 text-amber-700 bg-amber-50/50",
      text: "Pending Review",
      icon: <Clock className="h-3.5 w-3.5 text-amber-600" />,
    },
    Rejected: {
      border: "border-rose-200 text-rose-700 bg-rose-50/50",
      text: "Rejected",
      icon: <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />,
    },
  }

  const statusObj = statusStyles[member.status] || statusStyles["Inactive"]
  const kycObj = kycStyles[member.kycStatus] || kycStyles["Pending"]

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-xs transition-opacity"
          />

          {/* Sleek Drawer Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 340 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white text-slate-900 shadow-2xl border-l border-slate-200"
          >
            {/* Top Navigation Bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#F08C2B]" />
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">Member Summary</h3>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Member Profile Overview Banner */}
            <div className="px-6 py-5 border-b border-slate-100 bg-white">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-white border-2 border-[#F08C2B] text-[#F08C2B] font-extrabold flex items-center justify-center text-base shadow-2xs flex-shrink-0">
                  {getInitials(member.fullName)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-slate-900 truncate">{member.fullName}</h2>
                  </div>
                  <div className="text-xs font-mono font-medium text-slate-500 mt-0.5">
                    Member ID: {member.memberNumber}
                  </div>

                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusObj.border}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${statusObj.dot}`} />
                      {statusObj.text}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${kycObj.border}`}
                    >
                      {kycObj.icon}
                      {kycObj.text}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Drawer Scrollable Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/40">
              {/* Contact Information */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-[#F08C2B]" /> Contact Details
                </h4>

                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500 flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-slate-400" /> Phone
                    </span>
                    <span className="font-semibold text-slate-900">{member.phoneNumber}</span>
                  </div>

                  {member.email && (
                    <div className="flex items-center justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500 flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-slate-400" /> Email
                      </span>
                      <span className="font-semibold text-slate-900 truncate max-w-[200px]">{member.email}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between py-1">
                    <span className="text-slate-500 flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" /> Location
                    </span>
                    <span className="font-semibold text-slate-900">{member.location || "Not specified"}</span>
                  </div>
                </div>
              </div>

              {/* Membership Fee Payment Status */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <CreditCard className="h-3.5 w-3.5 text-[#F08C2B]" /> Membership Fee
                  </h4>
                  <span
                    className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                      isFullyPaid
                        ? "border-emerald-300 text-emerald-700 bg-emerald-50"
                        : feePercentage > 0
                        ? "border-amber-300 text-amber-700 bg-amber-50"
                        : "border-slate-300 text-slate-600 bg-slate-50"
                    }`}
                  >
                    {isFullyPaid ? "Fully Paid" : feePercentage > 0 ? "Partial Payment" : "Unpaid"}
                  </span>
                </div>

                <div className="flex items-baseline justify-between pt-1">
                  <div>
                    <span className="text-[11px] text-slate-400 uppercase font-semibold">Paid Amount</span>
                    <div className="text-base font-bold text-slate-900">{formatMoney(paid)}</div>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 uppercase font-semibold">Required Fee</span>
                    <div className="text-sm font-semibold text-slate-600">{formatMoney(fee)}</div>
                  </div>
                </div>

                {fee > 0 && (
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Progress</span>
                      <span className="font-bold text-slate-800">{feePercentage}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isFullyPaid ? "bg-emerald-500" : "bg-amber-500"
                        }`}
                        style={{ width: `${feePercentage}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Registration & KYC Audit */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs space-y-2 text-xs">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-3">
                  <Calendar className="h-3.5 w-3.5 text-[#F08C2B]" /> Registration Audit
                </h4>

                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Join Date</span>
                  <span className="font-semibold text-slate-800">{formatDate(member.joinDate)}</span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Registered By</span>
                  <span className="font-semibold text-slate-800">{member.createdBy || "System"}</span>
                </div>

                {member.kycApprovedBy && (
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">KYC Reviewed By</span>
                    <span className="font-semibold text-slate-800">{member.kycApprovedBy}</span>
                  </div>
                )}

                {member.kycApprovedAt && (
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-500">Approval Date</span>
                    <span className="font-semibold text-slate-800">{formatDateTime(member.kycApprovedAt)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Action Footer with TooltipButton Integration */}
            <div className="p-4 bg-white border-t border-slate-200 flex items-center gap-3">
              <Link href={`/members/${member.id}`} className="flex-1">
                <Button className="w-full bg-[#F08C2B] hover:bg-[#d9771e] text-white font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer">
                  View Full Profile
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>

              {/* Edit Button with Tooltip */}
              {canEdit ? (
                <Link href={`/members/${member.id}/edit`}>
                  <TooltipButton
                    tooltip="Edit member profile"
                    className="group relative inline-flex items-center justify-center w-11 h-11 rounded-xl bg-slate-100 hover:bg-orange-50 text-slate-700 hover:text-[#F08C2B] border border-slate-200 hover:border-[#F08C2B]/40 hover:scale-105 transition-all duration-200 focus:outline-none shadow-2xs cursor-pointer"
                  >
                    <Edit className="h-4.5 w-4.5 transition-transform group-hover:scale-110" />
                  </TooltipButton>
                </Link>
              ) : (
                <TooltipButton
                  tooltip="Edit Member (No permission)"
                  disabled
                  className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-slate-100 text-slate-400 border border-slate-200 opacity-50 cursor-not-allowed"
                >
                  <Edit className="h-4.5 w-4.5" />
                </TooltipButton>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
