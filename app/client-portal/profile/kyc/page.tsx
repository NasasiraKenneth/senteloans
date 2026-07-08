import { redirect } from "next/navigation"

export default function LegacyClientKycPage() {
  redirect("/client-portal/profile?tab=kyc")
}
