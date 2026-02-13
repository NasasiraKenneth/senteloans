import { isModuleEnabled } from "./config"
import { getSession } from "./session"

export interface Client {
  id: string
  clientNumber: string // Previously memberNumber
  fullName: string
  dateOfBirth: string
  gender: "Male" | "Female" | "Other"
  maritalStatus: "Single" | "Married" | "Divorced" | "Widowed"
  clientType: "Individual" | "Group" | "Corporate" // Previously memberType
  phoneNumber: string
  email?: string
  nationalId: string
  status: "Active" | "Dormant" | "Closed"
  kycStatus: "Pending" | "Verified" | "Rejected"
  joinDate: string
  district: string
  village: string
  occupation: string
  monthlyIncome: number
  loanOfficer: string
  nextOfKinName: string
  nextOfKinRelationship: string
  nextOfKinPhone: string
  passportPhoto: string
  nationalIdFront: string
  nationalIdBack: string
  numberOfShares?: number
  shareValue?: number
  totalShareValue?: number
}

export interface Loan {
  id: string
  applicationId: string
  clientId: string // Previously memberId
  clientName: string // Previously memberName
  loanProduct: string
  principalAmount: number
  interestRate: number
  tenure: number // months
  status: "Applied" | "Approved" | "Disbursed" | "Rejected" | "Closed" | "Defaulted"
  applicationDate: string
  disbursementDate?: string
  outstandingBalance: number
  nextPaymentDate?: string
  overdueDays: number
  purpose: string
  collateral?: string
}

export interface SavingsAccount {
  id: string
  clientId: string // Previously memberId
  clientName: string // Previously memberName
  accountNumber: string
  accountType: "Voluntary" | "Fixed" | "Shares"
  availableBalance: number
  totalBalance: number
  status: "Active" | "Dormant" | "Closed"
  openDate: string
}

export interface Transaction {
  id: string
  accountId: string
  clientId: string // Previously memberId
  clientName: string // Previously memberName
  type: "Deposit" | "Withdrawal" | "Loan Disbursement" | "Loan Repayment"
  amount: number
  mode: "Cash" | "Mobile Money" | "Bank Transfer"
  date: string
  description: string
  balance: number
}

