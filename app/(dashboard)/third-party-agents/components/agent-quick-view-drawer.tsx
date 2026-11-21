"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  X,
  Building2,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Edit,
  ShieldCheck,
  Clock,
  ShieldAlert,
  GitBranch,
  FileText,
} from "lucide-react"
import Link from "next/link"
import TooltipButton from "@/components/newUI/tooltip_button"

export type ThirdPartyAgentRecord = {
  id: string
  name: string
  status: string
  email: string | null
  address: string | null
  phone: string | null
  branch_name?: string | null
  created_at: string
  updated_at: string
}

interface AgentQuickViewDrawerProps {
  agent: ThirdPartyAgentRecord | null
  isOpen: boolean
  onClose: () => void
  onEdit: (agent: ThirdPartyAgentRecord) => void
  canEdit: boolean
  editDisabledTooltip?: string
}

function formatDate(iso: string): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function formatDateTime(iso: string): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getInitials(name: string): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function AgentQuickViewDrawer({
  agent,
  isOpen,
  onClose,
  onEdit,
  canEdit,
  editDisabledTooltip,
}: AgentQuickViewDrawerProps) {
  if (!agent) return null

  const statusStyles: Record<string, { border: string; text: string; dot: string }> = {
    Active: { border: "border-emerald-200 text-emerald-700 bg-emerald-50/50 dark:border-emerald-500/30 dark:text-emerald-300 dark:bg-emerald-500/15", text: "Active Partner", dot: "bg-emerald-500" },
    Inactive: { border: "border-border text-muted-foreground bg-muted", text: "Inactive Partner", dot: "bg-muted-foreground" },
    Suspended: { border: "border-rose-200 text-rose-700 bg-rose-50/50 dark:border-rose-500/30 dark:text-rose-300 dark:bg-rose-500/15", text: "Suspended", dot: "bg-rose-500" },
  }

  const statusObj = statusStyles[agent.status] || statusStyles["Inactive"]

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
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs transition-opacity"
          />

          {/* Sleek Drawer Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 340 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-card text-foreground shadow-2xl border-l border-border"
          >
            {/* Top Navigation Bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/40">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-brand" />
                <h3 className="text-sm font-bold text-foreground tracking-tight">Partner Summary</h3>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Agent Profile Overview Banner */}
            <div className="px-6 py-5 border-b border-border bg-card">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-brand/10 border-2 border-brand text-brand font-extrabold flex items-center justify-center text-base shadow-2xs flex-shrink-0">
                  <Building2 className="h-6 w-6 stroke-[2]" />
                </div>

                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-foreground truncate">{agent.name}</h2>
                  <div className="text-xs font-mono font-medium text-muted-foreground mt-0.5">
                    Agent ID: {agent.id.slice(0, 8)}...
                  </div>

                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusObj.border}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${statusObj.dot}`} />
                      {statusObj.text}
                    </span>
                    {agent.branch_name && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border border-border bg-muted text-foreground/80">
                        <GitBranch className="h-3 w-3 text-muted-foreground" />
                        {agent.branch_name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Drawer Scrollable Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-muted/20">
              {/* Contact Information */}
              <div className="bg-card rounded-2xl p-4 border border-border shadow-2xs space-y-3">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-brand" /> Contact & Reachability
                </h4>

                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between py-1 border-b border-border/60">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground/70" /> Phone
                    </span>
                    <span className="font-semibold text-foreground">{agent.phone || "—"}</span>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-border/60">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground/70" /> Email
                    </span>
                    <span className="font-semibold text-foreground truncate max-w-[200px]">{agent.email || "—"}</span>
                  </div>

                  <div className="flex items-center justify-between py-1">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground/70" /> Physical Address
                    </span>
                    <span className="font-semibold text-foreground truncate max-w-[200px]">{agent.address || "—"}</span>
                  </div>
                </div>
              </div>

              {/* Registration & Audit Details */}
              <div className="bg-card rounded-2xl p-4 border border-border shadow-2xs space-y-2 text-xs">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2 mb-3">
                  <Calendar className="h-3.5 w-3.5 text-brand" /> Audit & Registry Info
                </h4>

                <div className="flex justify-between py-1.5 border-b border-border/60">
                  <span className="text-muted-foreground">Date Onboarded</span>
                  <span className="font-semibold text-foreground">{formatDate(agent.created_at)}</span>
                </div>

                <div className="flex justify-between py-1.5 border-b border-border/60">
                  <span className="text-muted-foreground">Last Modified</span>
                  <span className="font-semibold text-foreground">{formatDateTime(agent.updated_at)}</span>
                </div>

                {agent.branch_name && (
                  <div className="flex justify-between py-1.5">
                    <span className="text-muted-foreground">Assigned Branch</span>
                    <span className="font-semibold text-foreground">{agent.branch_name}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Action Footer */}
            <div className="p-4 bg-card border-t border-border flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground font-medium">
                Partner record active
              </span>

              {/* Edit Agent Button with Tooltip */}
              {canEdit ? (
                <TooltipButton
                  tooltip="Edit partner organization"
                  onClick={() => {
                    onClose()
                    onEdit(agent)
                  }}
                  className="group relative inline-flex items-center gap-2 px-4 h-10 rounded-xl bg-brand text-brand-foreground font-bold shadow-2xs hover:bg-brand-700 transition-all duration-200 cursor-pointer text-xs"
                >
                  <Edit className="h-4 w-4" />
                  <span>Edit Partner</span>
                </TooltipButton>
              ) : (
                <TooltipButton
                  tooltip={editDisabledTooltip || "Edit Partner (No permission)"}
                  disabled
                  className="inline-flex items-center gap-2 px-4 h-10 rounded-xl bg-muted text-muted-foreground border border-border opacity-50 cursor-not-allowed text-xs font-semibold"
                >
                  <Edit className="h-4 w-4" />
                  <span>Edit Partner</span>
                </TooltipButton>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
