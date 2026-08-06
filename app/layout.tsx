import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import "./globals.css"
import { AuthProvider } from "@/components/auth-provider"
import { SessionBootstrap } from "@/components/session-bootstrap"
import { ToastProvider } from "@/components/ui/toast"

export const metadata: Metadata = {
  title: "NYUKI - Digital SACCO Management System",
  description:
    "Complete digital platform for African SACCOs and credit cooperatives to manage members, share capital, savings, loans, and audit reports.",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`min-h-full font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
        <AuthProvider>
          <ToastProvider>
            <SessionBootstrap />
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
