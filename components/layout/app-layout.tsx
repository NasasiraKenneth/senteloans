"use client";

import React from "react";
import { DashboardSidebar } from "../dashboard-sidebar";
import { DashboardHeader } from "../dashboard-header";

const AppLayout = ({children}: { children: React.ReactNode }) => {
    return (
        <div className="flex h-screen bg-background">
            <DashboardSidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <DashboardHeader />
                <main className="flex-1 overflow-y-auto p-6">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default AppLayout;
