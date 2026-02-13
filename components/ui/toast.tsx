"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"

type ToastVariant = "default" | "success" | "destructive" | "warning"

export type ToastMessage = {
  id: string
  title?: string
  description?: string
  variant?: ToastVariant
  duration?: number // ms
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
    const duration = typeof msg.duration === "number" ? msg.duration : 3000
    const t: ToastMessage = { id, ...msg, duration }
    setToasts((arr) => [...arr, t])
    window.setTimeout(() => {
      setToasts((arr) => arr.filter((x) => x.id !== id))
    }, duration)
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>")
  return ctx
}

export function Toaster({ toasts = [] as ToastMessage[] }: { toasts?: ToastMessage[] }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={[
            "min-w-[260px] max-w-sm rounded-md border shadow-sm px-4 py-3 bg-background",
            t.variant === "success" && "border-green-200 text-green-900 bg-green-50",
            t.variant === "destructive" && "border-red-200 text-red-900 bg-red-50",
            t.variant === "warning" && "border-yellow-200 text-yellow-900 bg-yellow-50",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {t.title && <div className="text-sm font-semibold">{t.title}</div>}
          {t.description && <div className="text-sm mt-0.5 text-muted-foreground">{t.description}</div>}
        </div>
      ))}
    </div>
  )
}
