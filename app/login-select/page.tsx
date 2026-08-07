"use client"

import React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import {
  ShieldCheck,
  Users,
  CreditCard,
  ArrowRight,
  Coins,
  Sparkles,
  Lock,
} from "lucide-react"

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
}

export default function LoginSelectPage() {
  const portals = [
    {
      id: "system-admin",
      title: "System Admin",
      subtitle: "Platform Governance & Management",
      description:
        "For system administrators managing SACCO tenants, platform configuration, system security, and global auditing.",
      href: "/admin-login",
      icon: ShieldCheck,
      badge: "Governance",
      badgeColor: "bg-zinc-900 text-zinc-400 border-zinc-800",
      accentGlow: "from-orange-500/10 via-transparent to-transparent",
      borderColor: "border-zinc-900 hover:border-zinc-800",
      buttonStyle:
        "bg-black hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800/80 hover:border-zinc-700 shadow-sm",
      isFeatured: false,
    },
    {
      id: "sacco-staff",
      title: "SACCO Staff",
      subtitle: "Institutional Operations Dashboard",
      description:
        "For SACCO staff, loan officers, tellers, and managers processing member applications, loan disbursements, and daily transactions.",
      href: "/login",
      icon: CreditCard,
      badge: "Primary Portal",
      badgeColor: "bg-orange-500/15 text-orange-400 border-orange-500/30 font-semibold",
      accentGlow: "from-orange-500/30 via-orange-500/10 to-transparent",
      borderColor: "border-orange-500 shadow-2xl shadow-orange-500/15",
      buttonStyle:
        "bg-orange-500 hover:bg-orange-600 text-black font-bold shadow-md shadow-orange-500/20",
      isFeatured: true,
    },
    {
      id: "sacco-member",
      title: "SACCO Member",
      subtitle: "Member Self-Service Portal",
      description:
        "For registered SACCO members to view savings balances, track active loan repayments, review share capital, and chat with support.",
      href: "/client-login",
      icon: Users,
      badge: "Member Portal",
      badgeColor: "bg-zinc-900 text-zinc-300 border-zinc-800",
      accentGlow: "from-orange-500/15 via-transparent to-transparent",
      borderColor: "border-zinc-900 hover:border-zinc-700",
      buttonStyle:
        "bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-800 hover:border-orange-500/40 shadow-sm",
      isFeatured: false,
    },
  ]

  return (
    <div className="min-h-screen bg-black text-zinc-100 selection:bg-orange-500 selection:text-black font-sans antialiased overflow-x-hidden flex flex-col justify-between">
      {/* Background Animated Glows */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.12, 0.2, 0.12],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-gradient-to-b from-orange-500/20 via-orange-500/5 to-transparent blur-3xl"
        />
      </div>

      {/* Header */}
      <header className="relative z-10 sticky top-0 bg-black/80 backdrop-blur-xl border-b border-zinc-900 px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-3 group">
            <motion.div
              whileHover={{ scale: 1.05, rotate: 5 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20"
            >
              <Coins className="h-5 w-5 text-black" />
            </motion.div>
            <div className="flex flex-col">
              <span className="text-xl font-bold tracking-tight text-white flex items-center">
                NYUKI<span className="text-orange-500 ml-0.5">.</span>
              </span>
              <span className="text-[10px] tracking-widest text-zinc-400 uppercase font-mono -mt-1">
                SACCO Management System
              </span>
            </div>
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 flex items-center justify-center py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl w-full mx-auto">
          {/* Header Title Section */}
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center max-w-2xl mx-auto mb-14 space-y-3"
          >
            <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-zinc-900/90 border border-zinc-800">
              <Sparkles className="h-3.5 w-3.5 text-orange-500 animate-pulse" />
              <span className="text-xs font-medium text-zinc-300">
                Unified Portal Authentication Gateway
              </span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
              Select Your <span className="text-orange-500">Portal</span>
            </h1>
            <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
              Choose your role below to access your dedicated SACCO portal and workspace.
            </p>
          </motion.div>

          {/* Portal Cards Grid */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            {portals.map((portal) => {
              const Icon = portal.icon
              return (
                <motion.div
                  key={portal.id}
                  variants={cardVariants}
                  whileHover={{ y: -6 }}
                  className="group relative"
                >
                  <div
                    className={`h-full rounded-2xl bg-zinc-950 border border-zinc-900 ${portal.borderColor} p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 relative overflow-hidden shadow-xl`}
                  >
                    {/* Top Ambient Glow Effect */}
                    <div
                      className={`absolute top-0 left-0 right-0 h-32 bg-gradient-to-b ${portal.accentGlow} pointer-events-none ${
                        portal.isFeatured ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      } transition-opacity duration-500`}
                    />

                    <div>
                      {/* Card Top Row: Icon + Badge */}
                      <div className="flex items-center justify-between mb-6 relative z-10">
                        <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white group-hover:scale-110 transition-transform duration-300">
                          <Icon className="h-6 w-6 text-orange-500" />
                        </div>
                        <span
                          className={`text-[11px] font-semibold tracking-wide uppercase px-3 py-1 rounded-full border ${portal.badgeColor}`}
                        >
                          {portal.badge}
                        </span>
                      </div>

                      {/* Card Titles & Description */}
                      <div className="space-y-2 relative z-10">
                        <h2 className="text-xl font-bold text-white group-hover:text-orange-400 transition-colors">
                          {portal.title}
                        </h2>
                        <p className="text-xs font-medium text-zinc-400">
                          {portal.subtitle}
                        </p>
                        <p className="text-xs text-zinc-400 leading-relaxed pt-2">
                          {portal.description}
                        </p>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="pt-8 relative z-10">
                      <Link href={portal.href} className="block w-full">
                        <Button
                          className={`w-full font-bold text-xs rounded-xl h-11 transition-all shadow-lg flex items-center justify-center gap-2 ${portal.buttonStyle}`}
                        >
                          Log In as {portal.title}
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 bg-black border-t border-zinc-900 text-zinc-500 py-8 px-4 sm:px-6 lg:px-8 text-xs text-center">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center space-x-2 text-zinc-400">
            <Lock className="h-3.5 w-3.5 text-orange-500" />
            <span>Multi-tenant PostgreSQL Row-Level Security Protected</span>
          </div>
          <p className="text-zinc-600 text-[11px]">
            © {new Date().getFullYear()} Nyuki Platform. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
