"use client";

import { ReeveModal } from "@/components/modals/ReeveModal";
import TransactionForm, {
  TransactionFormData,
} from "../forms/transactionForm";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialValues?: Partial<TransactionFormData>;
  title?: string;
}

const VALID_PAYMENT_MODES = [
  "Cash",
  "Mobile Money",
  "Bank Transfer",
  "Cheque",
  "Card",
] as const;

function mapCreateTransactionError(code: unknown): string {
  const c = String(code || "");
  switch (c) {
    case "member_id_required":
      return "Please select a member.";
    case "account_id_required":
      return "Please select a savings account.";
    case "invalid_type":
      return "Please select a valid transaction type.";
    case "transferred_to_id_required":
      return "Please select a destination account for the transfer.";
    case "invalid_amount":
      return "Please enter a valid amount greater than zero.";
    case "invalid_mode":
      return "Please select a valid payment method.";
    case "insufficient_funds":
      return "The account does not have enough available balance for this transaction.";
    case "member_not_found":
      return "The selected member could not be found.";
    case "savings_account_not_found":
    case "account_not_found":
    case "transferred_to_account_not_found":
      return "The selected savings account could not be found.";
    case "savings_account_inactive":
    case "account_not_active":
    case "transferred_to_account_not_active":
      return "The selected account is not active.";
    case "account_member_mismatch":
      return "The selected account does not belong to this member.";
    case "transfer_to_same_account_forbidden":
      return "Transfer destination must be a different account.";
    case "cross_branch_operation_forbidden":
    case "cross_tenant_operation_forbidden":
      return "This transaction is not allowed across branches or institutions.";
    case "missing_permission:create_transaction":
      return "You do not have permission to create transactions.";
    case "transaction_number_generation_failed":
      return "Could not generate a unique transaction number. Please try again.";
    case "bank_account_required":
      return "Please select a bank account for this payment method.";
    case "bank_account_not_found":
      return "The selected bank account could not be found.";
    case "invalid_charges":
      return "Transaction charges must be zero or greater.";
    case "reference_number_required":
      return "A reference number is required for this payment method.";
    case "insufficient_bank_balance":
    case "bank_account_insufficient_funds":
      return "The selected bank account does not have enough balance for this transaction.";
    case "insufficient_cash_balance":
      return "The branch does not have enough cash float for this withdrawal.";
    case "insufficient_mobile_money_balance":
      return "The branch does not have enough mobile money float for this withdrawal.";
    case "super_admin_write_blocked":
      return "Super admins are not allowed to create transactions.";
    case "staff_inactive":
      return "Your staff account is not active.";
    case "member_inactive":
      return "The selected member is not active.";
    case "branch_inactive":
      return "This branch is not active.";
    default:
      return c || "Failed to create transaction";
  }
}

export default function AddTransactionModal({
  isOpen,
  onClose,
  onSuccess,
  initialValues,
  title = "Add New Transaction",
}: AddTransactionModalProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (data: TransactionFormData) => {
    const amountNum = Number(data.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast({
        title: "Invalid amount",
        description: "Amount must be greater than zero.",
        variant: "destructive",
      });
      return;
    }

    const typeMap: Record<string, string> = {
      deposit: "Deposit",
      withdrawal: "Withdrawal",
      transfer: "Transfer",
    };

    const type = typeMap[data.transactionType] || "";
    const mode = String(data.paymentMethod || "").trim();
    if (!type || !VALID_PAYMENT_MODES.includes(mode as (typeof VALID_PAYMENT_MODES)[number])) {
      toast({
        title: "Missing details",
        description: "Transaction type and payment method are required.",
        variant: "destructive",
      });
      return;
    }

    const payload: Record<string, unknown> = {
      member_id: data.member,
      account_id: data.account,
      type,
      amount: amountNum,
      mode,
      description: data.notes || "",
      transaction_date: data.transactionDate || undefined,
    };

    const reference = String(data.referenceNumber || "").trim();
    if (reference) {
      payload.reference_number = reference;
    }

    if (data.bankAccountId) {
      payload.bank_account_id = data.bankAccountId;
    }

    const chargesNum = Number(data.charges);
    if (type === "Withdrawal" && Number.isFinite(chargesNum) && chargesNum > 0) {
      payload.charges = chargesNum;
    }

    if (type === "Transfer" && data.transferAccount) {
      payload.transferred_to_id = data.transferAccount;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/institution/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = typeof body?.error === "string" ? body.error : "";
        throw new Error(mapCreateTransactionError(code));
      }
      toast({
        title: "Transaction created",
        description: `Transaction ${body?.transaction_number || ""} completed.`,
        variant: "success",
      });
      onSuccess?.();
      onClose();
    } catch (e: unknown) {
      const message = String((e as Error)?.message || "");
      if (message.includes("permission to create transactions")) {
        toast({
          title: "Access denied",
          description: message,
          variant: "warning",
        });
      } else {
        toast({
          title: "Create failed",
          description: message || "Unexpected error",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ReeveModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      className="z-10"
    >
      <TransactionForm onSubmit={handleSubmit} loading={loading} initialValues={initialValues} />
    </ReeveModal>
  );
}
