export type MemberEditFormData = {
  fullName: string
  email: string
  phoneNumber: string
  dateOfBirth: string
  joinDate: string
  gender: string
  maritalStatus: string
  district: string
  village: string
  occupation: string
  monthlyIncome: string
  nextOfKin: string
  nextOfKinRelationship: string
  nextOfKinPhone: string
  status: string
  notes: string
  mobileMoneyProvider: string
  mobileMoneyNumber: string
  bankName: string
  bankAccountNumber: string
  bankAccountName: string
  bankBranch: string
}

export type MemberEditSectionProps = {
  formData: MemberEditFormData
  onChange: (field: keyof MemberEditFormData, value: string) => void
  canEdit: boolean
  currency?: string
}

export const emptyMemberEditFormData = (): MemberEditFormData => ({
  fullName: "",
  email: "",
  phoneNumber: "",
  dateOfBirth: "",
  joinDate: "",
  gender: "",
  maritalStatus: "",
  district: "",
  village: "",
  occupation: "",
  monthlyIncome: "",
  nextOfKin: "",
  nextOfKinRelationship: "",
  nextOfKinPhone: "",
  status: "",
  notes: "",
  mobileMoneyProvider: "",
  mobileMoneyNumber: "",
  bankName: "",
  bankAccountNumber: "",
  bankAccountName: "",
  bankBranch: "",
})
