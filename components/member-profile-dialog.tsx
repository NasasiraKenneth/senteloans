"use client"

import type React from "react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Member } from "@/lib/mock-data"
import { User, Phone, Briefcase, DollarSign, Edit, CreditCard, PiggyBank, Users, FileText } from "lucide-react"
import Image from "next/image"

interface MemberProfileDialogProps {
  member: Member
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MemberProfileDialog({ member, open, onOpenChange }: MemberProfileDialogProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: "UGX",
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-UG", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <User className="h-5 w-5 mr-2" />
              {member.fullName}
            </div>
            <Button variant="outline" size="sm">
              <Edit className="h-4 w-4 mr-2" />
              Edit Profile
            </Button>
          </DialogTitle>
          <DialogDescription>
            Member ID: {member.memberNumber} • Joined {formatDate(member.joinDate)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6">
          {/* Status Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Status Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium">Member Status:</span>
                  <Badge variant={member.status === "Active" ? "default" : "secondary"}>{member.status}</Badge>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium">KYC Status:</span>
                  <Badge
                    variant={
                      member.kycStatus === "Verified"
                        ? "default"
                        : member.kycStatus === "Pending"
                          ? "outline"
                          : "destructive"
                    }
                  >
                    {member.kycStatus}
                  </Badge>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium">Loan Officer:</span>
                  <span className="text-sm">{member.loanOfficer}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Personal Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <User className="h-4 w-4 mr-2" />
                  Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Full Name</Label>
                  <p className="text-sm font-medium">{member.fullName}</p>
                </div>
                <div>
                  <Label>National ID</Label>
                  <p className="text-sm font-medium">{member.nationalId}</p>
                </div>
                <div>
                  <Label>Member Number</Label>
                  <p className="text-sm font-medium">{member.memberNumber}</p>
                </div>
                <div>
                  <Label>Join Date</Label>
                  <p className="text-sm font-medium">{formatDate(member.joinDate)}</p>
                </div>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Phone className="h-4 w-4 mr-2" />
                  Contact Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Phone Number</Label>
                  <p className="text-sm font-medium">{member.phoneNumber}</p>
                </div>
                {member.email && (
                  <div>
                    <Label>Email Address</Label>
                    <p className="text-sm font-medium">{member.email}</p>
                  </div>
                )}
                <div>
                  <Label>Location</Label>
                  <p className="text-sm font-medium">
                    {member.village}, {member.district}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Employment Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Briefcase className="h-4 w-4 mr-2" />
                  Employment Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Occupation</Label>
                  <p className="text-sm font-medium">{member.occupation}</p>
                </div>
                <div>
                  <Label>Monthly Income</Label>
                  <p className="text-sm font-medium">{formatCurrency(member.monthlyIncome)}</p>
                </div>
              </CardContent>
            </Card>

            {/* Next of Kin Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Users className="h-4 w-4 mr-2" />
                  Next of Kin Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Full Name</Label>
                  <p className="text-sm font-medium">{member.nextOfKinName}</p>
                </div>
                <div>
                  <Label>Relationship</Label>
                  <p className="text-sm font-medium">{member.nextOfKinRelationship}</p>
                </div>
                <div>
                  <Label>Phone Number</Label>
                  <p className="text-sm font-medium">{member.nextOfKinPhone}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Documents */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="h-4 w-4 mr-2" />
                Documents
              </CardTitle>
              <CardDescription>Member identification documents</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <Label>Passport Photo</Label>
                  <div className="mt-2 border rounded-lg p-4">
                    <Image
                      src={member.passportPhoto || "/placeholder.svg"}
                      alt="Passport Photo"
                      width={120}
                      height={150}
                      className="mx-auto rounded-md object-cover"
                    />
                  </div>
                </div>
                <div className="text-center">
                  <Label>National ID (Front)</Label>
                  <div className="mt-2 border rounded-lg p-4">
                    <Image
                      src={member.nationalIdFront || "/placeholder.svg"}
                      alt="National ID Front"
                      width={200}
                      height={120}
                      className="mx-auto rounded-md object-cover"
                    />
                  </div>
                </div>
                <div className="text-center">
                  <Label>National ID (Back)</Label>
                  <div className="mt-2 border rounded-lg p-4">
                    <Image
                      src={member.nationalIdBack || "/placeholder.svg"}
                      alt="National ID Back"
                      width={200}
                      height={120}
                      className="mx-auto rounded-md object-cover"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Account Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Account Summary</CardTitle>
              <CardDescription>Quick overview of member's financial activity</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <PiggyBank className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span className="text-sm">Savings Balance</span>
                </div>
                <span className="text-sm font-medium">UGX 850,000</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <CreditCard className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span className="text-sm">Active Loans</span>
                </div>
                <span className="text-sm font-medium">1</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <DollarSign className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span className="text-sm">Outstanding Balance</span>
                </div>
                <span className="text-sm font-medium">UGX 1,500,000</span>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-4">
            <Button variant="outline">
              <CreditCard className="h-4 w-4 mr-2" />
              View Loans
            </Button>
            <Button variant="outline">
              <PiggyBank className="h-4 w-4 mr-2" />
              View Savings
            </Button>
            <Button>
              <Edit className="h-4 w-4 mr-2" />
              Edit Member
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{children}</span>
}
