"use client"

import type React from "react"
import { useState } from "react"
import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/toast"
import { LOGIN_ERROR_MESSAGES, LOGIN_SUCCESS_MESSAGES, resolveSignInErrorMessage } from "@/lib/auth-login-messages"
import { showPostLoginGreetingToast } from "@/lib/greeting"

export default function AdminLoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
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
      description: LOGIN_SUCCESS_MESSAGES.admin,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
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
      if (session?.user?.role !== "system_admin") {
        throw new Error("Not authorized for admin portal")
      }
      showLoginSuccess()
      showPostLoginGreetingToast(toast, session?.user?.name)
      router.push("/admin")
      router.refresh()
    } catch (err: any) {
      showLoginError(err?.message || LOGIN_ERROR_MESSAGES.signInFailed)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-8 items-center">
        <div className="hidden md:block space-y-6">
          <div>
            <Link href="/" className="text-3xl font-bold text-primary">
              Sente Loan
            </Link>
            <p className="text-lg text-muted-foreground mt-2">Financial Management Platform</p>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold">System Administration</h2>
            <ul className="space-y-2 text-muted-foreground">
              <li>• Onboard new SACCOs and Money Lenders</li>
              <li>• Configure institution-specific features</li>
              <li>• Manage system-wide settings</li>
              <li>• Monitor platform usage and analytics</li>
            </ul>
          </div>

          <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
            <h3 className="font-medium text-primary mb-2">Multi-Institutional Support</h3>
            <p className="text-sm text-muted-foreground">
              SenteLoans adapts to serve SACCOs, Microfinance Institutions, and Money Lenders with tailored interfaces
              and features for each institution type.
            </p>
          </div>
        </div>

        <Card className="w-full max-w-md mx-auto">
          <CardHeader className="text-center">
            <div className="mb-4 md:hidden">
              <Link href="/" className="text-2xl font-bold text-primary">
                Sente Loan
              </Link>
            </div>
            <CardTitle>System Admin Portal</CardTitle>
            <CardDescription>Sign in to manage institutions and system settings</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Admin Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@senteloans.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Signing in..." : "Sign In to Admin Portal"}
              </Button>
            </form>

            <div className="mt-6 p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Use your System Admin credentials to access the portal.</p>
            </div>

            <div className="mt-4 text-center">
              <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
                ← Back to homepage
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
