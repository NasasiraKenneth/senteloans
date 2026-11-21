"use client"

import React, { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Coins,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Shield,
  ShieldCheck,
} from "lucide-react"
import { useToast } from "@/components/ui/toast"

const MIN_PASSWORD_LENGTH = 8

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-950">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  )
}

function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const token = (searchParams.get("token") || "").trim()
  const { toast } = useToast()

  const [tokenState, setTokenState] = useState<"checking" | "valid" | "invalid">("checking")
  const [tokenError, setTokenError] = useState<string>("")
  const [emailMasked, setEmailMasked] = useState<string>("")

  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [errors, setErrors] = useState<{ newPassword?: string; confirmPassword?: string }>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resetDone, setResetDone] = useState(false)

  useEffect(() => {
    let cancelled = false

    if (!token) {
      setTokenState("invalid")
      setTokenError("This password reset link is missing a token. Please request a new one.")
      return
    }

    setTokenState("checking")
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok && data?.valid) {
          setEmailMasked(String(data.emailMasked || ""))
          setTokenState("valid")
        } else {
          setTokenError(
            data?.message || "This password reset link is invalid or has expired. Please request a new one.",
          )
          setTokenState("invalid")
        }
      })
      .catch(() => {
        if (cancelled) return
        setTokenError("Unable to verify this password reset link. Please try again.")
        setTokenState("invalid")
      })

    return () => {
      cancelled = true
    }
  }, [token])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isSubmitting) return

    const nextErrors: { newPassword?: string; confirmPassword?: string } = {}
    if (!newPassword) {
      nextErrors.newPassword = "New password is required"
    } else if (newPassword.length < MIN_PASSWORD_LENGTH) {
      nextErrors.newPassword = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
    }

    if (!confirmPassword) {
      nextErrors.confirmPassword = "Please confirm your new password"
    } else if (newPassword !== confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match"
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setErrors({})
    setIsSubmitting(true)
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword, confirmPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data?.error === "invalid_or_expired_token" || data?.error === "token_required") {
          setTokenError(data?.message || "This password reset link is invalid or has expired.")
          setTokenState("invalid")
          return
        }
        throw new Error(data?.message || "Unable to reset password. Please try again.")
      }

      setResetDone(true)
      toast({
        variant: "success",
        title: "Password updated",
        description: data?.message || "You can now sign in with your new password.",
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unable to reset password. Please try again."
      toast({
        variant: "destructive",
        title: "Reset failed",
        description: msg,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const meetsMinLength = newPassword.length >= MIN_PASSWORD_LENGTH
  const passwordsMatch = Boolean(confirmPassword) && newPassword === confirmPassword

  return (
    <div className="min-h-screen w-full bg-white dark:bg-[#0f0f12] flex flex-col lg:flex-row overflow-hidden selection:bg-brand selection:text-black">
      {/* ── Left: Dark Brand & Security Panel ── */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-black via-[#09090b] to-brand-dark items-center rounded-br-[8rem] rounded-r-2xl justify-center p-12 relative overflow-hidden border-r border-white/10">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-brand/15 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-brand-700/10 rounded-full blur-3xl animate-pulse" />
        </div>
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute inset-0 bg-[radial-gradient(var(--color-brand)_1px,transparent_1px)] [background-size:24px_24px]" />
        </div>

        <div className="max-w-md text-center relative z-10 space-y-8">
          <div className="w-56 h-56 mx-auto bg-[#141418]/85 backdrop-blur-md rounded-3xl shadow-2xl flex flex-col items-center justify-center p-8 border border-white/10">
            <div className="w-18 h-18 rounded-2xl bg-brand flex items-center justify-center shadow-xl shadow-brand/30 mb-4 p-4">
              <ShieldCheck className="h-10 w-10 text-white dark:text-[#0f0f12]" />
            </div>
            <span className="text-3xl font-black tracking-tight text-white flex items-center">
              NYUKI<span className="text-brand ml-0.5">.</span>
            </span>
            <span className="text-xs text-[#a1a1aa] font-mono uppercase tracking-widest mt-1">
              Account Recovery
            </span>
          </div>

          <div className="space-y-3">
            <h2 className="text-2xl font-black text-white tracking-tight">
              Secure Password Recovery
            </h2>
            <p className="text-[#a1a1aa] text-sm leading-relaxed">
              Reset links are cryptographically signed, time-limited to 1 hour, and invalidated immediately after use to keep your SACCO account protected.
            </p>
          </div>
        </div>
      </div>

      {/* ── Right: Form Container (Light & Dark aware) ── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-14 relative z-10 bg-white dark:bg-[#0f0f12]">
        <div className="w-full max-w-md space-y-8">
          {/* Header */}
          <div className="text-center">
            <Link href="/" className="inline-flex items-center gap-3 mb-3 group no-underline hover:no-underline">
              <div className="w-12 h-12 rounded-xl bg-brand flex items-center justify-center shadow-lg shadow-brand/25 group-hover:scale-105 transition-transform">
                <Coins className="h-6 w-6 text-white dark:text-[#0f0f12]" />
              </div>
              <span className="text-2xl font-black tracking-tight text-zinc-900 flex items-center">
                NYUKI<span className="text-brand ml-0.5">.</span>
              </span>
            </Link>
            <p className="text-xs font-mono font-semibold uppercase tracking-widest text-brand">
              Account Recovery
            </p>
          </div>

          <AnimatePresence mode="wait">
            {tokenState === "checking" ? (
              <motion.div
                key="checking"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-12 text-center space-y-3"
              >
                <Loader2 className="h-7 w-7 animate-spin text-brand mx-auto" />
                <p className="text-sm text-zinc-500 font-medium">Verifying your reset link...</p>
              </motion.div>
            ) : resetDone ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6 text-center"
              >
                <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 tracking-tight">
                    Password Updated
                  </h1>
                  <p className="text-zinc-500 text-sm leading-relaxed">
                    Your password has been reset successfully. You can now sign in with your new password.
                  </p>
                </div>
                <Link
                  href="/login"
                  className="w-full h-12 bg-gradient-to-r from-[#18181b] via-[#09090b] to-brand dark:from-[#1f2025] dark:via-[#141418] dark:to-[#1f2025] dark:border dark:border-brand/50 dark:hover:border-brand text-white rounded-xl font-extrabold text-sm transition-all duration-200 shadow-xl shadow-black/10 hover:shadow-2xl inline-flex items-center justify-center gap-2 no-underline hover:no-underline"
                >
                  <span>Sign In Now</span>
                  <ArrowRight className="w-4 h-4 text-brand" />
                </Link>
              </motion.div>
            ) : tokenState === "invalid" ? (
              <motion.div
                key="invalid"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-6 text-center"
              >
                <div className="w-14 h-14 mx-auto rounded-2xl bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 flex items-center justify-center">
                  <AlertTriangle className="w-7 h-7 text-red-600 dark:text-red-400" />
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 tracking-tight">
                    Reset Link Unavailable
                  </h1>
                  <p className="text-zinc-500 text-sm leading-relaxed">
                    {tokenError || "This password reset link is invalid or has expired."}
                  </p>
                </div>
                <div className="space-y-3">
                  <Link
                    href="/login?mode=forgot"
                    className="w-full h-12 bg-gradient-to-r from-[#18181b] via-[#09090b] to-brand dark:from-[#1f2025] dark:via-[#141418] dark:to-[#1f2025] dark:border dark:border-brand/50 dark:hover:border-brand text-white rounded-xl font-extrabold text-sm transition-all duration-200 shadow-xl shadow-black/10 hover:shadow-2xl inline-flex items-center justify-center gap-2 no-underline hover:no-underline"
                  >
                    <span>Request a New Reset Link</span>
                    <ArrowRight className="w-4 h-4 text-brand" />
                  </Link>
                  <Link
                    href="/login"
                    className="text-xs text-zinc-500 hover:text-zinc-900 transition-colors inline-flex items-center gap-1.5 font-medium"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to Sign In</span>
                  </Link>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-7"
              >
                <div className="text-center space-y-1.5">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-brand/10 border border-brand/25 flex items-center justify-center mb-3">
                    <KeyRound className="w-6 h-6 text-brand" />
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 tracking-tight">
                    Set New Password
                  </h1>
                  <p className="text-zinc-500 text-sm">
                    {emailMasked ? (
                      <>
                        Choose a new password for <strong className="text-zinc-800">{emailMasked}</strong>
                      </>
                    ) : (
                      "Choose a strong new password for your account."
                    )}
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5" noValidate aria-label="Reset Password Form">
                  {/* New Password */}
                  <div className="space-y-2">
                    <label
                      htmlFor="new-password"
                      className="text-zinc-700 font-semibold text-xs flex items-center gap-2"
                    >
                      <Lock className="w-3.5 h-3.5 text-brand" />
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        id="new-password"
                        type={showNewPassword ? "text" : "password"}
                        placeholder="At least 8 characters"
                        required
                        value={newPassword}
                        onChange={(e) => {
                          setNewPassword(e.target.value)
                          if (errors.newPassword) setErrors((prev) => ({ ...prev, newPassword: undefined }))
                        }}
                        autoComplete="new-password"
                        autoFocus
                        className={`w-full h-12 px-4 pl-11 pr-11 rounded-xl border-2 text-sm text-zinc-900 bg-white dark:bg-[#1a1a1f] placeholder:text-[#9ca3af] dark:placeholder:text-[#6b7280] transition-all duration-200 outline-none ${
                          errors.newPassword
                            ? "border-red-400 dark:border-red-500/70 bg-red-50/50 dark:bg-red-500/10"
                            : "border-zinc-200 dark:border-white/10 hover:border-brand/40 focus:border-brand focus:ring-4 focus:ring-brand/15"
                        }`}
                      />
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((v) => !v)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
                        aria-label="Toggle new password visibility"
                        tabIndex={-1}
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.newPassword && (
                      <p className="text-red-500 dark:text-red-400 text-xs font-medium pt-0.5">{errors.newPassword}</p>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-2">
                    <label
                      htmlFor="confirm-password"
                      className="text-zinc-700 font-semibold text-xs flex items-center gap-2"
                    >
                      <Shield className="w-3.5 h-3.5 text-brand" />
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <input
                        id="confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Re-enter your new password"
                        required
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value)
                          if (errors.confirmPassword) {
                            setErrors((prev) => ({ ...prev, confirmPassword: undefined }))
                          }
                        }}
                        autoComplete="new-password"
                        className={`w-full h-12 px-4 pl-11 pr-11 rounded-xl border-2 text-sm text-zinc-900 bg-white dark:bg-[#1a1a1f] placeholder:text-[#9ca3af] dark:placeholder:text-[#6b7280] transition-all duration-200 outline-none ${
                          errors.confirmPassword
                            ? "border-red-400 dark:border-red-500/70 bg-red-50/50 dark:bg-red-500/10"
                            : "border-zinc-200 dark:border-white/10 hover:border-brand/40 focus:border-brand focus:ring-4 focus:ring-brand/15"
                        }`}
                      />
                      <Shield className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
                        aria-label="Toggle confirm password visibility"
                        tabIndex={-1}
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.confirmPassword && (
                      <p className="text-red-500 dark:text-red-400 text-xs font-medium pt-0.5">{errors.confirmPassword}</p>
                    )}
                  </div>

                  {/* Live checklist */}
                  <div className="rounded-xl bg-zinc-50 dark:bg-[#16161a] border border-zinc-200 dark:border-white/10 px-3.5 py-2.5 text-xs space-y-1">
                    <div className={`flex items-center gap-2 ${meetsMinLength ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-zinc-500"}`}>
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>At least {MIN_PASSWORD_LENGTH} characters</span>
                    </div>
                    <div className={`flex items-center gap-2 ${passwordsMatch ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-zinc-500"}`}>
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Passwords match</span>
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: isSubmitting ? 1 : 1.01 }}
                    whileTap={{ scale: isSubmitting ? 1 : 0.99 }}
                    type="submit"
                    disabled={isSubmitting}
                    className={`w-full h-12 bg-gradient-to-r from-[#18181b] via-[#09090b] to-brand dark:from-[#1f2025] dark:via-[#141418] dark:to-[#1f2025] dark:border dark:border-brand/50 dark:hover:border-brand text-white rounded-xl font-extrabold text-sm transition-all duration-200 shadow-xl shadow-black/10 hover:shadow-2xl cursor-pointer ${
                      isSubmitting ? "opacity-70 cursor-not-allowed" : ""
                    }`}
                  >
                    {isSubmitting ? (
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Updating Password...</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <span>Reset Password</span>
                        <ArrowRight className="w-4 h-4 text-brand" />
                      </div>
                    )}
                  </motion.button>

                  <div className="text-center pt-1">
                    <Link
                      href="/login"
                      className="text-xs text-zinc-500 hover:text-zinc-900 transition-colors inline-flex items-center gap-1.5 font-medium"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to Sign In</span>
                    </Link>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
