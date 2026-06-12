"use client";

import { useState } from "react";
import { ReeveModal } from "@/components/modals/ReeveModal";
import { useToast } from "@/components/ui/toast";
import OpeningBalanceForm, {
  OpeningBalancePayload,
} from "../forms/openningBalanceForm";

interface AddOpeningBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberId: string;
  currency?: string;
  canEditSavings?: boolean;
  canEditLoans?: boolean;
  onSuccess?: () => void;
  title?: string;
}

function mapError(code: unknown): string {
  const c = String(code || "");
  switch (c) {
    case "missing_permission:edit_opening_savings":
      return "You do not have permission to record opening savings balances.";
    case "missing_permission:edit_opening_loans":
      return "You do not have permission to record opening loan balances.";
    case "super_admin_write_blocked":
      return "Super admins are not allowed to edit or modify data.";
    case "no_savings_account":
      return "No savings account was found for this member.";
    case "savings_account_not_found":
      return "The selected savings account could not be found.";
    case "loan_product_not_found":
      return "The selected loan product could not be found.";
    case "loan_creation_failed":
      return "The opening loan could not be created. Please try again.";
    case "branch_inactive":
      return "This member's branch is not active. Opening balances are disabled until it is reactivated.";
    case "branch_not_found":
      return "This member's branch could not be found.";
    case "member_not_found":
      return "Member not found.";
    default:
      return c || "Unexpected error";
  }
}

export default function AddOpeningBalanceModal({
  isOpen,
  onClose,
  memberId,
  currency = "UGX",
  canEditSavings = true,
  canEditLoans = true,
  onSuccess,
  title = "Record Opening Balance",
}: AddOpeningBalanceModalProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (data: OpeningBalancePayload) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/institution/members/${memberId}/opening-balances`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(mapError(body?.error ?? body?.code));
      }

      const parts: string[] = [];
      if (body?.savingsUpdated) parts.push("savings");
      if (body?.loanCreated) parts.push("loan");
      toast({
        variant: "success",
        title: "Opening balances recorded",
        description: parts.length
          ? `Recorded opening ${parts.join(" and ")} balance${parts.length > 1 ? "s" : ""}.`
          : "Opening balances recorded successfully.",
      });
      onSuccess?.();
      onClose();
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to record opening balances",
        description: String((e as Error)?.message || "Unexpected error"),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ReeveModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      className="z-50"
    >
      <OpeningBalanceForm
        memberId={memberId}
        currency={currency}
        canEditSavings={canEditSavings}
        canEditLoans={canEditLoans}
        onSubmit={handleSubmit}
        loading={loading}
      />
    </ReeveModal>
  );
}
