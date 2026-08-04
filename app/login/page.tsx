"use client"

import type React from "react"
import { Suspense, useState } from "react"
import { signIn } from "next-auth/react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  Loader2,
  Shield,
  ArrowRight,
  Sparkles,
  TrendingUp,
  Users,
  Settings,
  Coins,
} from "lucide-react"
import { useToast } from "@/components/ui/toast"
import { LOGIN_ERROR_MESSAGES, LOGIN_SUCCESS_MESSAGES, resolveSignInErrorMessage } from "@/lib/auth-login-messages"
import { isAllowedInstitutionRedirect } from "@/lib/institution-protected-routes"
import { showPostLoginGreetingToast } from "@/lib/greeting"
import { seedStaffSessionFromAuthUser } from "@/lib/staff-session-hydration"

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-950">
          <Loader2 className="h-6 w-6 animate-spin text-[#f08c2b]" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})

  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get("redirect") || "/dashboard"
  const { toast } = useToast()

  const showLoginError = (message: string) => {
    toast({
      variant: "destructive",
      title: "Sign in failed",
      description: message,
    })
  }

  const showLoginSuccess = () => {
    toast({
      variant: "success",
      title: "Signed in successfully",
      description: LOGIN_SUCCESS_MESSAGES.institution,
    })
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isLoading) return

    const newErrors: { email?: string; password?: string } = {}
    if (!email.trim()) {
      newErrors.email = "Email address is required"
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email.trim())) {
        newErrors.email = "Please enter a valid email address"
      }
    }

    if (!password) {
      newErrors.password = "Password is required"
    } else if (password.length < 6) {
      newErrors.password = "Password must be at least 6 characters"
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setErrors({})
    setIsLoading(true)

    try {
      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        loginContext: "institution",
        redirect: false,
      })

      if (result?.error) {
        throw new Error(resolveSignInErrorMessage(result.error))
      }
      if (!result?.ok) {
        throw new Error(LOGIN_ERROR_MESSAGES.signInFailed)
      }

      const sessionRes = await fetch("/api/auth/session")
      const session = sessionRes.ok ? await sessionRes.json() : null

      if (session?.user?.type === "client") {
        showLoginError(LOGIN_ERROR_MESSAGES.useClientLogin)
        return
      }

      seedStaffSessionFromAuthUser(session.user)

      let target = redirectTo
      if (typeof target !== "string" || !isAllowedInstitutionRedirect(target)) {
        target = "/dashboard"
      }

      showLoginSuccess()
      showPostLoginGreetingToast(toast, session?.user?.name)
      router.push(target)
      router.refresh()
    } catch (err: any) {
      showLoginError(err?.message || LOGIN_ERROR_MESSAGES.signInFailed)
    } finally {
      setIsLoading(false)
    }
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.6,
        staggerChildren: 0.1,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  }

  const features = [
    { icon: Shield, title: "Postgres RLS Security", desc: "Multi-tenant data protection" },
    { icon: TrendingUp, title: "SACCO Accounting", desc: "Real-time ledger analytics" },
    { icon: Users, title: "Member Management", desc: "KYC & Share registers" },
    { icon: Settings, title: "Configurable Modules", desc: "Flexible SACCO settings" },
  ]

  return (
    <div className="min-h-screen w-full bg-white flex flex-col lg:flex-row overflow-hidden selection:bg-[#f08c2b] selection:text-black">
      {/* ── Left: Dark Black & Orange Brand & Features Showcase ── */}
      <motion.div
        className="hidden lg:flex flex-1 bg-gradient-to-br from-black via-zinc-950 to-[#180d04] items-center rounded-br-[8rem] rounded-r-2xl justify-center p-12 relative overflow-hidden border-r border-zinc-900"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Animated Background Orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-[#f08c2b]/15 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-[#f08c2b]/5 rounded-full blur-3xl" />
        </div>

        {/* Grid Pattern Overlay */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute inset-0 bg-[radial-gradient(#f08c2b_1px,transparent_1px)] [background-size:24px_24px]" />
        </div>

        <div className="max-w-lg text-center relative z-10">
          {/* Logo & Brand Showcase */}
          <motion.div className="relative mb-10" variants={itemVariants}>
            <div className="w-64 h-64 mx-auto bg-zinc-900/80 backdrop-blur-md rounded-3xl shadow-2xl flex flex-col items-center justify-center p-8 border border-white/10 group">
              <div className="w-20 h-20 rounded-2xl bg-[#f08c2b] flex items-center justify-center shadow-xl shadow-[#f08c2b]/30 mb-4 transform group-hover:scale-105 transition-transform duration-300">
                <Coins className="h-10 w-10 text-black" />
              </div>
              <span className="text-3xl font-black tracking-tight text-white flex items-center">
                MIKOPO<span className="text-[#f08c2b] ml-0.5">.</span>
              </span>
              <span className="text-xs text-zinc-400 font-mono uppercase tracking-widest mt-1">
                SACCO Management Engine
              </span>
            </div>

            {/* Floating Elements */}
            <motion.div
              className="absolute top-6 right-6 w-6 h-6 bg-[#f08c2b]/30 rounded-full blur-[1px]"
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
            />
            <motion.div
              className="absolute bottom-6 left-6 w-4 h-4 bg-white/20 rounded-full"
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 2.5, repeat: Number.POSITIVE_INFINITY }}
            />
            <motion.div
              className="absolute top-1/2 left-2 w-3 h-3 bg-[#f08c2b]/40 rounded-full"
              animate={{ x: [0, 10, 0] }}
              transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY }}
            />
          </motion.div>

          {/* Feature Cards Grid */}
          <motion.div className="space-y-4" variants={itemVariants}>
            <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-2">
              Professional SACCO Infrastructure
            </h3>
            <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
              Empowering Savings and Credit Cooperatives across Africa with automated credit, savings, and share capital ledgers.
            </p>

            <div className="grid grid-cols-2 gap-4">
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  className="bg-zinc-900/70 backdrop-blur-md rounded-xl p-4 border border-white/10 hover:border-[#f08c2b]/40 hover:bg-zinc-900 transition-all duration-300 text-left"
                  whileHover={{ scale: 1.03, y: -2 }}
                  variants={itemVariants}
                >
                  <feature.icon className="w-5 h-5 text-[#f08c2b] mb-2" />
                  <h4 className="text-white font-bold text-xs mb-0.5">{feature.title}</h4>
                  <p className="text-zinc-400 text-[11px] leading-tight">{feature.desc}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* ── Right: Clean White Form Container ── */}
      <motion.div
        className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-14 relative z-10 bg-white"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="w-full max-w-md space-y-8">
          {/* Logo & Brand Header */}
          <motion.div className="text-center" variants={itemVariants}>
            <Link href="/" className="inline-flex items-center gap-3 mb-3 group">
              <div className="w-12 h-12 rounded-xl bg-[#f08c2b] flex items-center justify-center shadow-lg shadow-[#f08c2b]/25 group-hover:scale-105 transition-transform">
                <Coins className="h-6 w-6 text-black" />
              </div>
              <span className="text-2xl font-black tracking-tight text-zinc-900 flex items-center">
                MIKOPO<span className="text-[#f08c2b] ml-0.5">.</span>
              </span>
            </Link>
            <p className="text-xs font-mono font-semibold uppercase tracking-widest text-[#f08c2b]">
              Staff Dashboard Terminal
            </p>
          </motion.div>

          {/* Welcome Section */}
          <motion.div className="text-center space-y-1.5" variants={itemVariants}>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 tracking-tight">
              Welcome Back
            </h2>
            <p className="text-zinc-500 text-sm">
              Sign in to manage your SACCO workspace & accounts
            </p>
          </motion.div>

          {/* Login Form */}
          <motion.form
            onSubmit={handleSubmit}
            className="space-y-6"
            variants={itemVariants}
            noValidate
            aria-label="Staff Login Form"
          >
            <div className="space-y-5">
              {/* Email Field */}
              <div className="space-y-2">
                <label htmlFor="email" className="text-zinc-700 font-semibold text-xs flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-[#f08c2b]" />
                  Email Address
                </label>
                <div className="relative">
                  <input
                    id="email"
                    type="email"
                    placeholder="you@institution.com"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }))
                    }}
                    autoComplete="email"
                    autoFocus
                    className={`w-full h-12 px-4 pl-11 rounded-xl border-2 text-sm text-zinc-900 bg-white placeholder:text-zinc-400 transition-all duration-200 outline-none ${
                      errors.email
                        ? "border-red-400 bg-red-50/50"
                        : "border-zinc-200 hover:border-[#f08c2b]/40 focus:border-[#f08c2b] focus:ring-4 focus:ring-[#f08c2b]/15"
                    }`}
                  />
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
                </div>
                <AnimatePresence>
                  {errors.email && (
                    <motion.p
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="text-red-500 text-xs font-medium pt-0.5"
                    >
                      {errors.email}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <label htmlFor="password" className="text-zinc-700 font-semibold text-xs flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-[#f08c2b]" />
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }))
                    }}
                    autoComplete="current-password"
                    className={`w-full h-12 px-4 pl-11 pr-11 rounded-xl border-2 text-sm text-zinc-900 bg-white placeholder:text-zinc-400 transition-all duration-200 outline-none ${
                      errors.password
                        ? "border-red-400 bg-red-50/50"
                        : "border-zinc-200 hover:border-[#f08c2b]/40 focus:border-[#f08c2b] focus:ring-4 focus:ring-[#f08c2b]/15"
                    }`}
                  />
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 transition-colors"
                    aria-label="Toggle password visibility"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <AnimatePresence>
                  {errors.password && (
                    <motion.p
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="text-red-500 text-xs font-medium pt-0.5"
                    >
                      {errors.password}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Remember Me & Client Link */}
            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-zinc-600 hover:text-zinc-900">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 text-[#f08c2b] bg-zinc-100 border-zinc-300 rounded focus:ring-[#f08c2b] focus:ring-2 accent-[#f08c2b]"
                />
                <span className="font-medium">Remember me</span>
              </label>
              <Link href="/client-login" className="text-[#f08c2b] hover:underline font-semibold">
                Member Portal?
              </Link>
            </div>

            {/* Submit Button */}
            <motion.button
              whileHover={{ scale: isLoading ? 1 : 1.01 }}
              whileTap={{ scale: isLoading ? 1 : 0.99 }}
              type="submit"
              disabled={isLoading}
              className={`w-full h-12 bg-gradient-to-r from-zinc-900 via-black to-[#f08c2b] text-white rounded-xl font-extrabold text-sm transition-all duration-200 shadow-xl shadow-black/10 hover:shadow-2xl ${
                isLoading ? "opacity-70 cursor-not-allowed" : ""
              }`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Signing in to Staff Portal...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4 text-[#f08c2b]" />
                </div>
              )}
            </motion.button>

            {/* Navigation back */}
            <div className="text-center pt-2">
              <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-800 transition-colors inline-flex items-center gap-1 font-medium">
                ← Back to Homepage
              </Link>
            </div>
          </motion.form>
        </div>
      </motion.div>
    </div>
  )
}
