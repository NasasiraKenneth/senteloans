"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

import {
  ArrowLeft,
  Search,
  User,
  DollarSign,
  CreditCard,
  Smartphone,
  CheckCircle,
  Printer,
  Plus,
  ArrowRight,
} from "lucide-react"
import Link from "next/link"
import { useToast } from "@/components/ui/toast"
import { useEffect } from "react"

type TransactionStep = "member-search" | "account-selection" | "transaction-details" | "confirmation"

interface SelectedMember {
  id: string
  fullName: string
  memberNumber: string
  kycStatus: string
}

interface MemberAccount {
  id: string
  type: "Savings" | "Shares"
  accountNumber?: string
  balance: number
  accountType?: string
}

interface TransactionData {
  member: SelectedMember | null
  account: MemberAccount | null
  transactionType: "Deposit" | "Withdrawal" | ""
  amount: string
  paymentMode: "Cash" | "Mobile Money" | "Bank" | ""
  notes: string
}

export default function NewTransactionPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [currentStep, setCurrentStep] = useState<TransactionStep>("member-search")
  const [searchQuery, setSearchQuery] = useState("")
  const [transactionData, setTransactionData] = useState<TransactionData>({
    member: null,
    account: null,
    transactionType: "",
    amount: "",
    paymentMode: "Cash",
    notes: "",
  })
  const [submitting, setSubmitting] = useState(false)
  const [memberResults, setMemberResults] = useState<any[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [accounts, setAccounts] = useState<MemberAccount[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null)
  const [accountsByMember, setAccountsByMember] = useState<Record<string, MemberAccount[]>>({})
  const [loadingAccountsFor, setLoadingAccountsFor] = useState<string | null>(null)

  // Live search members using API
  useEffect(() => {
    let timer: any
    let abort = false
    const doSearch = async () => {
      const q = searchQuery.trim()
      if (q.length < 2) {
        setMemberResults([])
        return
      }
      setLoadingMembers(true)
      try {
        const res = await fetch(`/api/institution/members?search=${encodeURIComponent(q)}&limit=10`, { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || "Failed to search members")
        if (!abort) setMemberResults(data.members || data.clients || [])
      } catch (e) {
        if (!abort) {
          const message = (e as Error)?.message || "Failed to search members"
          toast({ title: "Search failed", description: message, variant: "destructive" })
        }
        if (!abort) setMemberResults([])
      } finally {
        if (!abort) setLoadingMembers(false)
      }
    }
    timer = setTimeout(doSearch, 300)
    return () => {
      abort = true
      clearTimeout(timer)
    }
  }, [searchQuery])

  const fetchMemberAccounts = async (memberId: string) => {
    setLoadingAccounts(true)
    try {
      const res = await fetch(`/api/institution/savings?member_id=${encodeURIComponent(memberId)}&limit=50`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Failed to load accounts")
      const mapped: MemberAccount[] = (data.items || data.accounts || []).map((a: any) => ({
        id: a.id,
        type: "Savings",
        accountNumber: a.account_number || a.accountNumber,
        balance: Number(a.available_balance ?? a.availableBalance ?? 0),
        accountType: a.account_type || a.accountType,
      }))
      setAccounts(mapped)
      return mapped
    } catch (e) {
      const message = (e as Error)?.message || "Failed to load accounts"
      toast({ title: "Failed to load accounts", description: message, variant: "destructive" })
      setAccounts([])
      return [] as MemberAccount[]
    } finally {
      setLoadingAccounts(false)
    }
  }

  // Load accounts for a member in the search results (expand preview)
  const loadAccountsForMember = async (memberId: string) => {
    setLoadingAccountsFor(memberId)
    try {
      // Use same endpoint but don't overwrite main accounts selection state
      const res = await fetch(`/api/institution/savings?member_id=${encodeURIComponent(memberId)}&limit=50`, { cache: "no-store" })
      const data = await res.json()
      const mapped: MemberAccount[] = (data.items || data.accounts || []).map((a: any) => ({
        id: a.id,
        type: "Savings",
        accountNumber: a.account_number || a.accountNumber,
        balance: Number(a.available_balance ?? a.availableBalance ?? 0),
        accountType: a.account_type || a.accountType,
      }))
      setAccountsByMember((prev) => ({ ...prev, [memberId]: mapped }))
    } finally {
      setLoadingAccountsFor(null)
    }
  }

  const selectMember = (member: any) => {
    setTransactionData((prev) => ({
      ...prev,
      member: {
        id: member.id,
        fullName: member.full_name || member.fullName,
        memberNumber: member.member_number || member.client_number || member.clientNumber,
        kycStatus: member.kyc_status || member.kycStatus,
      },
    }))
    setCurrentStep("account-selection")
    fetchMemberAccounts(member.id)
  }

  const selectAccountAndTransaction = (account: MemberAccount, transactionType: "Deposit" | "Withdrawal") => {
    setTransactionData((prev) => ({
      ...prev,
      account,
      transactionType,
    }))
    setCurrentStep("transaction-details")
  }

  const completeTransaction = () => {
    // Move to confirmation step; actual persistence happens after final confirm
    setCurrentStep("confirmation")
  }

  const confirmAndSubmit = async () => {
    if (!transactionData.member || !transactionData.account || !transactionData.transactionType || !transactionData.amount) {
      toast({ title: "Missing information", description: "Select member, account, type and enter amount.", variant: "destructive" })
      return
    }
    const amountNum = Number(transactionData.amount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast({ title: "Invalid amount", description: "Amount must be greater than zero.", variant: "destructive" })
      return
    }
    // Map UI payment mode to DB enum
    const mode = transactionData.paymentMode === "Bank" ? "Bank Transfer" : transactionData.paymentMode
    const payload = {
      member_id: transactionData.member.id,
      account_id: transactionData.account.id,
      type: transactionData.transactionType,
      amount: amountNum,
      mode,
      description: transactionData.notes || "",
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/institution/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Failed to create transaction")

      toast({ title: "Transaction created", description: `Transaction ${data.transaction_number} completed.` })
      router.push(`/transactions/${data.id}`)
    } catch (e: any) {
      const message = e?.message || "Unexpected error"
      if (message === "missing_permission:create_transaction") {
        toast({ title: "Access denied", description: "You do not have permission to create transactions.", variant: "warning" })
      } else {
        toast({ title: "Create failed", description: message, variant: "destructive" })
      }
    } finally {
      setSubmitting(false)
    }
  }

  const startNewTransaction = () => {
    setTransactionData({
      member: null,
      account: null,
      transactionType: "",
      amount: "",
      paymentMode: "Cash",
      notes: "",
    })
    setSearchQuery("")
    setCurrentStep("member-search")
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: "UGX",
      minimumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <>
      <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center space-x-4">
              <Link href="/transactions">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-balance">New Transaction</h1>
                <p className="text-muted-foreground text-pretty">Process a new transaction for a SACCO member.</p>
              </div>
            </div>

            {/* Wizard Step Indicator */}
            <div className="flex items-center justify-center space-x-4 py-6">
              <div className="flex items-center space-x-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    currentStep === "member-search"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  1
                </div>
                <span
                  className={`text-sm font-medium ${
                    currentStep === "member-search" ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  Find Member
                </span>
              </div>

              <ArrowRight className="h-4 w-4 text-muted-foreground" />

              <div className="flex items-center space-x-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    currentStep === "account-selection"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  2
                </div>
                <span
                  className={`text-sm font-medium ${
                    currentStep === "account-selection" ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  Select Account
                </span>
              </div>

              <ArrowRight className="h-4 w-4 text-muted-foreground" />

              <div className="flex items-center space-x-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    currentStep === "transaction-details"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  3
                </div>
                <span
                  className={`text-sm font-medium ${
                    currentStep === "transaction-details" ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  Transaction Details
                </span>
              </div>

              <ArrowRight className="h-4 w-4 text-muted-foreground" />

              <div className="flex items-center space-x-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    currentStep === "confirmation"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  4
                </div>
                <span
                  className={`text-sm font-medium ${
                    currentStep === "confirmation" ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  Confirm
                </span>
              </div>
            </div>

            {/* Card-based Layout */}
            <div className="bg-card border border-border rounded-lg p-6">
              {/* Step 1: Member Search */}
              {currentStep === "member-search" && (
                <div className="space-y-6">
                  <div className="flex items-center space-x-3 mb-6">
                    <Search className="h-5 w-5 text-primary" />
                    <div>
                      <h2 className="text-lg font-semibold">Find Member</h2>
                      <p className="text-sm text-muted-foreground">
                        Search for the member who wants to make a transaction
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="member-search" className="text-sm font-medium">
                        Search by name, member number, or phone
                      </Label>
                      <div className="relative mt-2">
                        <Input
                          id="member-search"
                          placeholder="Enter member name, number, or phone..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="h-12 text-base border-border focus:border-primary"
                          autoFocus
                        />
                      </div>
                    </div>

                    {searchQuery && (
                      <div className="space-y-2">
                        {memberResults.map((member) => (
                          <div
                            key={member.id}
                            className="p-4 border border-border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                            onClick={() => selectMember(member)}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium">{member.full_name || member.fullName}</div>
                                        <div className="text-sm text-muted-foreground">
                                  Client No: {member.member_number || member.client_number || member.clientNumber}
                                </div>
                                {(member.phone_number || member.phoneNumber || member.email) && (
                                  <div className="text-xs text-muted-foreground">
                                    {(member.phone_number || member.phoneNumber) ?? ""}
                                    {((member.phone_number || member.phoneNumber) && member.email) ? " • " : ""}
                                    {member.email ?? ""}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center space-x-2">
                                {(member.kyc_status || member.kycStatus) === "Verified" && (
                                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                                    Verified
                                  </span>
                                )}
                                <button
                                  type="button"
                                  className="text-xs underline text-primary"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    const next = expandedMemberId === member.id ? null : member.id
                                    setExpandedMemberId(next)
                                    if (next && !accountsByMember[member.id]) {
                                      loadAccountsForMember(member.id)
                                    }
                                  }}
                                >
                                  {expandedMemberId === member.id ? "Hide accounts" : "View accounts"}
                                </button>
                              </div>
                            </div>

                            {expandedMemberId === member.id && (
                              <div className="mt-3 space-y-2">
                                {loadingAccountsFor === member.id && (
                                  <div className="text-xs text-muted-foreground">Loading accounts…</div>
                                )}
                                {(accountsByMember[member.id] || []).map((acc) => (
                                  <div
                                    key={acc.id}
                                    className="flex items-center justify-between border rounded p-2 bg-background hover:bg-muted/50 cursor-pointer"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      // Proceed to account-selection with ONLY the clicked account
                                      setTransactionData((prev) => ({
                                        ...prev,
                                        member: {
                                          id: member.id,
                                          fullName: member.full_name || member.fullName,
                                          memberNumber: member.member_number || member.client_number || member.clientNumber,
                                          kycStatus: member.kyc_status || member.kycStatus,
                                        },
                                        account: null,
                                        transactionType: "",
                                      }))
                                      setAccounts([acc])
                                      setExpandedMemberId(null)
                                      setCurrentStep("account-selection")
                                    }}
                                  >
                                    <div>
                                      <div className="text-sm font-medium">{acc.type} {acc.accountNumber ? `• ${acc.accountNumber}` : ""}</div>
                                      <div className="text-xs text-muted-foreground">Balance: {formatCurrency(acc.balance)}</div>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                ))}
                                {(accountsByMember[member.id] || []).length === 0 && loadingAccountsFor !== member.id && (
                                  <div className="text-xs text-muted-foreground">No active accounts for this member</div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}

                        {memberResults.length === 0 && !loadingMembers && (
                          <div className="text-center py-8 text-muted-foreground">
                            No members found matching "{searchQuery}"
                          </div>
                        )}
                        {loadingMembers && (
                          <div className="text-center py-4 text-muted-foreground">Searching…</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 2: Account Selection */}
              {currentStep === "account-selection" && transactionData.member && (
                <div className="space-y-6">
                  <div className="flex items-center space-x-3 mb-6">
                    <User className="h-5 w-5 text-primary" />
                    <div>
                      <h2 className="text-lg font-semibold">{transactionData.member.fullName}</h2>
                      <p className="text-sm text-muted-foreground">Member ID: {transactionData.member.memberNumber}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-base font-medium">Select Account & Transaction Type</h3>
                    {accounts.map((account) => (
                      <div key={account.id} className="border border-border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <div className="font-medium">
                              {account.type} Account
                              {account.accountNumber && ` - ${account.accountNumber}`}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {account.accountType && `${account.accountType} • `}
                              Balance: {formatCurrency(account.balance)}
                            </div>
                          </div>
                        </div>

                        <div className="flex space-x-3">
                          <Button
                            onClick={() => selectAccountAndTransaction(account, "Deposit")}
                            className="flex-1"
                            variant="outline"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Deposit
                          </Button>
                          <Button
                            onClick={() => selectAccountAndTransaction(account, "Withdrawal")}
                            className="flex-1"
                            variant="outline"
                          >
                            <DollarSign className="h-4 w-4 mr-2" />
                            Withdraw
                          </Button>
                        </div>
                      </div>
                    ))}

                    {accounts.length === 0 && !loadingAccounts && (
                      <div className="text-center py-8 text-muted-foreground">
                        No active accounts found for this member
                      </div>
                    )}
                    {loadingAccounts && (
                      <div className="text-center py-4 text-muted-foreground">Loading accounts…</div>
                    )}
                  </div>

                  <div className="flex justify-start">
                    <Button variant="ghost" onClick={() => setCurrentStep("member-search")}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Search
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 3: Transaction Details */}
              {currentStep === "transaction-details" && transactionData.member && transactionData.account && (
                <div className="space-y-6">
                  <div className="flex items-center space-x-3 mb-6">
                    <DollarSign className="h-5 w-5 text-primary" />
                    <div>
                      <h2 className="text-lg font-semibold">Transaction Details</h2>
                      <p className="text-sm text-muted-foreground">Enter the transaction amount and details</p>
                    </div>
                  </div>

                  <div className="bg-muted/50 border border-border rounded-lg p-4 mb-6">
                    <h3 className="font-medium mb-2">Transaction Summary</h3>
                    <div className="text-sm space-y-1">
                      <div>
                        <strong>Member:</strong> {transactionData.member.fullName}
                      </div>
                      <div>
                        <strong>Account:</strong> {transactionData.account.type}
                        {transactionData.account.accountNumber && ` - ${transactionData.account.accountNumber}`}
                      </div>
                      <div>
                        <strong>Action:</strong> {transactionData.transactionType}
                      </div>
                    </div>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      completeTransaction()
                    }}
                    className="space-y-6"
                  >
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="amount">Amount (UGX) *</Label>
                        <Input
                          id="amount"
                          type="number"
                          value={transactionData.amount}
                          onChange={(e) => setTransactionData((prev) => ({ ...prev, amount: e.target.value }))}
                          placeholder="Enter amount"
                          className="h-12 text-lg border-border focus:border-primary"
                          required
                          autoFocus
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="paymentMode">Payment Mode *</Label>
                        <Select
                          value={transactionData.paymentMode}
                          onValueChange={(value: "Cash" | "Mobile Money" | "Bank") =>
                            setTransactionData((prev) => ({ ...prev, paymentMode: value }))
                          }
                        >
                          <SelectTrigger className="h-12 border-border focus:border-primary">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Cash">
                              <div className="flex items-center">
                                <DollarSign className="h-4 w-4 mr-2" />
                                Cash
                              </div>
                            </SelectItem>
                            <SelectItem value="Mobile Money">
                              <div className="flex items-center">
                                <Smartphone className="h-4 w-4 mr-2" />
                                Mobile Money
                              </div>
                            </SelectItem>
                            <SelectItem value="Bank">
                              <div className="flex items-center">
                                <CreditCard className="h-4 w-4 mr-2" />
                                Bank Transfer
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="notes">Notes (Optional)</Label>
                        <Textarea
                          id="notes"
                          value={transactionData.notes}
                          onChange={(e) => setTransactionData((prev) => ({ ...prev, notes: e.target.value }))}
                          placeholder="Add any relevant notes..."
                          className="border-border focus:border-primary"
                          rows={3}
                        />
                      </div>
                    </div>

                    <div className="flex justify-between">
                      <Button type="button" variant="ghost" onClick={() => setCurrentStep("account-selection")}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                      </Button>
                      <Button type="submit" disabled={!transactionData.amount} className="min-w-[200px]">
                        {transactionData.transactionType}{" "}
                        {transactionData.amount && formatCurrency(Number.parseFloat(transactionData.amount))}
                      </Button>
                    </div>
                  </form>
                </div>
              )}

              {/* Step 4: Confirmation */}
              {currentStep === "confirmation" && transactionData.member && transactionData.account && (
                <div className="space-y-6">
                  <div className="text-center py-2">
                    <h2 className="text-2xl font-semibold">Confirm Transaction</h2>
                    <p className="text-muted-foreground">Review the details below, then confirm to save.</p>
                  </div>

                  <div className="max-w-md mx-auto bg-muted/50 border border-border rounded-lg p-6 space-y-3">
                    <h3 className="font-medium mb-4">Transaction Details</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Member:</span>
                        <span className="font-medium">{transactionData.member.fullName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Account:</span>
                        <span className="font-medium">{transactionData.account.type}{transactionData.account.accountNumber && ` • ${transactionData.account.accountNumber}`}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Type:</span>
                        <span className="font-medium">{transactionData.transactionType}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Amount:</span>
                        <span className="font-medium">{formatCurrency(Number.parseFloat(transactionData.amount))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Mode:</span>
                        <span className="font-medium">{transactionData.paymentMode}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <Button variant="ghost" onClick={() => setCurrentStep("transaction-details")}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <Button onClick={confirmAndSubmit} disabled={submitting} className="min-w-[200px]">
                      {submitting ? "Saving..." : "Confirm & Submit"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
    </>
  )
}
