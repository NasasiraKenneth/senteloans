"use client"

import type React from "react"

import { Suspense, useState } from "react"
import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Smartphone, Shield, Clock } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import { LOGIN_ERROR_MESSAGES, LOGIN_SUCCESS_MESSAGES, resolveSignInErrorMessage } from "@/lib/auth-login-messages"
import { showPostLoginGreetingToast } from "@/lib/greeting"
// TODO: Add phone login via OTP

export default function ClientLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <ClientLoginForm />
    </Suspense>
  )
}

function ClientLoginForm() {
  const [phoneOrEmail, setPhoneOrEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
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
    setIsLoading(true)
    const trimmed = phoneOrEmail.trim()
    const isEmail = /@/.test(trimmed)
    if (!trimmed || !isEmail) {
      showLoginError("Please enter a valid email address (phone OTP coming soon)")
      setIsLoading(false)
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmed)) {
      showLoginError("Please enter a valid email address")
      setIsLoading(false)
      return
    }
    if (typeof password !== "string" || password.length < 6) {
      showLoginError("Password must be at least 6 characters")
      setIsLoading(false)
      return
    }

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
        setIsLoading(false)
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

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary text-primary-foreground p-4">
        <div className="flex items-center space-x-3">
          <Link href="/">
            <Button size="sm" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-primary-foreground">Client Portal</h1>
            <p className="text-sm opacity-90 text-primary-foreground">Secure access to your account</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        <Card className="w-full">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl">Welcome Back</CardTitle>
            <CardDescription>Sign in to access your financial information</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phoneOrEmail">Email</Label>
                <Input
                  id="phoneOrEmail"
                  type="text"
                  placeholder="email@example.com"
                  value={phoneOrEmail}
                  onChange={(e) => setPhoneOrEmail(e.target.value)}
                  required
                  className="form-input"
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
                  className="form-input"
                />
              </div>

              <Button type="submit" className="w-full h-12" disabled={isLoading}>
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
            </form>

            <div className="mt-6 p-4 bg-muted/50 rounded-lg">
              <h4 className="text-sm font-medium mb-2">Demo Login Credentials:</h4>
              <div className="text-xs space-y-1 text-muted-foreground">
                <div>
                  <strong>SACCO Member:</strong> sarah.nakamya@email.com
                </div>
                <div>
                  <strong>MFI Client:</strong> grace.namugga@email.com
                </div>
                <div>
                  <strong>Money Lender Borrower:</strong> moses.kiprotich@email.com
                </div>
              </div>
            </div>

            <div className="mt-4 text-center">
              <Link href="/forgot-password" className="text-sm text-accent hover:underline">
                Forgot your password?
              </Link>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-center">Why use our portal?</h3>
          <div className="grid gap-4">
            <div className="flex items-center space-x-3 p-3 bg-card rounded-lg border">
              <Smartphone className="h-8 w-8 text-primary" />
              <div>
                <h4 className="font-medium">Mobile Optimized</h4>
                <p className="text-sm text-muted-foreground">Designed for your smartphone with fast loading</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-3 bg-card rounded-lg border">
              <Shield className="h-8 w-8 text-primary" />
              <div>
                <h4 className="font-medium">Secure & Safe</h4>
                <p className="text-sm text-muted-foreground">
                  Your financial data is protected with bank-level security
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-3 bg-card rounded-lg border">
              <Clock className="h-8 w-8 text-primary" />
              <div>
                <h4 className="font-medium">24/7 Access</h4>
                <p className="text-sm text-muted-foreground">Check your account anytime, anywhere</p>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to homepage
          </Link>
        </div>
      </div>
    </div>
  )
}
