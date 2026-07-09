"use client";

import { useState } from "react";
import { ReeveModal } from "@/components/modals/ReeveModal";
import { useToast } from "@/components/ui/toast";
import NewAgentForm, { AgentFormData } from "../forms/NewAgentForm";
import { mapThirdPartyAgentWriteError } from "@/lib/third-party-agents/write-errors";

interface AddNewAgentProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddNewAgent({
  isOpen,
  onClose,
  onSuccess,
}: AddNewAgentProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleCreateAgent = async (data: AgentFormData) => {
    setLoading(true);
    try {
      const res = await fetch("/api/institution/third-party-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = body?.code || body?.error;
        if (res.status === 403 && code) {
          throw new Error(
            JSON.stringify({
              code,
              message: mapThirdPartyAgentWriteError(
                code,
                body?.branch_status,
                body?.staff_status,
                body?.agent_status,
              ),
            }),
          );
        }
        throw new Error(body.error || "Failed to create third party agent");
      }

      toast({
        title: "Agent created",
        description: "Third party agent added successfully.",
        variant: "success",
      });
      onSuccess();
      onClose();
    } catch (e: any) {
      let message = e?.message || "Failed to create third party agent";
      let variant: "warning" | "destructive" = "destructive";
      try {
        const parsed = JSON.parse(message) as {
          code?: string;
          message?: string;
        };
        if (parsed?.code) {
          message = parsed.message || mapThirdPartyAgentWriteError(parsed.code);
          variant = "warning";
        }
      } catch {
        // plain string error
      }
      toast({
        title:
          variant === "warning"
            ? "Cannot create agent"
            : "Failed to create agent",
        description: message,
        variant,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ReeveModal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Third Party Agent"
      className="z-10"
    >
      <NewAgentForm
        onSubmit={handleCreateAgent}
        onCancel={onClose}
        loading={loading}
        submitLabel="Create Agent"
      />
    </ReeveModal>
  );
}
