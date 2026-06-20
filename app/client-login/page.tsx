"use client"

import type React from "react"

import { Suspense, useState } from "react"
import { signIn } from "next-auth/react"
import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Eye, EyeOff, Lock, Loader2 } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import { LOGIN_ERROR_MESSAGES, LOGIN_SUCCESS_MESSAGES, resolveSignInErrorMessage } from "@/lib/auth-login-messages"
import { showPostLoginGreetingToast } from "@/lib/greeting"

export default function ClientLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0c1222]">
          <Loader2 className="h-5 w-5 animate-spin text-[#2563eb]" />
        </div>
      }
    >
      <ClientLoginForm />
    </Suspense>
  )
}

function ClientLoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [focused, setFocused] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
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
      title: "Signed in",
      description: LOGIN_SUCCESS_MESSAGES.client,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) {
      showLoginError("Email is required")
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmed)) {
      showLoginError("Enter a valid email address")
      return
    }
    if (!password || password.length < 6) {
      showLoginError("Password must be at least 6 characters")
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
        showLoginError(LOGIN_ERROR_MESSAGES.useStaffLogin)
        return
      }
      let redirect = searchParams?.get("redirect") || "/client-portal"
      if (typeof redirect !== "string" || !redirect.startsWith("/client-portal")) {
        redirect = "/client-portal"
      }
      showLoginSuccess()
      showPostLoginGreetingToast(toast, session?.user?.name)
      router.push(redirect)
      router.refresh()
    } catch (err: any) {
      showLoginError(err?.message || LOGIN_ERROR_MESSAGES.signInFailed)
    } finally {
      setIsLoading(false)
    }
  }

  const inputFocusClass = (field: string) =>
    focused === field
      ? "border-[#2563eb] ring-4 ring-[#2563eb]/10 bg-white/8"
      : "border-white/10 hover:border-white/20"

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0c1222]">
      {/* Floating decorative cards */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -right-10 top-[8%] hidden h-[300px] w-[360px] rounded-[28px] border border-white/6 p-8 lg:block"
          style={{
            transform: "rotate(45deg)",
            background: "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
          }}
        >
          <div className="flex h-full items-end gap-[10px]">
            {[35, 60, 45, 80, 55, 70, 40].map((h, i) => (
              <div
                key={i}
                className="w-7 rounded-t-md bg-[#2563eb]/10"
                style={{ height: `${h}%`, opacity: 0.5 + (i % 3) * 0.15 }}
              />
            ))}
          </div>
        </div>

        <div
          className="absolute -left-16 bottom-[5%] hidden h-[260px] w-[320px] rounded-[28px] border border-white/6 p-8 lg:block"
          style={{
            transform: "rotate(45deg)",
            background: "linear-gradient(135deg, rgba(255,255,255,0.025) 0%, transparent 100%)",
          }}
        >
          <div className="space-y-5">
            {[28, 20, 24, 16].map((w, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-[#2563eb]/20" style={{ opacity: 0.6 + i * 0.1 }} />
                <div className="h-2.5 rounded-full bg-white/6" style={{ width: `${w * 4}px` }} />
              </div>
            ))}
          </div>
        </div>

        <div
          className="absolute left-[3%] top-[18%] hidden h-[200px] w-[220px] rounded-[22px] border border-[#2563eb]/10 p-6 md:block"
          style={{
            transform: "rotate(45deg)",
            background: "linear-gradient(135deg, rgba(37,99,235,0.06) 0%, transparent 100%)",
          }}
        >
          <div className="h-9 w-9 rounded-xl bg-[#2563eb]/15" />
          <div className="mt-5 h-2.5 w-3/4 rounded-full bg-white/7" />
          <div className="mt-3 h-2 w-1/2 rounded-full bg-white/4" />
          <div className="mt-4 h-1.5 w-full rounded-full bg-white/3">
            <div className="h-full w-[65%] rounded-full bg-[#2563eb]/25" />
          </div>
        </div>

        <div
          className="absolute bottom-[15%] right-[3%] hidden h-[170px] w-[190px] rounded-[20px] border border-white/4 md:block"
          style={{ transform: "rotate(45deg)" }}
        />

        <div
          className="absolute bottom-[40%] left-[8%] hidden h-[120px] w-[130px] rounded-2xl border border-[#2563eb]/8 md:block"
          style={{ transform: "rotate(45deg)" }}
        />

        <div className="absolute left-[20%] top-[12%] h-2 w-2 rounded-full bg-[#2563eb]/25" />
        <div className="absolute right-[22%] top-[22%] h-1.5 w-1.5 rounded-full bg-[#2563eb]/20" />
        <div className="absolute bottom-[18%] left-[30%] h-2 w-2 rounded-full bg-white/6" />
        <div className="absolute bottom-[30%] right-[18%] h-1.5 w-1.5 rounded-full bg-[#2563eb]/15" />
        <div className="absolute right-[35%] top-[8%] h-1 w-1 rounded-full bg-white/8" />
      </div>

      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(37,99,235,0.08) 0%, transparent 65%)",
          filter: "blur(60px)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <div className="mb-10 inline-flex items-center gap-3">
          <Image
            src="https://res.cloudinary.com/hatari/image/upload/v1756391632/sente-loans/logos/sente-loans-symbol-logo_jyteeu.png"
            alt="Sente Loan"
            width={36}
            height={36}
            className="h-9 w-auto brightness-0 invert"
          />
          <span className="text-[22px] font-semibold tracking-tight text-white">Sente Loan</span>
        </div>

        <div className="w-full max-w-[400px] p-2">
          <div className="mb-8 text-center">
            <h1 className="text-[28px] font-bold tracking-tight text-white">Welcome back</h1>
            <p className="mt-2 text-[15px] text-white/50">Sign in to your member portal</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div className="space-y-2">
              <label htmlFor="email" className="block text-[13px] font-medium text-white/70">
                Email address
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocused("email")}
                onBlur={() => setFocused(null)}
                autoComplete="email"
                autoFocus
                required
                className={`block w-full rounded-xl border bg-white/6 px-4 py-3 text-[15px] text-white placeholder:text-white/30 outline-none transition-all duration-200 ${inputFocusClass("email")}`}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-[13px] font-medium text-white/70">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocused("password")}
                  onBlur={() => setFocused(null)}
                  autoComplete="current-password"
                  required
                  className={`block w-full rounded-xl border bg-white/6 px-4 py-3 pr-12 text-[15px] text-white placeholder:text-white/30 outline-none transition-all duration-200 ${inputFocusClass("password")}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 transition-colors hover:text-white/60"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-[18px] w-[18px]" />
                  ) : (
                    <Eye className="h-[18px] w-[18px]" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="relative mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-4 py-3.5 text-[15px] font-semibold text-white transition-all duration-200 hover:bg-[#1d4ed8] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
              style={{
                boxShadow: "0 0 20px rgba(37,99,235,0.25), 0 4px 12px rgba(37,99,235,0.3)",
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <p className="mt-5 text-center">
            <Link href="/forgot-password" className="text-[13px] text-white/40 transition-colors hover:text-white/70">
              Forgot your password?
            </Link>
          </p>
        </div>

        <div className="mt-10 flex items-center gap-1.5 text-[12px] text-white/20">
          <Lock className="h-3 w-3" />
          <span>Protected by 256-bit SSL encryption</span>
        </div>
      </div>
    </div>
  )
}
