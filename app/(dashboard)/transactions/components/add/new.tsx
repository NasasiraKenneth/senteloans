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
    const modeMap: Record<string, string> = {
      cash: "Cash",
      mobile_money: "Mobile Money",
      bank: "Bank Transfer",
      card: "Card",
    };

    const type = typeMap[data.transactionType] || "";
    const mode = modeMap[data.paymentMethod] || "";
    if (!type || !mode) {
      toast({
        title: "Missing details",
        description: "Transaction type and method are required.",
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
        throw new Error(body?.error || "Failed to create transaction");
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
      if (message === "missing_permission:create_transaction") {
        toast({
          title: "Access denied",
          description: "You do not have permission to create transactions.",
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
