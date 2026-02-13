"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AdminInstitutionAdmins } from "@/components/admin-institution-admins"

interface AdminRow {
  id: string
  full_name: string
  email: string
  phone_number: string | null
  status: string
  role: string
  supabase_user_id: string | null
  created_at: string
}

export function AdminInstitutionAdminsSection({ institutionId }: { institutionId: string }) {
  const [admins, setAdmins] = useState<AdminRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ full_name: string; phone_number: string; status: string }>({
    full_name: "",
    phone_number: "",
    status: "Active",
  })
  const [saving, setSaving] = useState(false)
  const [resettingId, setResettingId] = useState<string | null>(null)
  const [justGeneratedPassword, setJustGeneratedPassword] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/institutions/${institutionId}/admins`, { cache: "no-store" })
      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error || "Failed to load admins")
      }
      const { admins } = (await res.json()) as { admins: AdminRow[] }
      setAdmins(admins)
    } catch (e: any) {
      setError(e?.message || "Failed to load admins")
    } finally {
      setLoading(false)
    }
  }, [institutionId])

  useEffect(() => {
    load()
  }, [load])

  function generatePassword(length = 14) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()_+"
    let out = ""
    const cryptoObj: Crypto | undefined =
      typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined
    if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
      const arr = new Uint32Array(length)
      cryptoObj.getRandomValues(arr)
      for (let i = 0; i < length; i++) out += chars[arr[i] % chars.length]
    } else {
      for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)]
    }
    return out
  }

  async function resetPassword(userId: string) {
    const newPassword = generatePassword(14)
    setResettingId(userId)
    setError(null)
    setJustGeneratedPassword(null)
    try {
      const res = await fetch(`/api/admin/institutions/${institutionId}/admins/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_password: newPassword }),
      })
      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error || "Failed to reset password")
      }
      setJustGeneratedPassword(newPassword)
    } catch (e: any) {
      setError(e?.message || "Failed to reset password")
    } finally {
      setResettingId(null)
    }
  }

  function startEdit(row: AdminRow) {
    setEditingId(row.id)
    setEditForm({ full_name: row.full_name, phone_number: row.phone_number || "", status: row.status })
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function saveEdit() {
    if (!editingId) return
    setSaving(true)
    // basic validation
    if (!editForm.full_name.trim()) {
      setError("Full name is required")
      setSaving(false)
      return
    }
    try {
      const res = await fetch(`/api/admin/institutions/${institutionId}/admins/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      })
      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error || "Failed to update admin")
      }
      setEditingId(null)
      await load()
    } catch (e: any) {
      setError(e?.message || "Failed to update admin")
    } finally {
      setSaving(false)
    }
  }

  async function deleteAdmin(id: string) {
    if (!confirm("Are you sure you want to remove this administrator?")) return
    try {
      const res = await fetch(`/api/admin/institutions/${institutionId}/admins/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error || "Failed to delete admin")
      }
      await load()
    } catch (e: any) {
      setError(e?.message || "Failed to delete admin")
    }
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-none ring-1 ring-border">
        <CardHeader className="border-b">
          <CardTitle>Institution Admins</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {error && <div className="text-sm text-red-600">{error}</div>}
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading admins...</div>
          ) : admins.length === 0 ? (
            <div className="text-sm text-muted-foreground">No admins yet. Add one below.</div>
          ) : (
            <div className="space-y-2">
              {admins.map((a) => (
                <div key={a.id} className="border rounded-lg p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  {editingId === a.id ? (
                    <div className="flex-1 grid gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <Label>Full Name</Label>
                        <Input
                          value={editForm.full_name}
                          onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Phone</Label>
                        <Input
                          value={editForm.phone_number}
                          onChange={(e) => setEditForm((f) => ({ ...f, phone_number: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Status</Label>
                        <Select
                          value={editForm.status}
                          onValueChange={(value) => setEditForm((f) => ({ ...f, status: value }))}
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
                    </div>
                  ) : (
                    <div className="flex-1">
                      <div className="font-medium">{a.full_name}</div>
                      <div className="text-sm text-muted-foreground">{a.email}</div>
                      <div className="text-xs text-muted-foreground">{a.phone_number || "—"} • {a.status}</div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    {editingId === a.id ? (
                      <>
                        <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saving}>
                          Cancel
                        </Button>
                        <Button size="sm" onClick={saveEdit} disabled={saving}>
                          {saving ? "Saving..." : "Save"}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={resettingId === a.id}
                          type="button"
                          onClick={() => resetPassword(a.id)}
                          title="Generate and set a new password"
                        >
                          {resettingId === a.id ? "Resetting..." : "Reset Password"}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => startEdit(a)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => deleteAdmin(a.id)}>
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {justGeneratedPassword && (
                <div className="p-3 rounded-md border text-sm flex items-center justify-between">
                  <div>
                    <span className="font-medium">New password:</span> <span className="font-mono">{justGeneratedPassword}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(justGeneratedPassword)
                      } catch {}
                    }}
                  >
                    Copy
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AdminInstitutionAdmins institutionId={institutionId} onCreated={load} />
    </div>
  )
}