export const mockClients: Client[] = [
  {
    id: "1",
    clientNumber: "SL001",
    fullName: "Sarah Nakamya",
    dateOfBirth: "1985-03-15",
    gender: "Female",
    maritalStatus: "Married",
    clientType: "Individual",
    phoneNumber: "+256701234567",
    email: "sarah.nakamya@email.com",
    nationalId: "CM12345678901234",
    status: "Active",
    kycStatus: "Verified",
    joinDate: "2023-01-15",
    district: "Kampala",
    village: "Ntinda",
    occupation: "Teacher",
    monthlyIncome: 800000,
    loanOfficer: "Annet Mukasa",
    nextOfKinName: "John Nakamya",
    nextOfKinRelationship: "Spouse",
    nextOfKinPhone: "+256701234568",
    passportPhoto: "/passport-photo-of-sarah-nakamya.png",
    nationalIdFront: "/uganda-national-id-front-cm1234567890123.png",
    nationalIdBack: "/uganda-national-id-back.png",
    ...(isModuleEnabled("shares") && {
      numberOfShares: 15,
      shareValue: 50000,
      totalShareValue: 750000,
    }),
  },
  {
    id: "2",
    clientNumber: "SL002",
    fullName: "David Ssemakula",
    dateOfBirth: "1978-11-22",
    gender: "Male",
    maritalStatus: "Single",
    clientType: "Individual",
    phoneNumber: "+256702345678",
    nationalId: "CM23456789012345",
    status: "Active",
    kycStatus: "Verified",
    joinDate: "2023-02-20",
    district: "Wakiso",
    village: "Kira",
    occupation: "Farmer",
    monthlyIncome: 500000,
    loanOfficer: "Annet Mukasa",
    nextOfKinName: "Mary Ssemakula",
    nextOfKinRelationship: "Mother",
    nextOfKinPhone: "+256702345679",
    passportPhoto: "/passport-photo-of-james-mukasa.png",
    nationalIdFront: "/uganda-national-id-front-cm2345678901234.png",
    nationalIdBack: "/uganda-national-id-back.png",
    ...(isModuleEnabled("shares") && {
      numberOfShares: 10,
      shareValue: 50000,
      totalShareValue: 500000,
    }),
  },
  {
    id: "3",
    clientNumber: "SL003",
    fullName: "Grace Namugga",
    dateOfBirth: "1990-07-08",
    gender: "Female",
    maritalStatus: "Divorced",
    clientType: "Individual",
    phoneNumber: "+256703456789",
    email: "grace.namugga@email.com",
    nationalId: "CM34567890123456",
    status: "Active",
    kycStatus: "Pending",
    joinDate: "2023-03-10",
    district: "Mukono",
    village: "Seeta",
    occupation: "Small Business Owner",
    monthlyIncome: 1200000,
    loanOfficer: "Samuel Kato",
    nextOfKinName: "Peter Namugga",
    nextOfKinRelationship: "Brother",
    nextOfKinPhone: "+256703456790",
    passportPhoto: "/passport-photo-of-grace-namugga.png",
    nationalIdFront: "/uganda-national-id-front-cm3456789012345.png",
    nationalIdBack: "/uganda-national-id-back.png",
    ...(isModuleEnabled("shares") && {
      numberOfShares: 20,
      shareValue: 50000,
      totalShareValue: 1000000,
    }),
  },
  {
    id: "4",
    clientNumber: "SL004",
    fullName: "Robert Kiwanuka",
    dateOfBirth: "1965-12-03",
    gender: "Male",
    maritalStatus: "Widowed",
    clientType: "Individual",
    phoneNumber: "+256704567890",
    nationalId: "CM45678901234567",
    status: "Active",
    kycStatus: "Verified",
    joinDate: "2023-04-12",
    district: "Kampala",
    village: "Bugolobi",
    occupation: "Civil Servant",
    monthlyIncome: 1500000,
    loanOfficer: "Samuel Kato",
    nextOfKinName: "Alice Kiwanuka",
    nextOfKinRelationship: "Daughter",
    nextOfKinPhone: "+256704567891",
    passportPhoto: "/passport-photo-of-robert-kiwanuka.png",
    nationalIdFront: "/uganda-national-id-front-cm4567890123456.png",
    nationalIdBack: "/uganda-national-id-back.png",
    ...(isModuleEnabled("shares") && {
      numberOfShares: 25,
      shareValue: 50000,
      totalShareValue: 1250000,
    }),
  },
  {
    id: "5",
    clientNumber: "SL005",
    fullName: "Kampala Women's Group",
    dateOfBirth: "2020-01-01",
    gender: "Other",
    maritalStatus: "Single",
    clientType: "Group",
    phoneNumber: "+256705678901",
    email: "info@kampalawomensgroup.org",
    nationalId: "GR56789012345678",
    status: "Active",
    kycStatus: "Verified",
    joinDate: "2023-05-20",
    district: "Kampala",
    village: "Wandegeya",
    occupation: "Group Business",
    monthlyIncome: 2500000,
    loanOfficer: "Annet Mukasa",
    nextOfKinName: "Margaret Namusoke",
    nextOfKinRelationship: "Group Leader",
    nextOfKinPhone: "+256705678902",
    passportPhoto: "/passport-photo-of-kampala-womens-group.png",
    nationalIdFront: "/uganda-national-id-front-gr5678901234567.png",
    nationalIdBack: "/uganda-national-id-back.png",
    ...(isModuleEnabled("shares") && {
      numberOfShares: 50,
      shareValue: 50000,
      totalShareValue: 2500000,
    }),
  },
  {
    id: "6",
    clientNumber: "SL006",
    fullName: "Patricia Nabirye",
    dateOfBirth: "1992-09-14",
    gender: "Female",
    maritalStatus: "Single",
    clientType: "Individual",
    phoneNumber: "+256706789012",
    email: "patricia.nabirye@email.com",
    nationalId: "CM67890123456789",
    status: "Dormant",
    kycStatus: "Verified",
    joinDate: "2023-06-08",
    district: "Jinja",
    village: "Bugembe",
    occupation: "Healthcare Worker",
    monthlyIncome: 900000,
    loanOfficer: "Samuel Kato",
    nextOfKinName: "Joseph Nabirye",
    nextOfKinRelationship: "Father",
    nextOfKinPhone: "+256706789013",
    passportPhoto: "/passport-photo-of-patricia-nabirye.png",
    nationalIdFront: "/uganda-national-id-front-cm6789012345678.png",
    nationalIdBack: "/uganda-national-id-back.png",
    ...(isModuleEnabled("shares") && {
      numberOfShares: 12,
      shareValue: 50000,
      totalShareValue: 600000,
    }),
  },
]

