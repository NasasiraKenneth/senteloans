"use client"

import { useState } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Users,
  CreditCard,
  PiggyBank,
  Shield,
  BarChart3,
  ArrowRight,
  Menu,
  X,
  Coins,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Check,
  MessageSquare,
  PieChart,
} from "lucide-react"

// Animation Variants
const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
}

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
}

export default function LandingPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeFaq, setActiveFaq] = useState<number | null>(null)

  const toggleFaq = (index: number) => {
    setActiveFaq(activeFaq === index ? null : index)
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100 selection:bg-orange-500 selection:text-black font-sans antialiased overflow-x-hidden">
      {/* Dynamic Animated Background Glow */}
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

      {/* Header Navigation */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-zinc-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Brand Logo */}
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

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center space-x-8 text-sm font-medium">
              <a href="#features" className="text-zinc-400 hover:text-white transition-colors">
                Features
              </a>
              <a href="#modules" className="text-zinc-400 hover:text-white transition-colors">
                SACCO Modules
              </a>
              <a href="#pricing" className="text-zinc-400 hover:text-white transition-colors">
                Pricing
              </a>
              <a href="#faq" className="text-zinc-400 hover:text-white transition-colors">
                FAQ
              </a>
            </nav>

            {/* Header Actions */}
            <div className="hidden md:flex items-center">
              <Link
                href="/login-select"
                className="text-sm font-semibold text-orange-500 hover:text-orange-400 transition-colors flex items-center gap-1.5 group"
              >
                Login <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <div className="md:hidden">
              <Button
                variant="ghost"
                size="icon"
                className="text-zinc-400 hover:text-white"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Menu Animation */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="md:hidden bg-zinc-950 border-b border-zinc-800 px-4 pt-4 pb-6 space-y-3 overflow-hidden"
            >
              <a
                href="#features"
                onClick={() => setIsMenuOpen(false)}
                className="block px-3 py-2 text-sm font-medium text-zinc-400 hover:text-white"
              >
                Features
              </a>
              <a
                href="#modules"
                onClick={() => setIsMenuOpen(false)}
                className="block px-3 py-2 text-sm font-medium text-zinc-400 hover:text-white"
              >
                SACCO Modules
              </a>
              <a
                href="#pricing"
                onClick={() => setIsMenuOpen(false)}
                className="block px-3 py-2 text-sm font-medium text-zinc-400 hover:text-white"
              >
                Pricing
              </a>
              <a
                href="#faq"
                onClick={() => setIsMenuOpen(false)}
                className="block px-3 py-2 text-sm font-medium text-zinc-400 hover:text-white"
              >
                FAQ
              </a>
              <div className="pt-3 border-t border-zinc-900">
                <Link
                  href="/login-select"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-base font-semibold text-orange-500 hover:text-orange-400 transition-colors group"
                >
                  Login <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 pt-24 pb-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto text-center">
        <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="space-y-6">
          {/* Badge */}
          <motion.div variants={fadeInUp} className="inline-block">
            <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-zinc-900/90 border border-zinc-800">
              <Sparkles className="h-3.5 w-3.5 text-orange-500 animate-pulse" />
              <span className="text-xs font-medium text-zinc-300">
                Digital SACCO Management System
              </span>
            </div>
          </motion.div>

          {/* Main Title */}
          <motion.h1
            variants={fadeInUp}
            className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.1]"
          >
            Modern Operations for African <br className="hidden sm:block" />
            <span className="text-orange-500">SACCOs & Credit Cooperatives</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            variants={fadeInUp}
            className="text-base sm:text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed"
          >
            A unified digital operating system built specifically for SACCOs. Manage member KYC, track share capital, automate loan processing, manage savings accounts, and calculate dividend distributions.
          </motion.p>

          {/* Hero Actions */}
          <motion.div
            variants={fadeInUp}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4"
          >
            <Link href="/login-select" className="w-full sm:w-auto">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600 text-black font-bold text-sm h-12 px-8 rounded-xl shadow-lg shadow-orange-500/20 transition-all">
                  Login to Portal <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </motion.div>
            </Link>
          </motion.div>
        </motion.div>

        {/* Metrics Bar with Scroll Stagger */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={staggerContainer}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-20 pt-10 border-t border-zinc-900"
        >
          <motion.div
            variants={fadeInUp}
            whileHover={{ y: -3 }}
            className="p-4 rounded-xl bg-zinc-950 border border-zinc-900 text-center transition-colors hover:border-zinc-800"
          >
            <div className="text-2xl font-bold text-white">UGX 45B+</div>
            <div className="text-xs text-zinc-500 mt-1">SACCO Loans Tracked</div>
          </motion.div>
          <motion.div
            variants={fadeInUp}
            whileHover={{ y: -3 }}
            className="p-4 rounded-xl bg-zinc-950 border border-zinc-900 text-center transition-colors hover:border-zinc-800"
          >
            <div className="text-2xl font-bold text-white">120K+</div>
            <div className="text-xs text-zinc-500 mt-1">Active SACCO Members</div>
          </motion.div>
          <motion.div
            variants={fadeInUp}
            whileHover={{ y: -3 }}
            className="p-4 rounded-xl bg-zinc-950 border border-zinc-900 text-center transition-colors hover:border-zinc-800"
          >
            <div className="text-2xl font-bold text-orange-500">99.9%</div>
            <div className="text-xs text-zinc-500 mt-1">System Uptime</div>
          </motion.div>
          <motion.div
            variants={fadeInUp}
            whileHover={{ y: -3 }}
            className="p-4 rounded-xl bg-zinc-950 border border-zinc-900 text-center transition-colors hover:border-zinc-800"
          >
            <div className="text-2xl font-bold text-white">100%</div>
            <div className="text-xs text-zinc-500 mt-1">RLS Tenant Isolated</div>
          </motion.div>
        </motion.div>
      </section>

      {/* Features Grid */}
      <section id="features" className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeInUp}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight">
            Comprehensive SACCO Features
          </h2>
          <p className="text-zinc-400 text-sm mt-3">
            Engineered from the ground up to digitize cooperative banking workflows.
          </p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={staggerContainer}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {[
            {
              icon: Users,
              title: "Member Onboarding & KYC",
              desc: "Complete digital member registration with National ID verification, passport photo capture, Next-of-Kin records, and linked Mobile Money accounts.",
            },
            {
              icon: PieChart,
              title: "Share Capital & Dividends",
              desc: "Track member share ownership, share purchase registers, configurable share values, and automated dividend calculations.",
            },
            {
              icon: PiggyBank,
              title: "Savings & Fixed Deposits",
              desc: "Manage voluntary savings accounts, fixed deposit terms, automated interest accruals, and transaction deposit/withdrawal logs.",
            },
            {
              icon: CreditCard,
              title: "Member Loan Processing",
              desc: "Configure loan products, guarantor approvals, flat or reducing interest formulas, repayment schedules, and automated arrears tracking.",
            },
            {
              icon: Shield,
              title: "PostgreSQL RLS Security",
              desc: "Multi-tenant data isolation enforced at the database level. Each SACCO's records are strictly isolated.",
            },
            {
              icon: MessageSquare,
              title: "Member Support Live Chat",
              desc: "Real-time Socket.IO messaging connecting members directly with SACCO staff through the client portal.",
            },
          ].map((item, idx) => (
            <motion.div key={idx} variants={fadeInUp} whileHover={{ y: -5 }}>
              <Card className="bg-zinc-950 border-zinc-900 hover:border-orange-500/40 transition-all rounded-xl h-full">
                <CardHeader className="p-6">
                  <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-orange-500 mb-4">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg font-bold text-white">{item.title}</CardTitle>
                  <CardDescription className="text-zinc-400 text-xs mt-1 leading-relaxed">
                    {item.desc}
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Core SACCO Modules Breakdown */}
      <section id="modules" className="relative z-10 py-20 bg-zinc-950/50 border-y border-zinc-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="text-center max-w-2xl mx-auto mb-16"
          >
            <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight">
              Built on Three Core SACCO Pillars
            </h2>
            <p className="text-zinc-400 text-sm mt-3">
              Mikopo seamlessly handles the core financial responsibilities of modern cooperatives.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            <motion.div
              variants={fadeInUp}
              whileHover={{ y: -4 }}
              className="p-8 rounded-xl bg-black border border-zinc-800 flex flex-col justify-between"
            >
              <div>
                <span className="text-xs font-semibold uppercase text-orange-500 tracking-wider">
                  Pillar 1
                </span>
                <h3 className="text-xl font-bold text-white mt-2 mb-3">Share Capital</h3>
                <p className="text-zinc-400 text-xs leading-relaxed mb-6">
                  Manage member share ownership, share minimums, fractional shares, and annual dividend distributions.
                </p>
                <ul className="space-y-2.5 text-xs text-zinc-300">
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-orange-500" /> Share purchase registers
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-orange-500" /> Configurable share value
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-orange-500" /> Automated dividend calculations
                  </li>
                </ul>
              </div>
              <div className="pt-6 mt-6 border-t border-zinc-900">
                <Link href="/login-select" className="block w-full">
                  <Button className="w-full bg-orange-500 hover:bg-orange-600 text-black font-semibold text-xs h-9">
                    Manage Shares
                  </Button>
                </Link>
              </div>
            </motion.div>

            <motion.div
              variants={fadeInUp}
              whileHover={{ y: -4 }}
              className="p-8 rounded-xl bg-black border border-zinc-800 flex flex-col justify-between"
            >
              <div>
                <span className="text-xs font-semibold uppercase text-orange-500 tracking-wider">
                  Pillar 2
                </span>
                <h3 className="text-xl font-bold text-white mt-2 mb-3">Savings & Deposits</h3>
                <p className="text-zinc-400 text-xs leading-relaxed mb-6">
                  Manage voluntary member savings, fixed deposit terms, opening balances, and deposit receipts.
                </p>
                <ul className="space-y-2.5 text-xs text-zinc-300">
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-orange-500" /> Voluntary savings ledger
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-orange-500" /> Fixed deposit maturity tracking
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-orange-500" /> In-SACCO fund transfers
                  </li>
                </ul>
              </div>
              <div className="pt-6 mt-6 border-t border-zinc-900">
                <Link href="/login-select" className="block w-full">
                  <Button variant="outline" className="w-full border-zinc-800 text-zinc-300 text-xs h-9">
                    Manage Savings
                  </Button>
                </Link>
              </div>
            </motion.div>

            <motion.div
              variants={fadeInUp}
              whileHover={{ y: -4 }}
              className="p-8 rounded-xl bg-black border border-zinc-800 flex flex-col justify-between"
            >
              <div>
                <span className="text-xs font-semibold uppercase text-orange-500 tracking-wider">
                  Pillar 3
                </span>
                <h3 className="text-xl font-bold text-white mt-2 mb-3">Member Credit</h3>
                <p className="text-zinc-400 text-xs leading-relaxed mb-6">
                  End-to-end loan application processing, guarantor approvals, interest formulas, and repayment schedules.
                </p>
                <ul className="space-y-2.5 text-xs text-zinc-300">
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-orange-500" /> Guarantor approval workflows
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-orange-500" /> Reducing & flat interest engines
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-orange-500" /> Automated repayment schedules
                  </li>
                </ul>
              </div>
              <div className="pt-6 mt-6 border-t border-zinc-900">
                <Link href="/login-select" className="block w-full">
                  <Button variant="outline" className="w-full border-zinc-800 text-zinc-300 text-xs h-9">
                    Manage Credit
                  </Button>
                </Link>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeInUp}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight">
            Transparent SACCO Pricing
          </h2>
          <p className="text-zinc-400 text-sm mt-3">
            Predictable plans designed to grow with your SACCO member base.
          </p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto"
        >
          <motion.div
            variants={fadeInUp}
            whileHover={{ y: -4 }}
            className="p-6 rounded-xl bg-zinc-950 border border-zinc-900 flex flex-col justify-between"
          >
            <div>
              <h3 className="text-lg font-bold text-white">Starter SACCO</h3>
              <div className="my-4">
                <span className="text-3xl font-extrabold text-white">UGX 150K</span>
                <span className="text-zinc-500 text-xs"> / month</span>
              </div>
              <p className="text-zinc-400 text-xs mb-6">Up to 500 Active Members</p>
              <ul className="space-y-2 text-xs text-zinc-300">
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-orange-500" /> Full Loan & Savings Engine
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-orange-500" /> Member KYC Vault
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-orange-500" /> Financial Reports Export
                </li>
              </ul>
            </div>
            <div className="pt-6">
              <Link href="/login-select" className="block w-full">
                <Button variant="outline" className="w-full border-zinc-800 text-zinc-300 text-xs h-9">
                  Get Started
                </Button>
              </Link>
            </div>
          </motion.div>

          <motion.div
            variants={fadeInUp}
            whileHover={{ y: -4 }}
            className="p-6 rounded-xl bg-black border-2 border-orange-500 flex flex-col justify-between relative shadow-lg shadow-orange-500/10"
          >
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-orange-500 bg-orange-500/10 px-2.5 py-1 rounded-full border border-orange-500/20">
                Most Popular
              </span>
              <h3 className="text-lg font-bold text-white mt-3">Growth SACCO</h3>
              <div className="my-4">
                <span className="text-3xl font-extrabold text-orange-500">UGX 450K</span>
                <span className="text-zinc-500 text-xs"> / month</span>
              </div>
              <p className="text-zinc-400 text-xs mb-6">Up to 5,000 Active Members</p>
              <ul className="space-y-2 text-xs text-zinc-300">
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-orange-500" /> Share Capital & Dividends
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-orange-500" /> Multi-Branch Support
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-orange-500" /> Member Live Chat Support
                </li>
              </ul>
            </div>
            <div className="pt-6">
              <Link href="/login-select" className="block w-full">
                <Button className="w-full bg-orange-500 hover:bg-orange-600 text-black font-semibold text-xs h-9">
                  Launch Growth Plan
                </Button>
              </Link>
            </div>
          </motion.div>

          <motion.div
            variants={fadeInUp}
            whileHover={{ y: -4 }}
            className="p-6 rounded-xl bg-zinc-950 border border-zinc-900 flex flex-col justify-between"
          >
            <div>
              <h3 className="text-lg font-bold text-white">Enterprise SACCO</h3>
              <div className="my-4">
                <span className="text-3xl font-extrabold text-white">Custom</span>
              </div>
              <p className="text-zinc-400 text-xs mb-6">Unlimited Members & Dedicated Instance</p>
              <ul className="space-y-2 text-xs text-zinc-300">
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-orange-500" /> Dedicated Database Instance
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-orange-500" /> Custom API & Mobile Integrations
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-orange-500" /> 24/7 SLA Priority Support
                </li>
              </ul>
            </div>
            <div className="pt-6">
              <Link href="/contact" className="block w-full">
                <Button variant="outline" className="w-full border-zinc-800 text-zinc-300 text-xs h-9">
                  Contact Team
                </Button>
              </Link>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="relative z-10 py-20 bg-zinc-950/50 border-t border-zinc-900">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="text-center mb-12"
          >
            <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight">
              Frequently Asked Questions
            </h2>
          </motion.div>

          <div className="space-y-3">
            {[
              {
                q: "Is member data secure and isolated between SACCOs?",
                a: "Yes. Mikopo enforces strict multi-tenant isolation at the database layer using PostgreSQL Row-Level Security (RLS). Each SACCO's data is completely isolated.",
              },
              {
                q: "Can members check savings & loan balances on mobile phones?",
                a: "Yes. Mikopo features a responsive Member Portal (/client-login) where members can review savings balances, active loan repayments, and chat with support.",
              },
              {
                q: "Does Mikopo calculate annual member share dividends?",
                a: "Yes. Mikopo includes a dedicated Share Capital module where you can manage share holdings, set share values, and calculate dividend distributions.",
              },
            ].map((faq, idx) => (
              <div key={idx} className="bg-black border border-zinc-900 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full px-5 py-4 text-left flex justify-between items-center text-sm font-semibold text-zinc-200 hover:text-orange-400 transition-colors"
                >
                  <span>{faq.q}</span>
                  {activeFaq === idx ? (
                    <ChevronUp className="h-4 w-4 text-orange-500 shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-zinc-600 shrink-0" />
                  )}
                </button>
                <AnimatePresence>
                  {activeFaq === idx && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="px-5 pb-4 text-xs text-zinc-400 border-t border-zinc-900/80 pt-3 leading-relaxed"
                    >
                      {faq.a}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 bg-black border-t border-zinc-900 text-zinc-500 py-12 px-4 sm:px-6 lg:px-8 text-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center space-x-3">
            <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center">
              <Coins className="h-4 w-4 text-black" />
            </div>
            <span className="text-base font-bold text-white">NYUKI.</span>
            <span className="text-zinc-600">|</span>
            <span>Digital SACCO Management System</span>
          </div>

          <div className="flex items-center space-x-6">
            <Link href="/login-select" className="hover:text-zinc-300 transition-colors">
              Login Portal
            </Link>
            <Link href="/privacy" className="hover:text-zinc-300 transition-colors">
              Privacy
            </Link>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-8 pt-6 border-t border-zinc-900/60 text-center text-zinc-600 text-[11px]">
          © {new Date().getFullYear()} Nyuki Platform. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
