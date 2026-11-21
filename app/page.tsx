"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { motion, AnimatePresence, useScroll, useSpring, animate } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Users,
  CreditCard,
  PiggyBank,
  Shield,
  ArrowRight,
  ArrowUp,
  LogIn,
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

const NAV_ITEMS = [
  { id: "features", label: "Features" },
  { id: "modules", label: "SACCO Modules" },
  { id: "pricing", label: "Pricing" },
  { id: "faq", label: "FAQ" },
] as const

type NavSectionId = (typeof NAV_ITEMS)[number]["id"]

// Animation Variants
const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
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
  const [activeSection, setActiveSection] = useState<NavSectionId | null>(null)
  const [isScrolled, setIsScrolled] = useState(false)
  const [showBackToTop, setShowBackToTop] = useState(false)

  const headerRef = useRef<HTMLElement | null>(null)
  const scrollAnimRef = useRef<ReturnType<typeof animate> | null>(null)
  const isProgrammaticScrollRef = useRef(false)

  const { scrollYProgress } = useScroll()
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 260,
    damping: 32,
    restDelta: 0.001,
  })

  const cancelActiveScroll = useCallback(() => {
    if (scrollAnimRef.current) {
      scrollAnimRef.current.stop()
      scrollAnimRef.current = null
    }
    isProgrammaticScrollRef.current = false
  }, [])

  const animateScrollToY = useCallback(
    (targetY: number, onDone?: () => void) => {
      cancelActiveScroll()

      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches

      const clampedTarget = Math.max(
        0,
        Math.min(targetY, document.documentElement.scrollHeight - window.innerHeight),
      )

      if (prefersReducedMotion || Math.abs(window.scrollY - clampedTarget) < 2) {
        window.scrollTo(0, clampedTarget)
        onDone?.()
        return
      }

      isProgrammaticScrollRef.current = true
      const distance = Math.abs(clampedTarget - window.scrollY)
      const duration = Math.min(0.95, Math.max(0.45, distance / 2400))

      scrollAnimRef.current = animate(window.scrollY, clampedTarget, {
        duration,
        ease: [0.22, 1, 0.36, 1],
        onUpdate: (latest) => {
          window.scrollTo(0, latest)
        },
        onComplete: () => {
          scrollAnimRef.current = null
          isProgrammaticScrollRef.current = false
          onDone?.()
        },
      })
    },
    [cancelActiveScroll],
  )

  const handleNavClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, sectionId: NavSectionId) => {
      e.preventDefault()
      const wasMenuOpen = isMenuOpen
      if (wasMenuOpen) setIsMenuOpen(false)

      setActiveSection(sectionId)

      const scrollNow = () => {
        const el = document.getElementById(sectionId)
        if (!el) return
        const headerOffset = (headerRef.current?.offsetHeight ?? 72) + 8
        const targetY = el.getBoundingClientRect().top + window.scrollY - headerOffset
        animateScrollToY(targetY, () => {
          if (typeof window !== "undefined") {
            window.history.replaceState(null, "", `#${sectionId}`)
          }
        })
      }

      if (wasMenuOpen) {
        window.setTimeout(scrollNow, 180)
      } else {
        scrollNow()
      }
    },
    [animateScrollToY, isMenuOpen],
  )

  const handleScrollToTop = useCallback(
    (e?: React.MouseEvent) => {
      e?.preventDefault()
      setIsMenuOpen(false)
      setActiveSection(null)
      animateScrollToY(0, () => {
        if (typeof window !== "undefined" && window.location.hash) {
          window.history.replaceState(null, "", window.location.pathname)
        }
      })
    },
    [animateScrollToY],
  )

  // Cancel programmatic scroll immediately if user takes over via wheel, touch, or keyboard
  useEffect(() => {
    const onUserScrollIntent = () => {
      if (isProgrammaticScrollRef.current) {
        cancelActiveScroll()
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        isProgrammaticScrollRef.current &&
        ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key)
      ) {
        cancelActiveScroll()
      }
    }

    window.addEventListener("wheel", onUserScrollIntent, { passive: true })
    window.addEventListener("touchstart", onUserScrollIntent, { passive: true })
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("wheel", onUserScrollIntent)
      window.removeEventListener("touchstart", onUserScrollIntent)
      window.removeEventListener("keydown", onKeyDown)
      cancelActiveScroll()
    }
  }, [cancelActiveScroll])

  // Scroll spy for active nav highlight, sticky header elevation, and back-to-top button
  useEffect(() => {
    const updateScrollState = () => {
      const y = window.scrollY
      setIsScrolled(y > 24)
      setShowBackToTop(y > 480)

      if (isProgrammaticScrollRef.current) return

      const headerOffset = (headerRef.current?.offsetHeight ?? 72) + 80
      const scrollMarker = y + headerOffset

      // If near the bottom of the page, highlight the last section
      const nearBottom =
        window.innerHeight + y >= document.documentElement.scrollHeight - 40
      if (nearBottom) {
        setActiveSection(NAV_ITEMS[NAV_ITEMS.length - 1].id)
        return
      }

      let current: NavSectionId | null = null
      for (const item of NAV_ITEMS) {
        const section = document.getElementById(item.id)
        if (!section) continue
        if (scrollMarker >= section.offsetTop) {
          current = item.id
        }
      }
      setActiveSection(current)
    }

    updateScrollState()
    window.addEventListener("scroll", updateScrollState, { passive: true })
    window.addEventListener("resize", updateScrollState, { passive: true })
    return () => {
      window.removeEventListener("scroll", updateScrollState)
      window.removeEventListener("resize", updateScrollState)
    }
  }, [])

  // Handle initial hash on direct load (e.g., /#pricing)
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "") as NavSectionId
    if (!NAV_ITEMS.some((item) => item.id === hash)) return
    const timer = window.setTimeout(() => {
      const el = document.getElementById(hash)
      if (!el) return
      const headerOffset = (headerRef.current?.offsetHeight ?? 72) + 8
      setActiveSection(hash)
      animateScrollToY(el.getBoundingClientRect().top + window.scrollY - headerOffset)
    }, 120)
    return () => window.clearTimeout(timer)
  }, [animateScrollToY])

  const toggleFaq = (index: number) => {
    setActiveFaq(activeFaq === index ? null : index)
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 selection:bg-brand/20 selection:text-brand font-sans antialiased overflow-x-clip transition-colors duration-200">
      {/* Dynamic Animated Background Glow */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.15, 0.25, 0.15],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-gradient-to-b from-brand/25 via-brand/5 to-transparent blur-3xl"
        />
      </div>

      {/* Header Navigation - z-40 so floating theme switcher (z-[100]) is on top */}
      <header
        ref={headerRef}
        className={`sticky top-0 z-40 backdrop-blur-xl border-b transition-all duration-300 ${
          isScrolled
            ? "bg-white/95 dark:bg-black/90 border-zinc-200/90 dark:border-zinc-800/90 shadow-md shadow-black/[0.04] dark:shadow-black/40"
            : "bg-white/80 dark:bg-black/80 border-zinc-200/70 dark:border-zinc-900"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className={`flex justify-between items-center transition-all duration-300 ${
              isScrolled ? "h-16" : "h-20"
            }`}
          >
            {/* Brand Logo */}
            <Link href="/" onClick={handleScrollToTop} className="flex items-center space-x-3 group">
              <motion.div
                whileHover={{ scale: 1.05, rotate: 5 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center shadow-lg shadow-brand/25 text-brand-foreground"
              >
                <Coins className="h-5 w-5" />
              </motion.div>
              <div className="flex flex-col">
                <span className="text-xl font-bold tracking-tight text-zinc-950 dark:text-white flex items-center">
                  NYUKI<span className="text-brand ml-0.5">.</span>
                </span>
                <span className="text-[10px] tracking-widest text-zinc-500 dark:text-zinc-400 uppercase font-mono -mt-1">
                  SACCO Management System
                </span>
              </div>
            </Link>

            {/* Desktop Navigation Links with Animated Scroll-Spy Indicator */}
            <nav aria-label="Primary" className="hidden md:flex items-center space-x-1 text-sm font-medium">
              {NAV_ITEMS.map((item) => {
                const isActive = activeSection === item.id
                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    onClick={(e) => handleNavClick(e, item.id)}
                    aria-current={isActive ? "location" : undefined}
                    className={`relative px-3.5 py-2 rounded-lg transition-colors duration-200 ${
                      isActive
                        ? "text-brand font-semibold"
                        : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="homepage-nav-pill"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        className="absolute inset-0 z-0 rounded-lg bg-brand/10 border border-brand/20"
                      />
                    )}
                    <span className="relative z-10">{item.label}</span>
                    {isActive && (
                      <motion.span
                        layoutId="homepage-nav-underline"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        className="absolute left-3 right-3 -bottom-0.5 h-0.5 rounded-full bg-brand"
                      />
                    )}
                  </a>
                )
              })}
            </nav>

            {/* Header Actions - right margin leaves space for the floating theme palette */}
            <div className="hidden md:flex items-center mr-32 sm:mr-36">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/10 px-4 py-2 text-sm font-semibold text-brand shadow-xs transition-all duration-200 hover:bg-brand hover:text-brand-foreground hover:border-brand hover:shadow-md hover:shadow-brand/20 group"
              >
                <LogIn className="h-4 w-4" />
                <span>Login</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </div>

            {/* Mobile Menu Button - right margin avoids collision with palette switcher */}
            <div className="md:hidden mr-28">
              <Button
                variant="ghost"
                size="icon"
                aria-label={isMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={isMenuOpen}
                className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Smooth Scroll Progress Bar */}
        <motion.div
          style={{ scaleX: smoothProgress }}
          className="h-[2px] w-full origin-left bg-brand/90 pointer-events-none"
          aria-hidden="true"
        />

        {/* Mobile Navigation Menu Animation */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="md:hidden bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 px-4 pt-4 pb-6 space-y-1.5 overflow-hidden shadow-xl"
            >
              {NAV_ITEMS.map((item, idx) => {
                const isActive = activeSection === item.id
                return (
                  <motion.a
                    key={item.id}
                    href={`#${item.id}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: idx * 0.04 }}
                    onClick={(e) => handleNavClick(e, item.id)}
                    aria-current={isActive ? "location" : undefined}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-brand/10 text-brand font-semibold border border-brand/20"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-950 dark:hover:text-white"
                    }`}
                  >
                    <span>{item.label}</span>
                    {isActive && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
                  </motion.a>
                )
              })}
              <div className="pt-3 mt-2 border-t border-zinc-200 dark:border-zinc-900">
                <Link
                  href="/login"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-base font-semibold text-brand hover:brightness-110 transition-colors group"
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
            <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800">
              <Sparkles className="h-3.5 w-3.5 text-brand animate-pulse" />
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Digital SACCO Management System
              </span>
            </div>
          </motion.div>

          {/* Main Title */}
          <motion.h1
            variants={fadeInUp}
            className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-zinc-950 dark:text-white leading-[1.1]"
          >
            Modern Operations for African <br className="hidden sm:block" />
            <span className="text-brand">SACCOs & Credit Cooperatives</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            variants={fadeInUp}
            className="text-base sm:text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto leading-relaxed"
          >
            A unified digital operating system built specifically for SACCOs. Manage member KYC, track share capital, automate loan processing, manage savings accounts, and calculate dividend distributions.
          </motion.p>

          {/* Hero Actions */}
          <motion.div
            variants={fadeInUp}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-5"
          >
            <Link href="/login" className="group relative w-full sm:w-auto inline-flex justify-center">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-1 rounded-2xl bg-gradient-to-r from-brand-400 via-brand to-brand-700 opacity-35 blur-lg transition-opacity duration-300 group-hover:opacity-60"
              />
              <motion.span
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 420, damping: 24 }}
                className="relative inline-flex w-full sm:w-auto items-center justify-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-brand-500 via-brand to-brand-700 px-7 py-3.5 text-sm font-bold tracking-tight text-brand-foreground shadow-xl shadow-brand/30 ring-1 ring-inset ring-white/20 transition-all duration-200"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
                />
                <LogIn className="relative h-4 w-4 shrink-0" />
                <span className="relative">Login to Portal</span>
                <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-current/15 transition-transform duration-200 group-hover:translate-x-0.5">
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </motion.span>
            </Link>
          </motion.div>
        </motion.div>

        {/* Metrics Bar with Scroll Stagger */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={staggerContainer}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-20 pt-10 border-t border-zinc-200 dark:border-zinc-900"
        >
          <motion.div
            variants={fadeInUp}
            whileHover={{ y: -3 }}
            className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 text-center transition-colors hover:border-brand/30 dark:hover:border-zinc-800"
          >
            <div className="text-2xl font-bold text-zinc-950 dark:text-white">UGX 45B+</div>
            <div className="text-xs text-zinc-500 mt-1">SACCO Loans Tracked</div>
          </motion.div>
          <motion.div
            variants={fadeInUp}
            whileHover={{ y: -3 }}
            className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 text-center transition-colors hover:border-brand/30 dark:hover:border-zinc-800"
          >
            <div className="text-2xl font-bold text-zinc-950 dark:text-white">120K+</div>
            <div className="text-xs text-zinc-500 mt-1">Active SACCO Members</div>
          </motion.div>
          <motion.div
            variants={fadeInUp}
            whileHover={{ y: -3 }}
            className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 text-center transition-colors hover:border-brand/30 dark:hover:border-zinc-800"
          >
            <div className="text-2xl font-bold text-brand">99.9%</div>
            <div className="text-xs text-zinc-500 mt-1">System Uptime</div>
          </motion.div>
          <motion.div
            variants={fadeInUp}
            whileHover={{ y: -3 }}
            className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 text-center transition-colors hover:border-brand/30 dark:hover:border-zinc-800"
          >
            <div className="text-2xl font-bold text-zinc-950 dark:text-white">100%</div>
            <div className="text-xs text-zinc-500 mt-1">RLS Tenant Isolated</div>
          </motion.div>
        </motion.div>
      </section>

      {/* Features Grid */}
      <section id="features" className="relative z-10 scroll-mt-24 py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeInUp}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <h2 className="text-2xl sm:text-4xl font-bold text-zinc-950 dark:text-white tracking-tight">
            Comprehensive SACCO Features
          </h2>
          <p className="text-zinc-600 dark:text-zinc-400 text-sm mt-3">
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
              <Card className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-900 hover:border-brand/40 transition-all rounded-xl h-full shadow-xs hover:shadow-md">
                <CardHeader className="p-6">
                  <div className="w-10 h-10 rounded-lg bg-brand/10 dark:bg-zinc-900 border border-brand/20 dark:border-zinc-800 flex items-center justify-center text-brand mb-4">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg font-bold text-zinc-950 dark:text-white">{item.title}</CardTitle>
                  <CardDescription className="text-zinc-600 dark:text-zinc-400 text-xs mt-1 leading-relaxed">
                    {item.desc}
                  </CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Core SACCO Modules Breakdown */}
      <section id="modules" className="relative z-10 scroll-mt-24 py-20 bg-zinc-50/80 dark:bg-zinc-950/50 border-y border-zinc-200 dark:border-zinc-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="text-center max-w-2xl mx-auto mb-16"
          >
            <h2 className="text-2xl sm:text-4xl font-bold text-zinc-950 dark:text-white tracking-tight">
              Built on Three Core SACCO Pillars
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 text-sm mt-3">
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
              className="p-8 rounded-xl bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between shadow-xs"
            >
              <div>
                <span className="text-xs font-semibold uppercase text-brand tracking-wider">
                  Pillar 1
                </span>
                <h3 className="text-xl font-bold text-zinc-950 dark:text-white mt-2 mb-3">Share Capital</h3>
                <p className="text-zinc-600 dark:text-zinc-400 text-xs leading-relaxed mb-6">
                  Manage member share ownership, share minimums, fractional shares, and annual dividend distributions.
                </p>
                <ul className="space-y-2.5 text-xs text-zinc-700 dark:text-zinc-300">
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-brand" /> Share purchase registers
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-brand" /> Configurable share value
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-brand" /> Automated dividend calculations
                  </li>
                </ul>
              </div>
              <div className="pt-6 mt-6 border-t border-zinc-200 dark:border-zinc-900">
                <Link href="/login" className="block w-full">
                  <Button className="group w-full h-10 rounded-xl bg-brand hover:bg-brand-700 text-brand-foreground font-semibold text-xs shadow-sm shadow-brand/25 transition-all duration-200 cursor-pointer">
                    Manage Shares
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Button>
                </Link>
              </div>
            </motion.div>

            <motion.div
              variants={fadeInUp}
              whileHover={{ y: -4 }}
              className="p-8 rounded-xl bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between shadow-xs"
            >
              <div>
                <span className="text-xs font-semibold uppercase text-brand tracking-wider">
                  Pillar 2
                </span>
                <h3 className="text-xl font-bold text-zinc-950 dark:text-white mt-2 mb-3">Savings & Deposits</h3>
                <p className="text-zinc-600 dark:text-zinc-400 text-xs leading-relaxed mb-6">
                  Manage voluntary member savings, fixed deposit terms, opening balances, and deposit receipts.
                </p>
                <ul className="space-y-2.5 text-xs text-zinc-700 dark:text-zinc-300">
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-brand" /> Voluntary savings ledger
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-brand" /> Fixed deposit maturity tracking
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-brand" /> In-SACCO fund transfers
                  </li>
                </ul>
              </div>
              <div className="pt-6 mt-6 border-t border-zinc-200 dark:border-zinc-900">
                <Link href="/login" className="block w-full">
                  <Button className="group w-full h-10 rounded-xl bg-secondary hover:bg-brand text-secondary-foreground hover:text-brand-foreground border border-border dark:border-white/15 hover:border-brand font-semibold text-xs shadow-xs transition-all duration-200 cursor-pointer">
                    Manage Savings
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Button>
                </Link>
              </div>
            </motion.div>

            <motion.div
              variants={fadeInUp}
              whileHover={{ y: -4 }}
              className="p-8 rounded-xl bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between shadow-xs"
            >
              <div>
                <span className="text-xs font-semibold uppercase text-brand tracking-wider">
                  Pillar 3
                </span>
                <h3 className="text-xl font-bold text-zinc-950 dark:text-white mt-2 mb-3">Member Credit</h3>
                <p className="text-zinc-600 dark:text-zinc-400 text-xs leading-relaxed mb-6">
                  End-to-end loan application processing, guarantor approvals, interest formulas, and repayment schedules.
                </p>
                <ul className="space-y-2.5 text-xs text-zinc-700 dark:text-zinc-300">
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-brand" /> Guarantor approval workflows
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-brand" /> Reducing & flat interest engines
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-brand" /> Automated repayment schedules
                  </li>
                </ul>
              </div>
              <div className="pt-6 mt-6 border-t border-zinc-200 dark:border-zinc-900">
                <Link href="/login" className="block w-full">
                  <Button className="group w-full h-10 rounded-xl bg-secondary hover:bg-brand text-secondary-foreground hover:text-brand-foreground border border-border dark:border-white/15 hover:border-brand font-semibold text-xs shadow-xs transition-all duration-200 cursor-pointer">
                    Manage Credit
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Button>
                </Link>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="relative z-10 scroll-mt-24 py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeInUp}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <h2 className="text-2xl sm:text-4xl font-bold text-zinc-950 dark:text-white tracking-tight">
            Transparent SACCO Pricing
          </h2>
          <p className="text-zinc-600 dark:text-zinc-400 text-sm mt-3">
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
            className="p-6 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 flex flex-col justify-between shadow-xs"
          >
            <div>
              <h3 className="text-lg font-bold text-zinc-950 dark:text-white">Starter SACCO</h3>
              <div className="my-4">
                <span className="text-3xl font-extrabold text-zinc-950 dark:text-white">UGX 150K</span>
                <span className="text-zinc-500 text-xs"> / month</span>
              </div>
              <p className="text-zinc-600 dark:text-zinc-400 text-xs mb-6">Up to 500 Active Members</p>
              <ul className="space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-brand" /> Full Loan & Savings Engine
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-brand" /> Member KYC Vault
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-brand" /> Financial Reports Export
                </li>
              </ul>
            </div>
            <div className="pt-6">
              <Link href="/login" className="block w-full">
                <Button className="group w-full h-10 rounded-xl bg-secondary hover:bg-brand text-secondary-foreground hover:text-brand-foreground border border-border dark:border-white/15 hover:border-brand font-semibold text-xs shadow-xs transition-all duration-200 cursor-pointer">
                  Get Started
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Button>
              </Link>
            </div>
          </motion.div>

          <motion.div
            variants={fadeInUp}
            whileHover={{ y: -4 }}
            className="p-6 rounded-xl bg-white dark:bg-black border-2 border-brand flex flex-col justify-between relative shadow-xl shadow-brand/15"
          >
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-brand bg-brand/10 px-2.5 py-1 rounded-full border border-brand/20">
                Most Popular
              </span>
              <h3 className="text-lg font-bold text-zinc-950 dark:text-white mt-3">Growth SACCO</h3>
              <div className="my-4">
                <span className="text-3xl font-extrabold text-brand">UGX 450K</span>
                <span className="text-zinc-500 text-xs"> / month</span>
              </div>
              <p className="text-zinc-600 dark:text-zinc-400 text-xs mb-6">Up to 5,000 Active Members</p>
              <ul className="space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-brand" /> Share Capital & Dividends
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-brand" /> Multi-Branch Support
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-brand" /> Member Live Chat Support
                </li>
              </ul>
            </div>
            <div className="pt-6">
              <Link href="/login" className="block w-full">
                <Button className="group w-full h-10 rounded-xl bg-brand hover:bg-brand-700 text-brand-foreground font-semibold text-xs shadow-md shadow-brand/25 transition-all duration-200 cursor-pointer">
                  Launch Growth Plan
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Button>
              </Link>
            </div>
          </motion.div>

          <motion.div
            variants={fadeInUp}
            whileHover={{ y: -4 }}
            className="p-6 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-900 flex flex-col justify-between shadow-xs"
          >
            <div>
              <h3 className="text-lg font-bold text-zinc-950 dark:text-white">Enterprise SACCO</h3>
              <div className="my-4">
                <span className="text-3xl font-extrabold text-zinc-950 dark:text-white">Custom</span>
              </div>
              <p className="text-zinc-600 dark:text-zinc-400 text-xs mb-6">Unlimited Members & Dedicated Instance</p>
              <ul className="space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-brand" /> Dedicated Database Instance
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-brand" /> Custom API & Mobile Integrations
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-brand" /> 24/7 SLA Priority Support
                </li>
              </ul>
            </div>
            <div className="pt-6">
              <Link href="/contact" className="block w-full">
                <Button className="group w-full h-10 rounded-xl bg-secondary hover:bg-brand text-secondary-foreground hover:text-brand-foreground border border-border dark:border-white/15 hover:border-brand font-semibold text-xs shadow-xs transition-all duration-200 cursor-pointer">
                  Contact Team
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="relative z-10 scroll-mt-24 py-20 bg-zinc-50/80 dark:bg-zinc-950/50 border-t border-zinc-200 dark:border-zinc-900">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="text-center mb-12"
          >
            <h2 className="text-2xl sm:text-4xl font-bold text-zinc-950 dark:text-white tracking-tight">
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
              <div key={idx} className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg overflow-hidden shadow-xs">
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full px-5 py-4 text-left flex justify-between items-center text-sm font-semibold text-zinc-800 dark:text-zinc-200 hover:text-brand transition-colors cursor-pointer"
                >
                  <span>{faq.q}</span>
                  {activeFaq === idx ? (
                    <ChevronUp className="h-4 w-4 text-brand shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-zinc-400 dark:text-zinc-600 shrink-0" />
                  )}
                </button>
                <AnimatePresence>
                  {activeFaq === idx && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="px-5 pb-4 text-xs text-zinc-600 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-900/80 pt-3 leading-relaxed"
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
      <footer className="relative z-10 bg-white dark:bg-black border-t border-zinc-200 dark:border-zinc-900 text-zinc-500 py-12 px-4 sm:px-6 lg:px-8 text-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center space-x-3">
            <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center text-brand-foreground shadow-xs">
              <Coins className="h-4 w-4" />
            </div>
            <span className="text-base font-bold text-zinc-950 dark:text-white">NYUKI.</span>
            <span className="text-zinc-400 dark:text-zinc-600">|</span>
            <span className="text-zinc-600 dark:text-zinc-400">Digital SACCO Management System</span>
          </div>

          <div className="flex items-center space-x-6">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => handleNavClick(e, item.id)}
                className="text-zinc-600 dark:text-zinc-400 hover:text-brand transition-colors"
              >
                {item.label}
              </a>
            ))}
            <Link href="/login" className="text-zinc-600 dark:text-zinc-400 hover:text-brand transition-colors">
              Login Portal
            </Link>
            <Link href="/privacy" className="text-zinc-600 dark:text-zinc-400 hover:text-brand transition-colors">
              Privacy
            </Link>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-900/60 text-center text-zinc-400 dark:text-zinc-600 text-[11px]">
          © {new Date().getFullYear()} Nyuki Platform. All rights reserved.
        </div>
      </footer>

      {/* Floating Back-to-Top Button */}
      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 16, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.9 }}
            whileHover={{ scale: 1.06, y: -2 }}
            whileTap={{ scale: 0.94 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={handleScrollToTop}
            aria-label="Scroll back to top"
            className="fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-lg shadow-brand/30 ring-1 ring-brand/40 hover:brightness-105 cursor-pointer"
          >
            <ArrowUp className="h-5 w-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
