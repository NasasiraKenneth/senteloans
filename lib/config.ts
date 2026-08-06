export type InstitutionType = "sacco" | "mfi" | "money-lender"

export interface InstitutionConfig {
  type: InstitutionType
  name: string
  clientTerminology: "Member" | "Client" | "Borrower" | "Customer"
  modules: {
    savings: boolean
    shares: boolean
    loans: boolean
  }
  features: {
    membershipNumbers: boolean
    dividends: boolean
    collateralTracking: boolean
  }
}

// Default configuration - can be made dynamic from admin settings
export const institutionConfig: InstitutionConfig = {
  type: "sacco", // This would be configurable in admin settings
  name: "Nyuki",
  clientTerminology: "Member", // Dynamic based on institution type
  modules: {
    savings: true, // Can be disabled for money lenders
    shares: true, // Can be disabled for MFIs/money lenders
    loans: true, // Always enabled
  },
  features: {
    membershipNumbers: true, // SACCO-specific
    dividends: true, // SACCO-specific
    collateralTracking: false, // Money lender specific
  },
}

// Helper functions for conditional rendering
export const isModuleEnabled = (module: keyof InstitutionConfig["modules"]) => {
  return institutionConfig.modules[module]
}

export const isFeatureEnabled = (feature: keyof InstitutionConfig["features"]) => {
  return institutionConfig.features[feature]
}

export const getClientTerminology = (plural = false) => {
  const term = institutionConfig.clientTerminology
  if (plural) {
    return term === "Member"
      ? "Members"
      : term === "Client"
        ? "Clients"
        : term === "Borrower"
          ? "Borrowers"
          : "Customers"
  }
  return term
}

// Institution type configurations
export const institutionTypeConfigs: Record<InstitutionType, Partial<InstitutionConfig>> = {
  sacco: {
    clientTerminology: "Member",
    modules: { savings: true, shares: true, loans: true },
    features: { membershipNumbers: true, dividends: true, collateralTracking: false },
  },
  mfi: {
    clientTerminology: "Client",
    modules: { savings: true, shares: false, loans: true },
    features: { membershipNumbers: false, dividends: false, collateralTracking: false },
  },
  "money-lender": {
    clientTerminology: "Borrower",
    modules: { savings: false, shares: false, loans: true },
    features: { membershipNumbers: false, dividends: false, collateralTracking: true },
  },
}

export interface Institution {
  id: string
  name: string
  type: InstitutionType
  contactPerson: string
  email: string
  phone: string
  address: string
  registrationNumber?: string
  licenseNumber?: string
  status: "Active" | "Suspended" | "Pending"
  createdAt: string
  updatedAt: string
  config: InstitutionConfig
  adminUserId: string
}

export interface User {
  id: string
  name: string
  email: string
  role: "system-admin" | "institution-admin" | "manager" | "loan-officer" | "teller"
  institutionId?: string // null for system admins
  status: "Active" | "Inactive"
  createdAt: string
  lastLogin?: string
}

// Mock data for institutions and users
export const mockInstitutions: Institution[] = [
  {
    id: "1",
    name: "Kampala Central SACCO",
    type: "sacco",
    contactPerson: "John Mukasa",
    email: "admin@kampalasacco.ug",
    phone: "+256701234567",
    address: "Plot 15, Kampala Road, Kampala",
    registrationNumber: "SACCO/2020/001",
    status: "Active",
    createdAt: "2023-01-15",
    updatedAt: "2023-12-01",
    config: {
      type: "sacco",
      name: "Kampala Central SACCO",
      clientTerminology: "Member",
      modules: { savings: true, shares: true, loans: true },
      features: { membershipNumbers: true, dividends: true, collateralTracking: false },
    },
    adminUserId: "2",
  },
  {
    id: "2",
    name: "Quick Cash Money Lenders",
    type: "money-lender",
    contactPerson: "Sarah Namukasa",
    email: "admin@quickcash.ug",
    phone: "+256702345678",
    address: "Plot 8, Jinja Road, Kampala",
    licenseNumber: "ML/2022/045",
    status: "Active",
    createdAt: "2023-03-20",
    updatedAt: "2023-11-15",
    config: {
      type: "money-lender",
      name: "Quick Cash Money Lenders",
      clientTerminology: "Borrower",
      modules: { savings: false, shares: false, loans: true },
      features: { membershipNumbers: false, dividends: false, collateralTracking: true },
    },
    adminUserId: "3",
  },
  {
    id: "3",
    name: "Opportunity Microfinance Uganda",
    type: "mfi",
    contactPerson: "Grace Nakato",
    email: "admin@opportunityug.com",
    phone: "+256703456789",
    address: "Plot 22, Buganda Road, Kampala",
    licenseNumber: "MFI/2021/012",
    status: "Active",
    createdAt: "2023-02-10",
    updatedAt: "2023-12-15",
    config: {
      type: "mfi",
      name: "Opportunity Microfinance Uganda",
      clientTerminology: "Client",
      modules: { savings: true, shares: false, loans: true },
      features: { membershipNumbers: false, dividends: false, collateralTracking: false },
    },
    adminUserId: "4",
  },
]

export const mockUsers: User[] = [
  {
    id: "1",
    name: "System Administrator",
    email: "admin@senteloans.com",
    role: "system-admin",
    status: "Active",
    createdAt: "2023-01-01",
    lastLogin: "2024-01-02",
  },
  {
    id: "2",
    name: "John Mukasa",
    email: "admin@kampalasacco.ug",
    role: "institution-admin",
    institutionId: "1",
    status: "Active",
    createdAt: "2023-01-15",
    lastLogin: "2024-01-01",
  },
  {
    id: "3",
    name: "Sarah Namukasa",
    email: "admin@quickcash.ug",
    role: "institution-admin",
    institutionId: "2",
    status: "Active",
    createdAt: "2023-03-20",
    lastLogin: "2023-12-28",
  },
  {
    id: "4",
    name: "Grace Nakato",
    email: "admin@opportunityug.com",
    role: "institution-admin",
    institutionId: "3",
    status: "Active",
    createdAt: "2023-02-10",
    lastLogin: "2023-12-20",
  },
]
