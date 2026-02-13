"use client"

import type React from "react"

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ArrowLeft, Save, Building2, Contact, FileText, Settings } from "lucide-react"
import { notFound } from "next/navigation"

interface EditInstitutionPageProps {
  params: Promise<{ id: string }>
}

export default function EditInstitutionPage({ params }: EditInstitutionPageProps) {
  const { id } = use(params)
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    type: "" as string, // 'SACCO' | 'MFI' | 'Money Lender'
    contactPerson: "",
    email: "",
    phone: "",
    address: "",
    status: "Active",
    clientTerminology: "Client",
    modules: {
      savings: false,
      loans: false,
      shares: false,
    },
    registrationNumber: "",
    licenseNumber: "",
    website: "",
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/admin/institutions/${id}`, { cache: "no-store" })
        if (!res.ok) {
          if (res.status === 404) {
            notFound()
            return
          }
          throw new Error((await res.json()).error || "Failed to load institution")
        }
        const { institution } = await res.json()
        if (cancelled) return
        const settings = institution.settings || {}
        const modules = settings.modules || {}
        setFormData({
          name: institution.name || "",
          type: institution.type || "",
          contactPerson: settings.contactPerson || "",
          email: institution.email || "",
          phone: institution.phone_number || "",
          address: institution.address || "",
          status: institution.status || "Active",
          clientTerminology: settings.clientTerminology || "Client",
          modules: {
            savings: Boolean(modules.savings),
            loans: Boolean(modules.loans),
            shares: Boolean(modules.shares),
          },
          registrationNumber: institution.registration_number || "",
          licenseNumber: institution.license_number || "",
          website: institution.website || "",
        })
        setLoading(false)
      } catch (e: any) {
        if (cancelled) return
        setLoadError(e?.message || "Failed to load")
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<{ name?: string; email?: string; type?: string; status?: string }>({})

  const validate = () => {
    const errs: { name?: string; email?: string; type?: string; status?: string } = {}
    if (!formData.name.trim()) errs.name = "Institution name is required"
    if (!formData.type) errs.type = "Institution type is required"
    if (!formData.status) errs.status = "Status is required"
    if (formData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(formData.email)) errs.email = "Enter a valid email address"
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleModuleChange = (module: string, enabled: boolean) => {
    setFormData((prev) => ({
      ...prev,
      modules: { ...prev.modules, [module]: enabled },
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setIsSubmitting(true)

    try {
      const payload = {
        name: formData.name,
        type: formData.type,
        status: formData.status,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        registrationNumber: formData.registrationNumber,
        licenseNumber: formData.licenseNumber,
        website: formData.website,
        clientTerminology: formData.clientTerminology,
        contactPerson: formData.contactPerson,
        modules: formData.modules,
      }
      const res = await fetch(`/api/admin/institutions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error || "Failed to save changes")
      }
      router.push(`/admin/institutions/${id}`)
    } catch (error) {
      console.error("Error updating institution:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <Link href={`/admin/institutions/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Details
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-primary flex items-center">
            <Building2 className="mr-3 h-8 w-8" />
            Edit Institution
          </h1>
          <p className="text-muted-foreground">Update {formData.name || "Institution"} details and configuration</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-6">
          {/* Header Skeleton */}
          <div className="flex items-center space-x-4">
            <Skeleton className="h-9 w-24" />
            <div className="space-y-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>

          {/* Form Skeleton */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent className="space-y-6">
              <Skeleton className="h-10 w-full" />
              <div className="grid gap-4 md:grid-cols-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            </CardContent>
          </Card>
        </div>
      ) : loadError ? (
        <div className="p-6 text-red-600">{loadError}</div>
      ) : (
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Basic Information */}
          <Card className="shadow-none ring-1 ring-border">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center">
                <Building2 className="mr-2 h-5 w-5" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Institution Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Institution Type</Label>
                <Select 
                  value={formData.type} 
                  onValueChange={(value) => handleInputChange("type", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select institution type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SACCO">SACCO</SelectItem>
                    <SelectItem value="MFI">Microfinance Institution</SelectItem>
                    <SelectItem value="Money Lender">Money Lender</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select 
                  value={formData.status} 
                  onValueChange={(value) => handleInputChange("status", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                    <SelectItem value="Suspended">Suspended</SelectItem>
                    <SelectItem value="Closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="clientTerminology">Client Terminology</Label>
                <Select 
                  value={formData.clientTerminology} 
                  onValueChange={(value) => handleInputChange("clientTerminology", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select client term" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Member">Member</SelectItem>
                    <SelectItem value="Client">Client</SelectItem>
                    <SelectItem value="Customer">Customer</SelectItem>
                    <SelectItem value="Borrower">Borrower</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card className="shadow-none ring-1 ring-border">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center">
                <Contact className="mr-2 h-5 w-5" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contactPerson">Contact Person</Label>
                <Input
                  id="contactPerson"
                  value={formData.contactPerson}
                  onChange={(e) => handleInputChange("contactPerson", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  value={formData.address}
                  onChange={(e) => handleInputChange("address", e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Registration & License */}
          <Card className="shadow-none ring-1 ring-border">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center">
                <FileText className="mr-2 h-5 w-5" />
                Registration & License
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="registrationNumber">Registration Number</Label>
                <Input
                  id="registrationNumber"
                  value={formData.registrationNumber}
                  onChange={(e) => handleInputChange("registrationNumber", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="licenseNumber">License Number</Label>
                <Input
                  id="licenseNumber"
                  value={formData.licenseNumber}
                  onChange={(e) => handleInputChange("licenseNumber", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  type="url"
                  value={formData.website}
                  onChange={(e) => handleInputChange("website", e.target.value)}
                  placeholder="https://example.com"
                />
              </div>
            </CardContent>
          </Card>

          {/* Modules */}
          <Card className="shadow-none ring-1 ring-border">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center">
                <Settings className="mr-2 h-5 w-5" />
                Modules
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Customize available features for this institution
              </p>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="flex items-start space-x-3 rounded-lg border p-4">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="savings-module" className="font-medium">
                      Savings
                    </Label>
                    <p className="text-sm text-muted-foreground">Savings accounts and deposits</p>
                  </div>
                  <Switch
                    id="savings-module"
                    checked={formData.modules.savings}
                    onCheckedChange={(checked) => handleModuleChange("savings", checked)}
                  />
                </div>

                <div className="flex items-start space-x-3 rounded-lg border p-4">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="loans-module" className="font-medium">
                      Loans
                    </Label>
                    <p className="text-sm text-muted-foreground">Loan management and processing</p>
                  </div>
                  <Switch
                    id="loans-module"
                    checked={formData.modules.loans}
                    onCheckedChange={(checked) => handleModuleChange("loans", checked)}
                  />
                </div>

                <div className="flex items-start space-x-3 rounded-lg border p-4">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="shares-module" className="font-medium">
                      Shares
                    </Label>
                    <p className="text-sm text-muted-foreground">Share capital management</p>
                  </div>
                  <Switch
                    id="shares-module"
                    checked={formData.modules.shares}
                    onCheckedChange={(checked) => handleModuleChange("shares", checked)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-4 pt-4">
          <Link href={`/admin/institutions/${id}`}>
            <Button variant="outline">Cancel</Button>
          </Link>
          <Button type="submit" disabled={isSubmitting}>
            <Save className="mr-2 h-4 w-4" />
            {isSubmitting ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
      )}
    </div>
  )
}
