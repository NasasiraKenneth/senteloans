import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import "./globals.css"
import { AuthProvider } from "@/components/auth-provider"
import { SessionBootstrap } from "@/components/session-bootstrap"
import { ToastProvider } from "@/components/ui/toast"
import { ThemePaletteSwitcher } from "@/components/theme-palette-switcher"
import { GlobalScrollbar } from "@/components/global-scrollbar"

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
    <html lang="en" data-ui-accent="orange" className="h-full autohide-scrollbar" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var a=localStorage.getItem('senteloans_ui_accent')||'orange';document.documentElement.setAttribute('data-ui-accent',a);var t=localStorage.getItem('senteloans_theme_mode');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body className={`min-h-full font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
        <AuthProvider>
          <ToastProvider>
            <SessionBootstrap />
            <GlobalScrollbar />
            {children}
            <ThemePaletteSwitcher />
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
