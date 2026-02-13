"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Link from "next/link"
import { useRouter } from "next/navigation"

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    saccoName: "",
    adminName: "",
    email: "",
    phone: "",
    district: "",
    password: "",
    confirmPassword: "",
  })
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    // Simulate registration process
    setTimeout(() => {
      setIsLoading(false)
      router.push("/dashboard")
    }, 2000)
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mb-4">
            <Link href="/" className="text-2xl font-bold text-primary">
              Sente Loan
            </Link>
          </div>
          <CardTitle>Get started today</CardTitle>
          <CardDescription>Create your SACCO account and start your free trial</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="saccoName">SACCO Name</Label>
              <Input
                id="saccoName"
                placeholder="Your SACCO Name"
                value={formData.saccoName}
                onChange={(e) => handleInputChange("saccoName", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="adminName">Admin Full Name</Label>
              <Input
                id="adminName"
                placeholder="John Doe"
                value={formData.adminName}
                onChange={(e) => handleInputChange("adminName", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@yoursacco.com"
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+256 700 000 000"
                value={formData.phone}
                onChange={(e) => handleInputChange("phone", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="district">District</Label>
              <Select onValueChange={(value) => handleInputChange("district", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select district" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kampala">Kampala</SelectItem>
                  <SelectItem value="wakiso">Wakiso</SelectItem>
                  <SelectItem value="mukono">Mukono</SelectItem>
                  <SelectItem value="jinja">Jinja</SelectItem>
                  <SelectItem value="mbarara">Mbarara</SelectItem>
                  <SelectItem value="gulu">Gulu</SelectItem>
                  <SelectItem value="lira">Lira</SelectItem>
                  <SelectItem value="masaka">Masaka</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => handleInputChange("password", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Creating account..." : "Start Free Trial"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm">
            <p className="text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </div>

          <div className="mt-4 text-center">
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
              ← Back to homepage
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