export type Member = Client
export const mockMembers = mockClients

export const mockLoans: Loan[] = [
  {
    id: "1",
    applicationId: "LA001",
    clientId: "1",
    clientName: "Sarah Nakamya",
    loanProduct: "Personal Loan",
    principalAmount: 2000000,
    interestRate: 15,
    tenure: 12,
    status: "Disbursed",
    applicationDate: "2023-06-01",
    disbursementDate: "2023-06-05",
    outstandingBalance: 1500000,
    nextPaymentDate: "2024-01-05",
    overdueDays: 0,
    purpose: "Business expansion",
  },
  {
    id: "2",
    applicationId: "LA002",
    clientId: "2",
    clientName: "David Ssemakula",
    loanProduct: "Agricultural Loan",
    principalAmount: 1500000,
    interestRate: 12,
    tenure: 18,
    status: "Applied",
    applicationDate: "2023-12-15",
    outstandingBalance: 1500000,
    overdueDays: 0,
    purpose: "Farm equipment purchase",
  },
  {
    id: "3",
    applicationId: "LA003",
    clientId: "3",
    clientName: "Grace Namugga",
    loanProduct: "Emergency Loan",
    principalAmount: 500000,
    interestRate: 18,
    tenure: 6,
    status: "Defaulted",
    applicationDate: "2023-08-01",
    disbursementDate: "2023-08-03",
    outstandingBalance: 450000,
    nextPaymentDate: "2023-12-03",
    overdueDays: 45,
    purpose: "Medical emergency",
    collateral: "Motorcycle - UBD 123A",
  },
]

export const mockSavingsAccounts: SavingsAccount[] = [
  {
    id: "1",
    clientId: "1",
    clientName: "Sarah Nakamya",
    accountNumber: "SA001",
    accountType: "Voluntary",
    availableBalance: 850000,
    totalBalance: 850000,
    status: "Active",
    openDate: "2023-01-15",
  },
  {
    id: "2",
    clientId: "2",
    clientName: "David Ssemakula",
    accountNumber: "SA002",
    accountType: "Fixed",
    availableBalance: 1200000,
    totalBalance: 1200000,
    status: "Active",
    openDate: "2023-02-20",
  },
  {
    id: "3",
    clientId: "3",
    clientName: "Grace Namugga",
    accountNumber: "SA003",
    accountType: "Shares",
    availableBalance: 300000,
    totalBalance: 300000,
    status: "Active",
    openDate: "2023-03-10",
  },
]

export const mockTransactions: Transaction[] = [
  {
    id: "1",
    accountId: "1",
    clientId: "1",
    clientName: "Sarah Nakamya",
    type: "Deposit",
    amount: 100000,
    mode: "Mobile Money",
    date: "2023-12-20",
    description: "Monthly savings deposit",
    balance: 850000,
  },
  {
    id: "2",
    accountId: "1",
    clientId: "1",
    clientName: "Sarah Nakamya",
    type: "Loan Repayment",
    amount: 200000,
    mode: "Cash",
    date: "2023-12-15",
    description: "Loan repayment - LA001",
    balance: 750000,
  },
  {
    id: "3",
    accountId: "2",
    clientId: "2",
    clientName: "David Ssemakula",
    type: "Deposit",
    amount: 150000,
    mode: "Bank Transfer",
    date: "2023-12-18",
    description: "Harvest proceeds deposit",
    balance: 1200000,
  },
]

