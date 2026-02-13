import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import "./globals.css"
import { AuthProvider } from "@/components/auth-provider"
import { SessionBootstrap } from "@/components/session-bootstrap"
import { ToastProvider } from "@/components/ui/toast"

export const metadata: Metadata = {
  title: "Sente Loan - SACCO Management System",
  description:
    "Complete digital platform for Ugandan Saccos and credit cooperatives to manage members, track loans, and generate reports.",
  generator: "v0.app",
  icons: {
    icon: "https://res.cloudinary.com/hatari/image/upload/v1756391810/sente-loans/logos/favicon_f7tsiy.ico",
    apple: "https://res.cloudinary.com/hatari/image/upload/v1756391810/sente-loans/logos/favicon_f7tsiy.ico",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
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
