"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Save, User, SettingsIcon, DollarSign, Lock } from "lucide-react"
import AppLayout from "@/components/layout/app-layout"
import { getSession, updateInstitutionConfig } from "@/lib/session"
import { useToast } from "@/components/ui/toast"

interface InstitutionConfig {
  modules: { loans: boolean; shares: boolean; savings: boolean; mobile_money: boolean }
  currency: string
  shareValue?: number
  minimumShares?: number
  maximumShares?: number
  clientTerminology: string
  membershipFee?: number
}

interface AdminProfile {
  fullName: string
  email: string
  phoneNumber: string
  role: string
}

interface InstitutionOrg {
  id: string
  name: string
  type: string
  address: string
  phone_number: string
  email: string
  license_number: string
  registration_number: string
  website: string
  established_date: string | null
}

export default function SettingsPage() {
  const { toast } = useToast()
  const [session, setSession] = useState<any>(null)
  const [institution, setInstitution] = useState<{ id: string; name: string; type: string } | null>(null)
  const [config, setConfig] = useState<InstitutionConfig | null>(null)

  const [adminProfile, setAdminProfile] = useState<AdminProfile>({
    fullName: "",
    email: "",
    phoneNumber: "",
    role: "",
  })

  const [isSavingInstitution, setIsSavingInstitution] = useState(false)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isSavingOrg, setIsSavingOrg] = useState(false)
  const [pwdSaving, setPwdSaving] = useState(false)
  const [passwords, setPasswords] = useState({ newPassword: "", confirmPassword: "" })
  const [org, setOrg] = useState<InstitutionOrg | null>(null)

  useEffect(() => {
    const sessionData = getSession()
    setSession(sessionData)
    ;(async () => {
      try {
        const [instRes, profRes, orgRes] = await Promise.all([
          fetch("/api/institution/settings", { cache: "no-store" }),
          fetch("/api/institution/profile", { cache: "no-store" }),
          fetch("/api/institution/organization", { cache: "no-store" }),
        ])
        if (instRes.ok) {
          const inst = await instRes.json()
          setInstitution({ id: inst.id, name: inst.name, type: inst.type })
          setConfig(inst.config)
        }
        if (profRes.ok) {
          const prof = await profRes.json()
          setAdminProfile({
            fullName: prof.name || "",
            email: prof.email || "",
            phoneNumber: prof.phone || "",
            role: prof.role || "",
          })
        }
        if (orgRes.ok) {
          const o = await orgRes.json()
          setOrg({
            id: o.id,
            name: o.name,
            type: o.type,
            address: o.address || "",
            phone_number: o.phone_number || "",
            email: o.email || "",
            license_number: o.license_number || "",
            registration_number: o.registration_number || "",
            website: o.website || "",
            established_date: o.established_date || null,
          })
        }
      } catch (_) {
        // swallow
      }
    })()
  }, [])

  const setConfigField = (field: keyof InstitutionConfig, value: any) => {
    setConfig((prev) => (prev ? { ...prev, [field]: value } : prev))
  }
  const setModule = (key: keyof InstitutionConfig["modules"], value: boolean) => {
    setConfig((prev) => (prev ? { ...prev, modules: { ...prev.modules, [key]: value } } : prev))
  }

  const handleAdminProfileChange = (field: keyof AdminProfile, value: string) => {
    setAdminProfile((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleSaveInstitution = async () => {
    if (!config || !institution) return
    // basic client-side validations
    const isSaccoOrMfi = institution.type === "SACCO" || institution.type === "MFI"
    if (isSaccoOrMfi && config.modules.shares) {
      if (!config.shareValue || config.shareValue <= 0) {
        toast({ title: "Validation", description: "Please set a valid Value per Share for shares-enabled institutions.", variant: "warning" })
        return
      }
      if (typeof config.minimumShares === "number" && config.minimumShares < 0) {
        toast({ title: "Validation", description: "Minimum shares must be >= 0", variant: "warning" })
        return
      }
      if (
        typeof config.minimumShares === "number" &&
        typeof config.maximumShares === "number" &&
        config.minimumShares > config.maximumShares
      ) {
        toast({ title: "Validation", description: "Minimum shares cannot be greater than maximum shares", variant: "warning" })
        return
      }
    }

    setIsSavingInstitution(true)
    try {
      const a = await fetch("/api/institution/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      })
      if (!a.ok) {
        const { error } = await a.json()
        throw new Error(error || "Failed to save institution settings")
      }
      const updated = await a.json()
      // update local session config immediately so the app reflects changes without reload
      if (updated?.config) {
        try { updateInstitutionConfig(updated.config) } catch {}
        setConfig(updated.config)
      }
      toast({ title: "Saved", description: "Institution settings updated.", variant: "success" })
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to save settings", variant: "destructive" })
    } finally {
      setIsSavingInstitution(false)
    }
  }

  const handleSaveProfile = async () => {
    setIsSavingProfile(true)
    try {
      const b = await fetch("/api/institution/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: adminProfile.fullName, phone: adminProfile.phoneNumber }),
      })
      if (!b.ok) {
        const { error } = await b.json()
        throw new Error(error || "Failed to save profile")
      }
      toast({ title: "Saved", description: "Profile updated.", variant: "success" })
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to save profile", variant: "destructive" })
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    const { newPassword, confirmPassword } = passwords
    if (!newPassword || newPassword.length < 8) { toast({ title: "Validation", description: "Password must be at least 8 characters", variant: "warning" }); return }
    if (newPassword !== confirmPassword) { toast({ title: "Validation", description: "Passwords do not match", variant: "warning" }); return }
    setPwdSaving(true)
    try {
      const res = await fetch("/api/institution/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword, confirmPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to change password")
      toast({ title: "Saved", description: "Password changed successfully.", variant: "success" })
      setPasswords({ newPassword: "", confirmPassword: "" })
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to change password", variant: "destructive" })
    } finally {
      setPwdSaving(false)
    }
  }

  const getInstitutionTerminology = () => {
    if (!institution) return { name: "Institution", type: "Institution" }
    switch (institution.type) {
      case "SACCO":
        return { name: "SACCO", type: "SACCO" }
      case "MFI":
        return { name: "MFI", type: "Microfinance Institution" }
      case "Money Lender":
        return { name: "Money Lender", type: "Money Lending Business" }
      default:
        return { name: "Institution", type: "Institution" }
    }
  }

  const terminology = getInstitutionTerminology()

  if (!institution || !config) {
    return (
      <AppLayout>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading settings...</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  const setOrgField = (field: keyof InstitutionOrg, value: string) => {
    setOrg((prev) => (prev ? { ...prev, [field]: value } as InstitutionOrg : prev))
  }

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const isValidPhone = (phone: string) => /^[+\d][\d\s-]{6,19}$/.test(phone)
  const isValidUrl = (url: string) => {
    try { new URL(url); return true } catch { return false }
  }

  const handleSaveOrg = async () => {
    if (!org) return
    // client-side validation
    if (org.email && !isValidEmail(org.email)) {
      toast({ title: "Validation", description: "Enter a valid email address", variant: "warning" })
      return
    }
    if (org.phone_number && !isValidPhone(org.phone_number)) {
      toast({ title: "Validation", description: "Enter a valid phone number", variant: "warning" })
      return
    }
    if (org.website && !isValidUrl(org.website)) {
      toast({ title: "Validation", description: "Enter a valid website URL (include http/https)", variant: "warning" })
      return
    }
    if (org.established_date) {
      const d = new Date(org.established_date)
      if (Number.isNaN(d.getTime())) {
        toast({ title: "Validation", description: "Established date is invalid", variant: "warning" })
        return
      }
    }

    setIsSavingOrg(true)
    try {
      const res = await fetch("/api/institution/organization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: org.address,
          phone_number: org.phone_number,
          email: org.email,
          license_number: org.license_number,
          registration_number: org.registration_number,
          website: org.website,
          established_date: org.established_date,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to save institution profile")
      setOrg((prev) => (prev ? { ...prev, ...data } : prev))
      toast({ title: "Saved", description: "Institution profile updated.", variant: "success" })
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to save institution profile", variant: "destructive" })
    } finally {
      setIsSavingOrg(false)
    }
  }

  return (
    <AppLayout>
      <div className="container mx-auto max-w-6xl">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                  <p className="text-muted-foreground">
                    Manage your {terminology.type.toLowerCase()} configuration and admin profile
                  </p>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {/* Institution Configuration */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <SettingsIcon className="h-5 w-5" />
                      {terminology.name} Configuration
                    </CardTitle>
                    <CardDescription>
                      Configure your {terminology.type.toLowerCase()}'s operational settings
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{terminology.name} Name</Label>
                        <Input value={institution.name} readOnly />
                      </div>
                      <div className="space-y-2">
                        <Label>Institution Type</Label>
                        <Input value={institution.type} readOnly />
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label htmlFor="currency">Preferred Currency</Label>
                      <Select value={config.currency} onValueChange={(value) => setConfigField("currency", value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="UGX">Ugandan Shilling (UGX)</SelectItem>
                          <SelectItem value="USD">US Dollar (USD)</SelectItem>
                          <SelectItem value="KES">Kenyan Shilling (KES)</SelectItem>
                          <SelectItem value="TZS">Tanzanian Shilling (TZS)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {((institution.type === "SACCO" || institution.type === "MFI") && true) && (
                      <div className="space-y-2">
                        <Label>Enable Shares</Label>
                        <div className="flex items-center gap-2">
                          <input
                            id="enableShares"
                            type="checkbox"
                            checked={!!config.modules.shares}
                            onChange={(e) => setModule("shares", e.target.checked)}
                          />
                          <Label htmlFor="enableShares" className="text-sm text-muted-foreground">
                            Allow members to hold shares (SACCO/MFI only)
                          </Label>
                        </div>
                      </div>
                    )}

                    {((institution.type === "SACCO" || institution.type === "MFI") && config.modules.shares) && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="minShares">Minimum Number of Shares</Label>
                            <Input
                              id="minShares"
                              type="number"
                              value={Number(config.minimumShares ?? 0)}
                              onChange={(e) => setConfigField("minimumShares", Number.parseInt(e.target.value || "0"))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="shareAmount">Value per Share ({config.currency})</Label>
                            <Input
                              id="shareAmount"
                              type="number"
                              value={Number(config.shareValue ?? 0)}
                              onChange={(e) => setConfigField("shareValue", Number.parseInt(e.target.value || "0"))}
                            />
                          </div>
                        </div>

                        <div className="pt-4">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <DollarSign className="h-4 w-4" />
                            <span>
                              Minimum capital requirement: {config.currency}{" "}
                              {((Number(config.minimumShares ?? 0) * Number(config.shareValue ?? 0)) || 0).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="clientTerm">Client Terminology</Label>
                        <Input
                          id="clientTerm"
                          value={config.clientTerminology}
                          onChange={(e) => setConfigField("clientTerminology", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="membershipFee">Membership Fee ({config.currency})</Label>
                        <Input
                          id="membershipFee"
                          type="number"
                          min={0}
                          value={Number(config.membershipFee ?? 0)}
                          onChange={(e) => setConfigField("membershipFee", Number.parseInt(e.target.value || "0"))}
                          placeholder="e.g. 50000"
                        />
                      </div>
                    </div>
                    <div className="pt-2">
                      <Button onClick={handleSaveInstitution} disabled={isSavingInstitution}>
                        <Save className="mr-2 h-4 w-4" />
                        {isSavingInstitution ? "Saving..." : "Save Institution Settings"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Institution Profile (Organization) */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      {terminology.name} Profile
                    </CardTitle>
                    <CardDescription>Update your institution's official details</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{terminology.name} Name</Label>
                        <Input value={org?.name || ""} readOnly />
                      </div>
                      <div className="space-y-2">
                        <Label>Institution Type</Label>
                        <Input value={org?.type || ""} readOnly />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="regNo">Registration Number</Label>
                      <Input id="regNo" value={org?.registration_number || ""} onChange={(e) => setOrgField("registration_number", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="licenseNo">License Number</Label>
                      <Input id="licenseNo" value={org?.license_number || ""} onChange={(e) => setOrgField("license_number", e.target.value)} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="address">Address</Label>
                      <Input id="address" value={org?.address || ""} onChange={(e) => setOrgField("address", e.target.value)} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="orgPhone">Phone Number</Label>
                        <Input id="orgPhone" value={org?.phone_number || ""} onChange={(e) => setOrgField("phone_number", e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="orgEmail">Email</Label>
                        <Input id="orgEmail" type="email" value={org?.email || ""} onChange={(e) => setOrgField("email", e.target.value)} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="website">Website</Label>
                        <Input id="website" value={org?.website || ""} onChange={(e) => setOrgField("website", e.target.value)} placeholder="https://example.com" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="established">Established Date</Label>
                        <Input id="established" type="date" value={(org?.established_date ?? "") as string} onChange={(e) => setOrgField("established_date", e.target.value)} />
                      </div>
                    </div>

                    <div className="pt-2">
                      <Button onClick={handleSaveOrg} disabled={isSavingOrg}>
                        <Save className="mr-2 h-4 w-4" />
                        {isSavingOrg ? "Saving..." : "Save Institution Profile"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Admin Profile */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Admin Profile
                    </CardTitle>
                    <CardDescription>Manage your personal information and contact details</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Badge variant="secondary">{adminProfile.role}</Badge>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="fullName">Full Name</Label>
                      <Input
                        id="fullName"
                        value={adminProfile.fullName}
                        onChange={(e) => handleAdminProfileChange("fullName", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        value={adminProfile.email}
                        onChange={(e) => handleAdminProfileChange("email", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phoneNumber">Phone Number</Label>
                      <Input
                        id="phoneNumber"
                        type="tel"
                        value={adminProfile.phoneNumber}
                        onChange={(e) => handleAdminProfileChange("phoneNumber", e.target.value)}
                      />
                    </div>

                    <div className="pt-2">
                      <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
                        <Save className="mr-2 h-4 w-4" />
                        {isSavingProfile ? "Saving..." : "Save Profile"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                
                {/* Security (Password Reset) */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lock className="h-5 w-5" />
                      Security
                    </CardTitle>
                    <CardDescription>Update your password</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleChangePassword} className="grid gap-3 max-w-md">
                      <div className="space-y-2">
                        <Label htmlFor="newPassword">New Password</Label>
                        <Input
                          id="newPassword"
                          type="password"
                          value={passwords.newPassword}
                          onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))}
                          placeholder="At least 8 characters"
                          required
                          minLength={8}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirm New Password</Label>
                        <Input
                          id="confirmPassword"
                          type="password"
                          value={passwords.confirmPassword}
                          onChange={(e) => setPasswords((p) => ({ ...p, confirmPassword: e.target.value }))}
                          required
                          minLength={8}
                        />
                      </div>
                      <div>
                        <Button type="submit" disabled={pwdSaving}>{pwdSaving ? "Updating..." : "Change Password"}</Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </div>

              
            </div>
          </div>
    </AppLayout>
  )
}
