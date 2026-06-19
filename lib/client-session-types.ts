import type { NormalizedBranchConfig } from "@/lib/institution-branch-config"

export type ClientPortalClient = {
  id: string
  institutionId: string
  clientNumber: string
  fullName: string
  phone: string
  email: string | null
  kycStatus: string
  status: string
  avatarUrl: string | null
  joinDate: string
  dateOfBirth: string | null
  gender: string | null
  maritalStatus: string | null
  monthlyIncome: number | null
  village: string
  district: string
  occupation: string
  nextOfKinName: string
  nextOfKinRelationship: string
  nextOfKinPhone: string
  mobileMoneyProvider: string
  mobileMoneyNumber: string
  bankName: string
  bankAccountNumber: string
  bankAccountName: string
  bankBranch: string
}

export type ClientPortalInstitution = {
  id: string
  name: string
  type: string
  status: string
  logo: string | null
  config: NormalizedBranchConfig
}

export type ClientSessionData = {
  client: ClientPortalClient
  institution: ClientPortalInstitution
}
