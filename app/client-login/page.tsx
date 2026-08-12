"use client"

import { useEffect, useState, Suspense } from "react"
import { signIn, useSession } from "next-auth/react"
import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Eye, EyeOff, Lock, Mail, Loader2, Shield, ArrowRight, Sparkles, AlertCircle, Coins } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import { LOGIN_ERROR_MESSAGES, LOGIN_SUCCESS_MESSAGES, resolveSignInErrorMessage } from "@/lib/auth-login-messages"
import { showPostLoginGreetingToast } from "@/lib/greeting"
import { motion, AnimatePresence } from "framer-motion"

export default function ClientLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#08080a]">
          <Loader2 className="h-5 w-5 animate-spin text-[#f08c2b]" />
        </div>
      }
    >
      <ClientLoginForm />
    </Suspense>
  )
}

function ClientLoginForm() {
  const { data: session, status } = useSession()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [focused, setFocused] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  useEffect(() => {
    //console.log("Client Login Session Data:", { session, status })
    if (status === "authenticated" && (session?.user?.type === "client" || session?.user?.role === "client")) {
      let redirectUrl = searchParams?.get("redirect") || "/client-portal"
      if (typeof redirectUrl !== "string" || !redirectUrl.startsWith("/client-portal")) {
        redirectUrl = "/client-portal"
      }
      router.replace(redirectUrl)
    }
  }, [status, session, router, searchParams])

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#08080a]">
        <Loader2 className="h-5 w-5 animate-spin text-[#f08c2b]" />
      </div>
    )
  }

  const triggerError = (message: string) => {
    setErrorMsg(message)
    setShake(true)
    setTimeout(() => setShake(false), 500)
    toast({
      variant: "destructive",
      title: "Authentication Error",
      description: message,
    })
  }

  const showLoginSuccess = () => {
    toast({
      variant: "success",
      title: "Welcome Back",
      description: LOGIN_SUCCESS_MESSAGES.client,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    const trimmed = email.trim()

    if (!trimmed) {
      triggerError("Email address is required")
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmed)) {
      triggerError("Please enter a valid email address")
      return
    }
    if (!password || password.length < 6) {
      triggerError("Password must be at least 6 characters")
      return
    }

    setIsLoading(true)
    try {
      const result = await signIn("credentials", {
        email: trimmed.toLowerCase(),
        password,
        loginContext: "client",
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
      if (session?.user?.type !== "client") {
        triggerError(LOGIN_ERROR_MESSAGES.useStaffLogin)
        return
      }
      let redirect = searchParams?.get("redirect") || "/client-portal"
      if (typeof redirect !== "string" || !redirect.startsWith("/client-portal")) {
        redirect = "/client-portal"
      }
      showLoginSuccess()
      showPostLoginGreetingToast(toast, session?.user?.name)
      await new Promise(resolve => setTimeout(resolve, 500))
      router.push(redirect)
      router.refresh()
    } catch (err: any) {
      triggerError(err?.message || LOGIN_ERROR_MESSAGES.signInFailed)
    } finally {
      setIsLoading(false)
    }
  }

  // Shake variant for incorrect details
  const shakeVariants = {
    shake: {
      x: [-6, 6, -6, 6, -4, 4, 0],
      transition: { duration: 0.4, ease: "easeInOut" }
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-12 bg-[#08080a] font-sans selection:bg-[#f08c2b] selection:text-white overflow-hidden">
      
      {/* LEFT COLUMN: Clean Branding Copy & Taglines (5 Cols) */}
      <div className="relative hidden md:flex md:col-span-5 flex-col justify-between p-12 lg:p-16 border-r border-white/[0.02] bg-[#09090b] overflow-hidden">
        {/* Glow Particles */}
        <div className="pointer-events-none absolute inset-0 z-0">
          <motion.div
            animate={{
              x: [0, 20, -10, 0],
              y: [0, -20, 20, 0],
              scale: [1, 1.1, 0.95, 1],
            }}
            transition={{ duration: 15, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
            className="absolute -left-20 top-1/4 h-[350px] w-[350px] rounded-full bg-[#f08c2b]/10 blur-[90px]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808003_1px,transparent_1px),linear-gradient(to_bottom,#80808003_1px,transparent_1px)] bg-[size:24px_24px]" />
        </div>

        {/* Top: Logo & Title */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f08c2b] shadow-md">
            <Coins className="h-5 w-5 text-black" />
          </div>
          <span className="text-md font-bold tracking-tight text-white flex items-center gap-1.5">
            NYUKI<span className="text-[#f08c2b]">.</span>
            <span className="text-[#f08c2b] text-[12px] font-medium tracking-normal border border-[#f08c2b]/25 bg-[#f08c2b]/10 px-2 py-0.5 rounded-full">SACCO</span>
          </span>
        </div>

        {/* Middle: Brand Copy with generous spacing */}
        <div className="relative z-10 my-auto space-y-8 max-w-sm">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-4"
          >
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.02] border border-white/[0.05] px-3 py-1 text-xs font-semibold tracking-wider uppercase text-white/50">
              <Sparkles className="h-3.5 w-3.5 text-[#f08c2b]" />
              Secure Member Terminal
            </div>
            <h1 className="text-3xl lg:text-4xl font-black tracking-tight text-white leading-tight">
              Empowering your <br />
              <span className="bg-gradient-to-r from-[#f08c2b] via-[#ffa750] to-[#e07b1b] bg-clip-text text-transparent">
                financial future.
              </span>
            </h1>
            <p className="text-[14px] text-white/40 leading-relaxed">
              Review shares, monitor growth parameters, compute loans, and direct contributions seamlessly.
            </p>
          </motion.div>

          {/* Simple Bullet Lists */}
          <div className="space-y-3.5 border-t border-white/[0.04] pt-6">
            <div className="flex items-start gap-2.5 text-xs text-white/50">
              <span className="h-1.5 w-1.5 rounded-full bg-[#f08c2b] mt-1.5 shrink-0" />
              <span><strong>Easy Savings Access:</strong> View ledger updates and balances instantly.</span>
            </div>
            <div className="flex items-start gap-2.5 text-xs text-white/50">
              <span className="h-1.5 w-1.5 rounded-full bg-[#f08c2b] mt-1.5 shrink-0" />
              <span><strong>Unified Share Portals:</strong> Track dividends and share values directly.</span>
            </div>
            <div className="flex items-start gap-2.5 text-xs text-white/50">
              <span className="h-1.5 w-1.5 rounded-full bg-[#f08c2b] mt-1.5 shrink-0" />
              <span><strong>Protected Vaults:</strong> Secured with certified SSL encryption.</span>
            </div>
          </div>
        </div>

        {/* Bottom Compliance Notice */}
        <div className="relative z-10 text-xs text-white/30">
          <span>Regulated Co-operative Financial Institution</span>
        </div>
      </div>

      {/* RIGHT COLUMN: Sign in Form - Seamless Form Floating over Kinetic Ring Background (7 Cols) */}
      <div className="relative md:col-span-7 flex flex-col justify-between p-8 sm:p-12 md:p-16 lg:p-24 bg-[#08080a] min-h-screen">
        
        {/* BACKGROUND LAYER: Kinetic Ring Visualizer centered behind the form */}
        <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden opacity-60">
          {/* Ambient center glow */}
          <div className="absolute w-[300px] h-[300px] bg-[#f08c2b]/5 blur-[60px] rounded-full" />
          
          {/* Central pulsing core */}
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
            className="absolute w-12 h-12 rounded-full bg-gradient-to-tr from-[#f08c2b]/80 to-[#ffa750]/80 shadow-[0_0_40px_rgba(240,140,43,0.3)]"
          />
          
          {/* Outer dashed spinning ring */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 35, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
            className="absolute w-[520px] h-[520px] rounded-full border-2 border-dashed border-[#f08c2b]/15"
          />

          {/* Middle spinning ring */}
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 25, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
            className="absolute w-[420px] h-[420px] rounded-full border border-[#f08c2b]/10"
          />

          {/* Inner reverse spinning ring */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 18, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
            className="absolute w-[320px] h-[320px] rounded-full border border-dashed border-[#f08c2b]/8"
          />

          {/* Orbiting dot on the outer ring */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 15, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
            className="absolute w-[520px] h-[520px]"
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#f08c2b] shadow-[0_0_8px_rgba(240,140,43,0.5)]" />
          </motion.div>
        </div>

        {/* Top: Mobile branding header */}
        <div className="relative z-10 flex justify-between items-center md:justify-end">
          <div className="flex items-center gap-2.5 md:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f08c2b] shadow-md">
            <Coins className="h-5 w-5 text-black" />
          </div>
          <span className="text-md font-bold tracking-tight text-white flex items-center gap-1.5">
            NYUKI<span className="text-[#f08c2b]">.</span>
            <span className="text-[#f08c2b] text-[12px] font-medium tracking-normal border border-[#f08c2b]/25 bg-[#f08c2b]/10 px-2 py-0.5 rounded-full">SACCO</span>
          </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-white/35">
            <Shield className="h-4 w-4 text-[#f08c2b]/70" />
            <span>SSL Secured Session</span>
          </div>
        </div>

        {/* Center Form Section (Cardless layout floating directly over Kinetic Ring) */}
        <div className="relative z-10 my-auto w-full max-w-[390px] mx-auto py-12">
          
          {/* Header Typography */}
          <div className="mb-8 space-y-2">
            <h2 className="text-3xl font-extrabold tracking-tight text-white">Sign In</h2>
            <p className="text-sm text-white/40">
              Please enter your credentials to access the portal ledger.
            </p>
          </div>

          {/* Form shaker container */}
          <motion.div
            variants={shakeVariants}
            animate={shake ? "shake" : ""}
          >
            {/* Error Message Box */}
            <AnimatePresence>
              {errorMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mb-6 flex items-start gap-2.5 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-[13px] text-destructive-foreground"
                >
                  <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              
              {/* Email Address */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label htmlFor="email" className="text-[10px] font-black uppercase tracking-widest text-[#f08c2b]">
                    Email Address
                  </label>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35">
                    <Mail className={`h-4.5 w-4.5 transition-colors duration-200 ${focused === "email" ? "text-[#f08c2b]" : ""}`} />
                  </span>
                  <input
                    id="email"
                    type="email"
                    placeholder="Enter your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocused("email")}
                    onBlur={() => setFocused(null)}
                    autoComplete="email"
                    autoFocus
                    required
                    className={inputClass(focused === "email")}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label htmlFor="password" className="text-[10px] font-black uppercase tracking-widest text-[#f08c2b]">
                    Password
                  </label>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35">
                    <Lock className={`h-4.5 w-4.5 transition-colors duration-200 ${focused === "password" ? "text-[#f08c2b]" : ""}`} />
                  </span>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocused("password")}
                    onBlur={() => setFocused(null)}
                    autoComplete="current-password"
                    required
                    className={inputClass(focused === "password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/60 transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4.5 w-4.5" />
                    ) : (
                      <Eye className="h-4.5 w-4.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit button */}
              <motion.button
                type="submit"
                disabled={isLoading}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="relative mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f08c2b] to-[#e07b1b] py-3.5 text-sm font-semibold text-white transition-all shadow-[0_0_15px_rgba(240,140,43,0.15)] hover:shadow-[0_0_22px_rgba(240,140,43,0.25)] disabled:pointer-events-none disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4.5 w-4.5 animate-spin text-white" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="h-4.5 w-4.5" />
                  </>
                )}
              </motion.button>
            </form>
          </motion.div>

          {/* Links and Alternate Portals */}
          <div className="mt-6 flex flex-col gap-3.5 border-t border-white/[0.04] pt-5 text-center sm:text-left">
            <Link
              href="/forgot-password"
              className="text-xs text-white/35 hover:text-white/60 transition-colors self-center sm:self-start"
            >
              Forgot password?
            </Link>
            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-white/30">Not a portal client?</span>
              <Link
                href="/login"
                className="text-xs font-bold text-[#f08c2b] hover:text-[#f08c2b]/80 transition-colors flex items-center gap-0.5"
              >
                Staff login <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom footer credit */}
        <div className="relative z-10 text-center md:text-left text-xs text-white/20">
          <span>Protected under Sente Loans encrypted member rules.</span>
        </div>
      </div>

    </div>
  )
}

function inputClass(isFocused: boolean): string {
  return [
    "block w-full rounded-xl border bg-white/[0.02] px-10.5 py-4 text-sm text-white placeholder:text-white/20 outline-none transition-all duration-300",
    isFocused
      ? "border-[#f08c2b] ring-4 ring-[#f08c2b]/8 bg-[#09090b] shadow-[0_0_12px_rgba(240,140,43,0.06)]"
      : "border-white/[0.05] hover:border-white/10 hover:bg-[#0c0c0e]",
  ].join(" ")
}