export const mockDashboardStats = {
  totalClients: 159, // Previously totalMembers
  activeClients: 144, // Previously activeMembers
  ...(isModuleEnabled("savings") && {
    totalSavingsPortfolio: 45600000,
  }),
  totalLoanPortfolio: 78900000,
  outstandingLoans: 23400000,
  nplRatio: 8.5,
  monthlyCollectionEfficiency: 92.3,
  newClientsThisMonth: 15, // Previously newMembersThisMonth
  loansApprovedThisMonth: 8,
  totalTransactionsThisMonth: 234,
}

export const mockDashboardStatsLegacy = {
  totalMembers: mockDashboardStats.totalClients,
  activeMembers: mockDashboardStats.activeClients,
  newMembersThisMonth: mockDashboardStats.newClientsThisMonth,
  ...mockDashboardStats,
}

export const getInstitutionClients = (institutionId: string): Client[] => {
  switch (institutionId) {
    case "1": // Kampala Central SACCO
      return mockClients.slice(0, 4) // Sarah, David, Grace, Robert
    case "2": // Quick Cash Uganda (Money Lender)
      return [
        {
          id: "7",
          clientNumber: "QC001",
          fullName: "Moses Kiprotich",
          dateOfBirth: "1988-05-12",
          gender: "Male",
          maritalStatus: "Married",
          clientType: "Individual",
          phoneNumber: "+256707890123",
          email: "moses.kiprotich@email.com",
          nationalId: "CM78901234567890",
          status: "Active",
          kycStatus: "Verified",
          joinDate: "2023-08-15",
          district: "Kampala",
          village: "Bwaise",
          occupation: "Boda Boda Rider",
          monthlyIncome: 400000,
          loanOfficer: "Peter Ssali",
          nextOfKinName: "Jane Kiprotich",
          nextOfKinRelationship: "Spouse",
          nextOfKinPhone: "+256707890124",
          passportPhoto: "/passport-photo-of-moses-kiprotich.png",
          nationalIdFront: "/uganda-national-id-front-cm7890123456789.png",
          nationalIdBack: "/uganda-national-id-back.png",
        },
        {
          id: "8",
          clientNumber: "QC002",
          fullName: "Betty Nakato",
          dateOfBirth: "1995-02-28",
          gender: "Female",
          maritalStatus: "Single",
          clientType: "Individual",
          phoneNumber: "+256708901234",
          email: "betty.nakato@email.com",
          nationalId: "CM89012345678901",
          status: "Active",
          kycStatus: "Verified",
          joinDate: "2023-09-20",
          district: "Wakiso",
          village: "Nansana",
          occupation: "Hair Salon Owner",
          monthlyIncome: 600000,
          loanOfficer: "Peter Ssali",
          nextOfKinName: "Susan Nakato",
          nextOfKinRelationship: "Sister",
          nextOfKinPhone: "+256708901235",
          passportPhoto: "/passport-photo-of-betty-nakato.png",
          nationalIdFront: "/uganda-national-id-front-cm8901234567890.png",
          nationalIdBack: "/uganda-national-id-back.png",
        },
        {
          id: "9",
          clientNumber: "QC003",
          fullName: "James Okello",
          dateOfBirth: "1982-11-15",
          gender: "Male",
          maritalStatus: "Divorced",
          clientType: "Individual",
          phoneNumber: "+256709012345",
          nationalId: "CM90123456789012",
          status: "Active",
          kycStatus: "Verified",
          joinDate: "2023-10-05",
          district: "Kampala",
          village: "Katwe",
          occupation: "Mechanic",
          monthlyIncome: 800000,
          loanOfficer: "Peter Ssali",
          nextOfKinName: "Mary Okello",
          nextOfKinRelationship: "Mother",
          nextOfKinPhone: "+256709012346",
          passportPhoto: "/passport-photo-of-james-okello.png",
          nationalIdFront: "/uganda-national-id-front-cm9012345678901.png",
          nationalIdBack: "/uganda-national-id-back.png",
        },
      ]
    case "3": // Opportunity Microfinance Uganda (MFI)
      return [
        {
          id: "10",
          clientNumber: "OM001",
          fullName: "Agnes Namutebi",
          dateOfBirth: "1987-04-18",
          gender: "Female",
          maritalStatus: "Married",
          clientType: "Individual",
          phoneNumber: "+256710123456",
          email: "agnes.namutebi@email.com",
          nationalId: "CM01234567890123",
          status: "Active",
          kycStatus: "Verified",
          joinDate: "2023-07-10",
          district: "Mukono",
          village: "Lugazi",
          occupation: "Market Vendor",
          monthlyIncome: 350000,
          loanOfficer: "Grace Nakato",
          nextOfKinName: "Paul Namutebi",
          nextOfKinRelationship: "Spouse",
          nextOfKinPhone: "+256710123457",
          passportPhoto: "/passport-photo-of-agnes-namutebi.png",
          nationalIdFront: "/uganda-national-id-front-cm0123456789012.png",
          nationalIdBack: "/uganda-national-id-back.png",
        },
        mockClients[4], // Kampala Women's Group
        mockClients[5], // Patricia Nabirye
      ]
    default:
      return mockClients
  }
}

