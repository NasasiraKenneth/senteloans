"use client"

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import { Moon, Sun, Sunrise } from "lucide-react"
import type { GreetingPeriod } from "@/lib/greeting"

type ToastVariant = "default" | "success" | "destructive" | "warning"

export type ToastMessage = {
  id: string
  title?: string
  description?: string
  variant?: ToastVariant
  icon?: GreetingPeriod
  duration?: number
  exiting?: boolean
}

type ToastContextValue = {
  toast: (msg: Omit<ToastMessage, "id">) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const idRef = useRef(0)

  const toast = useCallback((msg: Omit<ToastMessage, "id">) => {
    const id = `${Date.now()}-${idRef.current++}`
    const duration = typeof msg.duration === "number" ? msg.duration : 4000
    const t: ToastMessage = { id, ...msg, duration }
    setToasts((arr) => [...arr, t])

    // Start exit animation before removing
    window.setTimeout(() => {
      setToasts((arr) => arr.map((x) => (x.id === id ? { ...x, exiting: true } : x)))
    }, duration - 300)

    window.setTimeout(() => {
      setToasts((arr) => arr.filter((x) => x.id !== id))
    }, duration)
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((arr) => arr.map((x) => (x.id === id ? { ...x, exiting: true } : x)))
    window.setTimeout(() => {
      setToasts((arr) => arr.filter((x) => x.id !== id))
    }, 300)
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>")
  return ctx
}

function SuccessIcon() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]">
      <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
  )
}

function ErrorIcon() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.4)]">
      <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </div>
  )
}

function WarningIcon() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.4)]">
      <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    </div>
  )
}

function DefaultIcon() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0f0f12] shadow-[0_0_12px_rgba(240,140,43,0.3)]">
      <svg className="h-4 w-4 text-[#f08c2b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
  )
}

function GreetingIcon({ period }: { period: GreetingPeriod }) {
  const styles: Record<GreetingPeriod, { className: string; Icon: typeof Sunrise }> = {
    morning: {
      className: "bg-gradient-to-br from-amber-400 to-orange-500 shadow-[0_0_12px_rgba(251,191,36,0.45)]",
      Icon: Sunrise,
    },
    afternoon: {
      className: "bg-gradient-to-br from-[#f08c2b] to-[#d97b1e] shadow-[0_0_12px_rgba(240,140,43,0.45)]",
      Icon: Sun,
    },
    evening: {
      className: "bg-gradient-to-br from-indigo-500 to-violet-600 shadow-[0_0_12px_rgba(99,102,241,0.45)]",
      Icon: Moon,
    },
  }
  const { className, Icon } = styles[period]
  return (
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${className}`}>
      <Icon className="h-4 w-4 text-white" strokeWidth={2.25} />
    </div>
  )
}

function ToastLeadingIcon({ toast }: { toast: ToastMessage }) {
  if (toast.icon === "morning" || toast.icon === "afternoon" || toast.icon === "evening") {
    return <GreetingIcon period={toast.icon} />
  }
  if (toast.variant === "success") return <SuccessIcon />
  if (toast.variant === "destructive") return <ErrorIcon />
  if (toast.variant === "warning") return <WarningIcon />
  return <DefaultIcon />
}

function ProgressBar({ duration, variant }: { duration: number; variant?: ToastVariant }) {
  const colorClass =
    variant === "success" ? "bg-emerald-500" :
    variant === "destructive" ? "bg-red-500" :
    variant === "warning" ? "bg-amber-500" :
    "bg-[#f08c2b]"

  return (
    <div className="absolute bottom-0 left-0 right-0 h-[3px] overflow-hidden rounded-b-2xl">
      <div
        className={`h-full ${colorClass} rounded-b-2xl`}
        style={{
          animation: `toast-progress ${duration}ms linear forwards`,
        }}
      />
    </div>
  )
}

export function Toaster({
  toasts = [],
  onDismiss,
}: {
  toasts?: ToastMessage[]
  onDismiss?: (id: string) => void
}) {
  return (
    <>
      <style>{`
        @keyframes toast-slide-in {
          from { opacity: 0; transform: translateX(100%) scale(0.95); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes toast-slide-out {
          from { opacity: 1; transform: translateX(0) scale(1); }
          to { opacity: 0; transform: translateX(100%) scale(0.95); }
        }
        @keyframes toast-progress {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
      <div className="fixed top-5 right-5 z-9999 flex flex-col gap-3 pointer-events-none">
        {toasts.map((t) => {
          const isSuccess = t.variant === "success"
          const isError = t.variant === "destructive"
          const isWarning = t.variant === "warning"

          return (
            <div
              key={t.id}
              className="pointer-events-auto"
              style={{
                animation: t.exiting
                  ? "toast-slide-out 300ms ease-in forwards"
                  : "toast-slide-in 400ms cubic-bezier(0.21, 1.02, 0.73, 1) forwards",
              }}
            >
              <div
                className={[
                  "relative w-[380px] rounded-2xl border px-4 py-4 shadow-2xl backdrop-blur-sm overflow-hidden",
                  isSuccess && "bg-[#0f0f12] border-emerald-500/20 shadow-[0_8px_32px_rgba(16,185,129,0.15)]",
                  isError && "bg-white border-red-200 shadow-[0_8px_32px_rgba(239,68,68,0.12)]",
                  isWarning && "bg-white border-amber-200 shadow-[0_8px_32px_rgba(245,158,11,0.12)]",
                  !isSuccess && !isError && !isWarning && "bg-[#0f0f12] border-[#f08c2b]/20 shadow-[0_8px_32px_rgba(240,140,43,0.12)]",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="flex items-start gap-3">
                  <ToastLeadingIcon toast={t} />

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    {t.title && (
                      <p className={[
                        "text-sm font-semibold leading-tight",
                        isSuccess && "text-white",
                        isError && "text-red-900",
                        isWarning && "text-amber-900",
                        !isSuccess && !isError && !isWarning && "text-white",
                      ].filter(Boolean).join(" ")}>
                        {t.title}
                      </p>
                    )}
                    {t.description && (
                      <p className={[
                        "text-[13px] leading-snug mt-1",
                        isSuccess && "text-white/60",
                        isError && "text-red-600/80",
                        isWarning && "text-amber-700/80",
                        !isSuccess && !isError && !isWarning && "text-white/50",
                      ].filter(Boolean).join(" ")}>
                        {t.description}
                      </p>
                    )}
                  </div>

                  {/* Dismiss button */}
                  <button
                    onClick={() => onDismiss?.(t.id)}
                    className={[
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors",
                      isSuccess && "text-white/30 hover:text-white/60 hover:bg-white/10",
                      isError && "text-red-300 hover:text-red-500 hover:bg-red-50",
                      isWarning && "text-amber-300 hover:text-amber-500 hover:bg-amber-50",
                      !isSuccess && !isError && !isWarning && "text-white/30 hover:text-white/60 hover:bg-white/10",
                    ].filter(Boolean).join(" ")}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Progress bar */}
                <ProgressBar duration={t.duration || 4000} variant={t.variant} />
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
