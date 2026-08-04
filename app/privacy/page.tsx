"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ArrowLeft,
  Shield,
  Lock,
  Eye,
  FileText,
  Users,
  Clock,
  Coins,
  Mail,
  Phone,
  MapPin,
  CheckCircle,
  ArrowRight,
} from "lucide-react"

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
}

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-black text-zinc-100 selection:bg-orange-500 selection:text-black font-sans antialiased">
      {/* Dynamic Background Glow */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-b from-orange-500/15 via-orange-500/5 to-transparent blur-3xl" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-zinc-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center space-x-4">
              <Link href="/">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-zinc-400 hover:text-white hover:bg-zinc-900 text-xs font-semibold"
                >
                  <ArrowLeft className="h-4 w-4 mr-1.5 text-orange-500" />
                  Back to Home
                </Button>
              </Link>
              <div className="h-5 w-px bg-zinc-800 hidden sm:block" />
              <Link href="/" className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center shadow-md shadow-orange-500/20">
                  <Coins className="h-4 w-4 text-black" />
                </div>
                <span className="text-lg font-bold tracking-tight text-white flex items-center">
                  MIKOPO<span className="text-orange-500 ml-0.5">.</span>
                </span>
              </Link>
            </div>

            <div className="flex items-center space-x-3">
              <Link href="/client-login">
                <Button
                  variant="outline"
                  className="border-zinc-800 bg-zinc-950 text-zinc-300 hover:text-white hover:border-zinc-700 text-xs font-semibold h-9 px-4"
                >
                  Member Portal
                </Button>
              </Link>
              <Link href="/login">
                <Button className="bg-orange-500 hover:bg-orange-600 text-black font-semibold text-xs h-9 px-4 shadow-lg shadow-orange-500/20">
                  Staff Login <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 pt-16 pb-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto text-center">
        <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="space-y-4">
          <motion.div variants={fadeInUp} className="inline-block">
            <span className="text-xs font-mono uppercase tracking-widest text-orange-500 bg-orange-500/10 px-3 py-1 rounded-full border border-orange-500/20">
              Data Security & Governance
            </span>
          </motion.div>
          <motion.h1 variants={fadeInUp} className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Privacy Policy
          </motion.h1>
          <motion.p variants={fadeInUp} className="text-zinc-400 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            Your privacy and data security are foundational to our mission of empowering African SACCOs and credit cooperatives with transparent digital infrastructure.
          </motion.p>
          <motion.div variants={fadeInUp} className="text-xs text-zinc-500 font-mono pt-2">
            Last Updated: August 2026
          </motion.div>
        </motion.div>
      </section>

      {/* Guarantee Cards */}
      <section className="relative z-10 py-8 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16"
        >
          <motion.div variants={fadeInUp} whileHover={{ y: -3 }}>
            <Card className="bg-zinc-950 border-zinc-900 hover:border-zinc-800 transition-all rounded-xl h-full">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-orange-500 mx-auto mb-4">
                  <Shield className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-white mb-2">PostgreSQL RLS Security</h3>
                <p className="text-zinc-400 text-xs leading-relaxed">
                  Strict tenant data isolation enforced at the database level with 256-bit encryption for all member records.
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeInUp} whileHover={{ y: -3 }}>
            <Card className="bg-zinc-950 border-zinc-900 hover:border-zinc-800 transition-all rounded-xl h-full">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-orange-500 mx-auto mb-4">
                  <Lock className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-white mb-2">Data Minimization</h3>
                <p className="text-zinc-400 text-xs leading-relaxed">
                  We collect strictly necessary SACCO member KYC and financial data required for cooperative operations.
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeInUp} whileHover={{ y: -3 }}>
            <Card className="bg-zinc-950 border-zinc-900 hover:border-zinc-800 transition-all rounded-xl h-full">
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-orange-500 mx-auto mb-4">
                  <Eye className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-white mb-2">Audit Transparency</h3>
                <p className="text-zinc-400 text-xs leading-relaxed">
                  Complete audit logs and access tracking giving members and SACCO leadership total visibility over data usage.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </section>

      {/* Main Legal Content */}
      <section className="relative z-10 pb-24 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="space-y-6"
        >
          {/* Introduction */}
          <motion.div variants={fadeInUp}>
            <Card className="bg-zinc-950 border-zinc-900 rounded-xl">
              <CardHeader className="p-6 border-b border-zinc-900">
                <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                  <FileText className="h-5 w-5 text-orange-500" />
                  1. Introduction
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Mikopo Platform (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to safeguarding the privacy and security of personal and financial information processed through our SACCO Management System. This Privacy Policy outlines how we collect, use, store, and protect data when SACCO staff, administrators, and members interact with our system, in compliance with regional data protection frameworks and international standards.
                </p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Information We Collect */}
          <motion.div variants={fadeInUp}>
            <Card className="bg-zinc-950 border-zinc-900 rounded-xl">
              <CardHeader className="p-6 border-b border-zinc-900">
                <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                  <Users className="h-5 w-5 text-orange-500" />
                  2. Information We Collect
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div>
                  <h4 className="font-semibold text-sm text-white mb-2">A. Member KYC & Personal Information</h4>
                  <ul className="space-y-1.5 text-xs text-zinc-400 list-disc list-inside">
                    <li>Full legal name, date of birth, gender, and national identification details (NIN)</li>
                    <li>Contact details (phone number, email address, village/district location)</li>
                    <li>Employment status, declared monthly income, and Next-of-Kin details</li>
                    <li>Uploaded KYC verification documents (National ID photo, passport photo)</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-sm text-white mb-2">B. SACCO Financial & Share Data</h4>
                  <ul className="space-y-1.5 text-xs text-zinc-400 list-disc list-inside">
                    <li>Savings balances, fixed deposit records, and transaction histories</li>
                    <li>Loan applications, guarantor commitments, repayment schedules, and arrears tracking</li>
                    <li>Share capital contributions, share holdings, and dividend payout history</li>
                    <li>Linked payout accounts (Mobile Money numbers and Bank account details)</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-sm text-white mb-2">C. Technical & System Logs</h4>
                  <ul className="space-y-1.5 text-xs text-zinc-400 list-disc list-inside">
                    <li>Session identifiers, IP address logs, browser metrics, and operational audit trails</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* How We Use Information */}
          <motion.div variants={fadeInUp}>
            <Card className="bg-zinc-950 border-zinc-900 rounded-xl">
              <CardHeader className="p-6 border-b border-zinc-900">
                <CardTitle className="text-lg font-bold text-white">3. How We Use Information</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-3">
                {[
                  {
                    title: "SACCO Operations",
                    desc: "Managing member accounts, processing loan applications, calculating share dividends, and generating financial statements.",
                  },
                  {
                    title: "Compliance & KYC",
                    desc: "Verifying member identities, maintaining legal audit trails, and satisfying regulatory requirements.",
                  },
                  {
                    title: "Communications",
                    desc: "Sending operational updates, loan repayment reminders, and real-time support messages.",
                  },
                  {
                    title: "Security & Fraud Prevention",
                    desc: "Enforcing PostgreSQL Row-Level Security, preventing unauthorized cross-tenant data access, and monitoring system integrity.",
                  },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-black border border-zinc-900">
                    <CheckCircle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs font-semibold text-white">{item.title}: </span>
                      <span className="text-xs text-zinc-400">{item.desc}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>

          {/* Data Security */}
          <motion.div variants={fadeInUp}>
            <Card className="bg-zinc-950 border-zinc-900 rounded-xl">
              <CardHeader className="p-6 border-b border-zinc-900">
                <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                  <Shield className="h-5 w-5 text-orange-500" />
                  4. Data Security & Multi-Tenant Protection
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4 text-xs text-zinc-400 leading-relaxed">
                <p>
                  Mikopo employs enterprise-level safeguards to protect member records:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="p-4 rounded-lg bg-black border border-zinc-900 space-y-2">
                    <h5 className="font-bold text-white text-xs">Technical Controls</h5>
                    <ul className="space-y-1 text-zinc-400 list-disc list-inside">
                      <li>PostgreSQL Row-Level Security (RLS)</li>
                      <li>256-bit TLS/SSL encrypted transit</li>
                      <li>Encrypted database storage</li>
                      <li>Vercel Blob secure document vault</li>
                    </ul>
                  </div>
                  <div className="p-4 rounded-lg bg-black border border-zinc-900 space-y-2">
                    <h5 className="font-bold text-white text-xs">Access Controls</h5>
                    <ul className="space-y-1 text-zinc-400 list-disc list-inside">
                      <li>Role-Based Access Control (RBAC)</li>
                      <li>JWT session guards & hydration</li>
                      <li>Session timeout policies</li>
                      <li>Comprehensive operational audit trails</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Data Retention */}
          <motion.div variants={fadeInUp}>
            <Card className="bg-zinc-950 border-zinc-900 rounded-xl">
              <CardHeader className="p-6 border-b border-zinc-900">
                <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                  <Clock className="h-5 w-5 text-orange-500" />
                  5. Data Retention
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-3">
                {[
                  { type: "Active Member KYC Records", duration: "Duration of Membership + 7 Years" },
                  { type: "SACCO Loan & Guarantor Files", duration: "7 Years after Loan Closure" },
                  { type: "Financial Transaction Ledgers", duration: "7 Years from Transaction Date" },
                  { type: "System Audit Logs", duration: "2 Years" },
                ].map((row, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 rounded-lg bg-black border border-zinc-900 text-xs">
                    <span className="font-medium text-white">{row.type}</span>
                    <span className="text-orange-400 font-mono">{row.duration}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>

          {/* Contact Information */}
          <motion.div variants={fadeInUp}>
            <Card className="bg-zinc-950 border-zinc-900 rounded-xl">
              <CardHeader className="p-6 border-b border-zinc-900">
                <CardTitle className="text-lg font-bold text-white">6. Contact Privacy Office</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <p className="text-xs text-zinc-400">
                  If you have questions regarding this Privacy Policy or wish to exercise your data subject rights, please reach out to our Privacy Office:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-2">
                  <div className="p-3 rounded-lg bg-black border border-zinc-900 space-y-1">
                    <div className="text-orange-500 font-bold flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" /> Email
                    </div>
                    <div className="text-zinc-300 font-mono">privacy@mikopo.africa</div>
                  </div>
                  <div className="p-3 rounded-lg bg-black border border-zinc-900 space-y-1">
                    <div className="text-orange-500 font-bold flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" /> Phone
                    </div>
                    <div className="text-zinc-300 font-mono">+256 700 000 000</div>
                  </div>
                  <div className="p-3 rounded-lg bg-black border border-zinc-900 space-y-1">
                    <div className="text-orange-500 font-bold flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" /> Offices
                    </div>
                    <div className="text-zinc-300">Kampala & Nairobi</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 bg-black border-t border-zinc-900 text-zinc-500 py-12 px-4 sm:px-6 lg:px-8 text-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center space-x-3">
            <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center">
              <Coins className="h-4 w-4 text-black" />
            </div>
            <span className="text-base font-bold text-white">MIKOPO.</span>
            <span className="text-zinc-600">|</span>
            <span>Privacy & Security Portal</span>
          </div>

          <div className="flex items-center space-x-6">
            <Link href="/" className="hover:text-zinc-300 transition-colors">
              Home
            </Link>
            <Link href="/login" className="hover:text-zinc-300 transition-colors">
              Staff Portal
            </Link>
            <Link href="/client-login" className="hover:text-zinc-300 transition-colors">
              Member Portal
            </Link>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-8 pt-6 border-t border-zinc-900/60 text-center text-zinc-600 text-[11px]">
          © {new Date().getFullYear()} Mikopo Platform. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