export const getInstitutionLoans = (institutionId: string): Loan[] => {
  switch (institutionId) {
    case "1": // Kampala Central SACCO
      return mockLoans
    case "2": // Quick Cash Uganda (Money Lender)
      return [
        {
          id: "4",
          applicationId: "QC001",
          clientId: "7",
          clientName: "Moses Kiprotich",
          loanProduct: "Quick Cash Loan",
          principalAmount: 800000,
          interestRate: 25,
          tenure: 3,
          status: "Disbursed",
          applicationDate: "2023-11-01",
          disbursementDate: "2023-11-02",
          outstandingBalance: 600000,
          nextPaymentDate: "2024-01-02",
          overdueDays: 0,
          purpose: "Motorcycle repair",
          collateral: "Motorcycle - UBE 456B",
        },
        {
          id: "5",
          applicationId: "QC002",
          clientId: "8",
          clientName: "Betty Nakato",
          loanProduct: "Business Loan",
          principalAmount: 1200000,
          interestRate: 22,
          tenure: 6,
          status: "Disbursed",
          applicationDate: "2023-10-15",
          disbursementDate: "2023-10-16",
          outstandingBalance: 900000,
          nextPaymentDate: "2024-01-16",
          overdueDays: 0,
          purpose: "Salon equipment",
          collateral: "Shop inventory",
        },
        {
          id: "6",
          applicationId: "QC003",
          clientId: "9",
          clientName: "James Okello",
          loanProduct: "Emergency Loan",
          principalAmount: 500000,
          interestRate: 30,
          tenure: 2,
          status: "Applied",
          applicationDate: "2023-12-20",
          outstandingBalance: 500000,
          overdueDays: 0,
          purpose: "Medical bills",
          collateral: "Garage tools",
        },
      ]
    case "3": // Opportunity Microfinance Uganda (MFI)
      return [
        {
          id: "7",
          applicationId: "OM001",
          clientId: "10",
          clientName: "Agnes Namutebi",
          loanProduct: "Micro Business Loan",
          principalAmount: 300000,
          interestRate: 18,
          tenure: 12,
          status: "Disbursed",
          applicationDate: "2023-09-01",
          disbursementDate: "2023-09-05",
          outstandingBalance: 200000,
          nextPaymentDate: "2024-01-05",
          overdueDays: 0,
          purpose: "Market stall expansion",
        },
      ]
    default:
      return mockLoans
  }
}

