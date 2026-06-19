"use client"

import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { DashboardHeader } from "@/components/dashboard-header"
import { StaffSessionProvider } from "@/components/staff-session-provider"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <StaffSessionProvider>
      <div className="flex h-screen bg-background">
        <DashboardSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <DashboardHeader />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </StaffSessionProvider>
  )
}
