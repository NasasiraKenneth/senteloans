"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export function AdminInstitutionAdmins({ institutionId, onCreated }: { institutionId: string; onCreated?: () => void }) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; password?: string }>({})
  const [customPassword, setCustomPassword] = useState(false)

  function validate() {
    const errs: { name?: string; email?: string; password?: string } = {}
    if (!name.trim()) errs.name = "Full name is required"
    if (!email.trim()) {
      errs.email = "Email is required"
    } else {
      // Basic email format check
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) errs.email = "Enter a valid email address"
    }
    if (!password.trim()) {
      errs.password = "Password is required"
    } else if (password.length < 8) {
      errs.password = "Password must be at least 8 characters"
    }
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  function generatePassword(length = 12) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()_+"
    let out = ""
    const cryptoObj: Crypto | undefined =
      typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined
    if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
      const array = new Uint32Array(length)
      cryptoObj.getRandomValues(array)
      for (let i = 0; i < length; i++) out += chars[array[i] % chars.length]
    } else {
      for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)]
    }
    return out
  }

  useEffect(() => {
    // Autogenerate a password on first render if not set
    if (!password) setPassword(generatePassword(14))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCreate() {
    setLoading(true)
    setError(null)
    setSuccess(null)
    if (!validate()) {
      setLoading(false)
      return
    }
    try {
      const res = await fetch(`/api/admin/institutions/${institutionId}/admins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, password }),
      })
      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error || "Failed to create admin user")
      }
      setSuccess("Institution admin created successfully")
      setName("")
      setEmail("")
      setPhone("")
      setPassword("")
      setFieldErrors({})
      onCreated?.()
    } catch (e: any) {
      setError(e?.message || "Failed to create admin user")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="shadow-none ring-1 ring-border">
      <CardHeader className="border-b">
        <CardTitle>Add Institution Admin</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {error && <div className="text-sm text-red-600">{error}</div>}
        {success && <div className="text-sm text-green-600">{success}</div>}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="admin-name">Full Name</Label>
            <Input id="admin-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!fieldErrors.name} />
            {fieldErrors.name && <p className="text-xs text-red-600">{fieldErrors.name}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-email">Email</Label>
            <Input id="admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!fieldErrors.email} />
            {fieldErrors.email && <p className="text-xs text-red-600">{fieldErrors.email}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-phone">Phone</Label>
            <Input id="admin-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-password">Password</Label>
            <div className="flex gap-2">
              <Input
                id="admin-password"
                type="text"
                value={password}
                readOnly={!customPassword}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!fieldErrors.password}
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={() => setPassword(generatePassword(14))} title="Regenerate password">
                Regenerate
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(password)
                  } catch {}
                }}
                title="Copy password"
              >
                Copy
              </Button>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                id="toggle-custom-password"
                type="checkbox"
                className="h-3.5 w-3.5"
                checked={customPassword}
                onChange={(e) => setCustomPassword(e.target.checked)}
              />
              <label htmlFor="toggle-custom-password">Set custom password</label>
            </div>
            {fieldErrors.password && <p className="text-xs text-red-600">{fieldErrors.password}</p>}
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleCreate} disabled={loading}>
            {loading ? "Creating..." : "Create Admin User"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