export const getInstitutionTransactions = (institutionId: string): Transaction[] => {
  switch (institutionId) {
    case "1": // Kampala Central SACCO
      return mockTransactions
    case "2": // Quick Cash Uganda (Money Lender) - Only loan-related transactions
      return [
        {
          id: "4",
          accountId: "4",
          clientId: "7",
          clientName: "Moses Kiprotich",
          type: "Loan Disbursement",
          amount: 800000,
          mode: "Cash",
          date: "2023-11-02",
          description: "Quick Cash Loan disbursement - QC001",
          balance: 800000,
        },
        {
          id: "5",
          accountId: "4",
          clientId: "7",
          clientName: "Moses Kiprotich",
          type: "Loan Repayment",
          amount: 200000,
          mode: "Mobile Money",
          date: "2023-12-02",
          description: "Loan repayment - QC001",
          balance: 600000,
        },
        {
          id: "6",
          accountId: "5",
          clientId: "8",
          clientName: "Betty Nakato",
          type: "Loan Disbursement",
          amount: 1200000,
          mode: "Bank Transfer",
          date: "2023-10-16",
          description: "Business Loan disbursement - QC002",
          balance: 1200000,
        },
        {
          id: "7",
          accountId: "5",
          clientId: "8",
          clientName: "Betty Nakato",
          type: "Loan Repayment",
          amount: 300000,
          mode: "Cash",
          date: "2023-11-16",
          description: "Loan repayment - QC002",
          balance: 900000,
        },
      ]
    case "3": // Opportunity Microfinance Uganda (MFI)
      return [
        {
          id: "8",
          accountId: "6",
          clientId: "10",
          clientName: "Agnes Namutebi",
          type: "Deposit",
          amount: 50000,
          mode: "Mobile Money",
          date: "2023-12-15",
          description: "Monthly savings deposit",
          balance: 150000,
        },
        {
          id: "9",
          accountId: "6",
          clientId: "10",
          clientName: "Agnes Namutebi",
          type: "Loan Repayment",
          amount: 100000,
          mode: "Cash",
          date: "2023-12-05",
          description: "Loan repayment - OM001",
          balance: 100000,
        },
      ]
    default:
      return mockTransactions
  }
}

export const getInstitutionDashboardStats = (institutionId: string) => {
  switch (institutionId) {
    case "1": // Kampala Central SACCO
      return mockDashboardStats
    case "2": // Quick Cash Uganda (Money Lender)
      return {
        totalClients: 45,
        activeClients: 42,
        totalLoanPortfolio: 15600000,
        outstandingLoans: 12400000,
        nplRatio: 12.8,
        monthlyCollectionEfficiency: 88.5,
        newClientsThisMonth: 8,
        loansApprovedThisMonth: 12,
        totalTransactionsThisMonth: 89,
        averageLoanSize: 750000,
        collateralCoverage: 95.2,
      }
    case "3": // Opportunity Microfinance Uganda (MFI)
      return {
        totalClients: 234,
        activeClients: 218,
        totalSavingsPortfolio: 12300000,
        totalLoanPortfolio: 28900000,
        outstandingLoans: 18200000,
        nplRatio: 6.2,
        monthlyCollectionEfficiency: 94.8,
        newClientsThisMonth: 22,
        loansApprovedThisMonth: 18,
        totalTransactionsThisMonth: 156,
        averageLoanSize: 450000,
        womenClientPercentage: 78.5,
      }
    default:
      return mockDashboardStats
  }
}

// Session-aware data functions
export const getCurrentInstitutionClients = (): Client[] => {
  const session = getSession()
  if (!session?.institution?.id) {
    return mockClients
  }
  return getInstitutionClients(session.institution.id)
}

export const getCurrentInstitutionLoans = (): Loan[] => {
  const session = getSession()
  if (!session?.institution?.id) {
    return mockLoans
  }
  return getInstitutionLoans(session.institution.id)
}

export const getCurrentInstitutionTransactions = (): Transaction[] => {
  const session = getSession()
  if (!session?.institution?.id) {
    return mockTransactions
  }
  return getInstitutionTransactions(session.institution.id)
}

export const getCurrentInstitutionSavingsAccounts = (): SavingsAccount[] => {
  const session = getSession()
  if (!session?.institution?.id) {
    return mockSavingsAccounts
  }

  // For money lenders, return empty array as they don't have savings
  if (session.institution.type === "Money Lender") {
    return []
  }

  // For other institutions, filter by their clients
  const institutionClients = getCurrentInstitutionClients()
  const clientIds = institutionClients.map((client) => client.id)
  return mockSavingsAccounts.filter((account) => clientIds.includes(account.clientId))
}

export const getCurrentInstitutionDashboardStats = () => {
  const session = getSession()
  if (!session?.institution?.id) {
    return mockDashboardStats
  }
  return getInstitutionDashboardStats(session.institution.id)
}

export const getCurrentInstitution = () => {
  const session = getSession()
  if (!session?.institution) {
    return null
  }
  return session.institution
}

// Legacy compatibility - use session-aware functions
export const getCurrentMembers = getCurrentInstitutionClients
export const getCurrentMockMembers = getCurrentInstitutionClients
