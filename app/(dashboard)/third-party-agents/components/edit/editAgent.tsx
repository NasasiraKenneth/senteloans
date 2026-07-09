"use client";

import { useEffect, useState } from "react";
import { ReeveModal } from "@/components/modals/ReeveModal";
import { useToast } from "@/components/ui/toast";
import NewAgentForm, { AgentFormData } from "../forms/NewAgentForm";
import { mapThirdPartyAgentWriteError } from "@/lib/third-party-agents/write-errors";

interface EditClientProps {
  isOpen: boolean;
  agentId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditAgent({
  isOpen,
  agentId,
  onClose,
  onSuccess,
}: EditClientProps) {
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [initialValues, setInitialValues] =
    useState<Partial<AgentFormData> | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!isOpen || !agentId) {
      setInitialValues(null);
      setFetchError(null);
      return;
    }

    const fetchClient = async () => {
      setFetching(true);
      setFetchError(null);
      try {
        const res = await fetch(
          `/api/institution/third-party-agents/${agentId}`,
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (
            res.status === 403 &&
            body?.error === "missing_permission:view_third_party_agents"
          ) {
            throw new Error("missing_permission:view_third_party_agents");
          }
          if (
            res.status === 404 &&
            body?.error === "third_party_agent_not_found"
          ) {
            throw new Error("third_party_agent_not_found");
          }
          throw new Error(body.error || "Failed to load third party agent");
        }

        const agent = body?.third_party_agent;
        setInitialValues({
          name: agent?.name || "",
          status: agent?.status || "Active",
          email: agent?.email || "",
          phone: agent?.phone || "",
          address: agent?.address || "",
        });
      } catch (e: any) {
        const message = e?.message || "Failed to load third party agent";
        setFetchError(message);
        if (message === "missing_permission:view_third_party_agents") {
          toast({
            title: "Access denied",
            description:
              "You do not have permission to view third party agents.",
            variant: "warning",
          });
          return;
        }
        if (message === "third_party_agent_not_found") {
          toast({
            title: "Agent not found",
            description: "The selected third party agent no longer exists.",
            variant: "warning",
          });
          return;
        }
        toast({
          title: "Failed to load agent",
          description: message,
          variant: "destructive",
        });
      } finally {
        setFetching(false);
      }
    };

    fetchClient();
  }, [isOpen, agentId, toast]);

  const handleEditClient = async (data: AgentFormData) => {
    if (!agentId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/institution/third-party-agents/${agentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = body?.code || body?.error;
        if (code === "third_party_agent_not_found") {
          throw new Error("third_party_agent_not_found");
        }
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
        throw new Error(body.error || "Failed to update third party agent");
      }

      toast({
        title: "Agent updated",
        description: "Third party agent updated successfully.",
        variant: "success",
      });
      onSuccess();
      handleClose();
    } catch (e: any) {
      let message = e?.message || "Failed to update third party agent";
      let variant: "warning" | "destructive" = "destructive";
      if (message === "third_party_agent_not_found") {
        toast({
          title: "Agent not found",
          description: "The selected third party agent no longer exists.",
          variant: "warning",
        });
        return;
      }
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
            ? "Cannot update agent"
            : "Failed to update agent",
        description: message,
        variant,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setInitialValues(null);
    setFetchError(null);
    onClose();
  };

  return (
    <ReeveModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Edit Third Party Agent"
      className="z-10"
    >
      {fetching ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#f08c2b]" />
        </div>
      ) : initialValues ? (
        <NewAgentForm
          key={agentId}
          initialValues={initialValues}
          onSubmit={handleEditClient}
          onCancel={handleClose}
          loading={loading}
          submitLabel="Save Changes"
        />
      ) : fetchError ? (
        <div className="text-center py-12">
          <p className="text-sm text-red-600">{fetchError}</p>
        </div>
      ) : null}
    </ReeveModal>
  );
}
