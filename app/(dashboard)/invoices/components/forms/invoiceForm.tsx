"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  FaCalculator,
  FaDollarSign,
  FaExclamationTriangle,
  FaPlus,
  FaSave,
  FaTimes,
  FaTrash,
} from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatCurrency, numberToWords } from "@/lib/invoices/utils";
import ReeveDatePicker from "@/components/newUI/date_picker";
import StyledSelect from "@/components/newUI/styled_select";

interface ThirdPartyAgentOption {
  id: string;
  name: string;
}

interface Member {
  id: string;
  memberName: string;
}

export interface InvoiceItemForm {
  id: string;
  unit: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  onVat: boolean;
}

export interface InvoiceFormData {
  targetType: "member" | "third_party_agent";
  memberId: string | null;
  thirdPartyAgentId: string | null;
  customerName: string;
  invoiceNo: string | null;
  invoiceDate: string;
  invoiceType: string;
  dueDate: string;
  status: string;
  vatInclusive: boolean;
  items: InvoiceItemForm[];
  subTotal: number;
  vat: number;
  totalAmount: number;
  amountInWords: string;
}

interface InvoiceFormProps {
  onClose?: () => void;
  initialValues?: Partial<InvoiceFormData>;
  onSubmit: (data: InvoiceFormData) => Promise<void>;
  loading?: boolean;
  editMode?: boolean;
}

const addDays = (dateString: string, days: number) => {
  const date = new Date(dateString);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
};

const normalizeToYmd = (value: unknown): string => {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().split("T")[0];
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().split("T")[0];
    }
  }
  return "";
};

const InvoiceForm: React.FC<InvoiceFormProps> = ({
  onClose,
  initialValues = {},
  onSubmit,
  loading = false,
  editMode = false,
}) => {
  const [thirdPartyAgents, setThirdPartyAgents] = useState<ThirdPartyAgentOption[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingThirdPartyAgents, setLoadingThirdPartyAgents] = useState(false);
  const [invoicePeriodDays, setInvoicePeriodDays] = useState<number>(30);
  const [currencyInWords, setCurrencyInWords] = useState("Ugandan shillings only");

  const [formData, setFormData] = useState<InvoiceFormData>({
    thirdPartyAgentId: null,
    memberId: null,
    targetType: "member",
    customerName: "",
    invoiceNo: null,
    invoiceDate: "",
    dueDate: "",
    invoiceType: "Manual",
    status: "draft",
    vatInclusive: true,
    items: [],
    subTotal: 0,
    vat: 0,
    totalAmount: 0,
    amountInWords: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load customers, company config, and (optionally) proforma data for editing
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoadingThirdPartyAgents(true);

        const [agentsRes, membersRes, settingsRes] = await Promise.all([
          fetch("/api/institution/third-party-agents?limit=200&status=Active", { cache: "no-store" }),
          fetch("/api/institution/members?limit=200&status=Active", { cache: "no-store" }),
          fetch("/api/institution/settings", { cache: "no-store" }),
        ]);

        if (agentsRes.ok) {
          const data = await agentsRes.json();
          const clientArray = Array.isArray(data)
            ? data
            : (data?.third_party_agents ?? data?.items ?? []);

          const mapped: ThirdPartyAgentOption[] = clientArray.map((c: any) => ({
            id: String(c?.id || ""),
            name: String(
              c?.name ||
                c?.full_name ||
                c?.name ||
                c?.client_name ||
                c?.email ||
                c?.phone ||
                c?.id ||
                "",
            ),
          })).filter((c: { id: string }) => c.id);

          setThirdPartyAgents(mapped);
        }

        if (membersRes.ok) {
          const data = await membersRes.json();
          const memberArray = Array.isArray(data)
            ? data
            : (data?.members ?? data?.third_party_agents ?? []);
          const mappedMembers: Member[] = memberArray.map((m: any) => ({
            id: String(m.id || ""),
            memberName: String(m.full_name || m.memberName || ""),
          }));
          setMembers(mappedMembers);
        }

        if (settingsRes.ok) {
          const body = await settingsRes.json();
          const days = Number(body?.config?.invoicePeriodDays || 30);
          setInvoicePeriodDays(days > 0 ? days : 30);
          const inWords = String(body?.config?.currencyInWords || "").trim();
          if (inWords) setCurrencyInWords(inWords);
        }

        // If editing an existing invoice/proforma, merge initial values
        if (initialValues && Object.keys(initialValues).length > 0) {
          setFormData((prev) => ({
            ...prev,
            ...initialValues,
            invoiceDate: normalizeToYmd(initialValues.invoiceDate) || prev.invoiceDate,
            dueDate: normalizeToYmd(initialValues.dueDate) || prev.dueDate,
          }));
        }
      } finally {
        setLoadingThirdPartyAgents(false);
      }
    };

    void fetchInitialData();
  }, []); // empty dependency array → runs only once

  // Recalculate totals whenever items or VAT setting change
  useEffect(() => {
    const subTotal = formData.items.reduce(
      (sum, item) => sum + item.totalPrice,
      0,
    );

    const yesOnVatTotal = formData.items
      .filter((item) => item.onVat)
      .reduce((sum, item) => sum + item.totalPrice, 0);

    const vatRate = 18;

    let vat = 0;
    let totalAmount = subTotal;

    if (formData.vatInclusive && yesOnVatTotal > 0) {
      vat = Math.round((yesOnVatTotal * vatRate) / 100);
      totalAmount = subTotal + vat;
    }

    setFormData((prev) => ({
      ...prev,
      subTotal,
      vat,
      totalAmount,
      amountInWords: totalAmount > 0 ? numberToWords(totalAmount, currencyInWords) : "",
    }));
  }, [formData.items, formData.vatInclusive, currencyInWords]);

  const parseLocalDateFromYMD = (value: string | null): Date | undefined => {
    if (!value) return undefined;
    // Treat stored YYYY-MM-DD as a local date to avoid off-by-one issues
    // when the browser parses plain dates as UTC.
    return new Date(`${value}T00:00:00`);
  };

  const formatDateYMD = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const setField = (
    field: keyof InvoiceFormData,
    value: string | number | boolean | InvoiceItemForm[],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[field];
        return copy;
      });
    }
  };

  const handleCustomerChange = (idStr: string) => {
    if (formData.targetType === "member") {
      const member = members.find((m) => m.id === idStr);
      if (!member) return;
      setFormData((prev) => ({
        ...prev,
        memberId: member.id,
        thirdPartyAgentId: null,
        customerName: member.memberName,
      }));
      return;
    }

    const client = thirdPartyAgents.find((c) => c.id === idStr);
    if (!client) return;
    setFormData((prev) => ({
      ...prev,
      thirdPartyAgentId: client.id,
      memberId: null,
      customerName: client.name,
    }));
  };

  const handleVatInclusiveChange = (checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      vatInclusive: checked,
      // when toggling VAT setting, apply to all existing items
      items: prev.items.map((item) => ({
        ...item,
        onVat: checked,
      })),
    }));
  };

  const handleInvoiceDateChange = (value: string) => {
    if (!value) return;

    const calculatedDue = addDays(value, invoicePeriodDays);

    setFormData((prev) => ({
      ...prev,
      invoiceDate: value,
      dueDate: calculatedDue,
    }));
  };

  const addItem = () => {
    const newItem: InvoiceItemForm = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      unit: "",
      description: "",
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      // new items follow the current VAT setting
      onVat: formData.vatInclusive,
    };
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
  };

  const updateItem = (
    id: string,
    field: keyof InvoiceItemForm,
    value: string | number | boolean,
  ) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.id !== id) return item;
        const updated: InvoiceItemForm = { ...item, [field]: value };
        if (field === "quantity" || field === "unitPrice") {
          updated.totalPrice = updated.quantity * updated.unitPrice;
        }
        return updated;
      }),
    }));
  };

  const removeItem = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== id),
    }));
  };

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};

    if (formData.targetType === "member" && !formData.memberId) {
      nextErrors.memberId = "Member is required";
    }
    if (formData.targetType === "third_party_agent" && !formData.thirdPartyAgentId) {
      nextErrors.thirdPartyAgentId = "Third party agent is required";
    }

    if (!formData.invoiceDate) {
      nextErrors.invoiceDate = "Invoice date is required";
    }
    if (!formData.dueDate) {
      nextErrors.dueDate = "Due date is required";
    }
    if (formData.items.length === 0) {
      nextErrors.items = "At least one item is required";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    await onSubmit(formData);
  };

  return (
    <div className="w-full max-h-[85vh] overflow-auto max-w-5xl mx-auto p-4">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
          <h3 className="text-lg font-medium mb-2">Invoice details</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Invoice For *</Label>
              <StyledSelect
                value={formData.targetType}
                onChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    targetType: value === "third_party_agent" ? "third_party_agent" : "member",
                    memberId: null,
                    thirdPartyAgentId: null,
                    customerName: "",
                  }))
                }
                placeholder="Select target type"
                options={[
                  { value: "member", label: "Member" },
                  { value: "third_party_agent", label: "Third party agent" },
                ]}
              />
            </div>

            <div className="space-y-2">
              <Label>{formData.targetType === "member" ? "Member" : "Third party agent"} *</Label>

              <StyledSelect
                value={formData.targetType === "member" ? formData.memberId || "" : formData.thirdPartyAgentId || ""}
                onChange={handleCustomerChange}
                placeholder={
                  loadingThirdPartyAgents
                    ? "Loading..."
                    : formData.targetType === "member"
                      ? "Select member"
                      : "Select third party agent"
                }
                options={
                  formData.targetType === "member"
                    ? members.map((member) => ({
                        value: member.id,
                        label: member.memberName,
                      }))
                    : thirdPartyAgents.map((client) => ({
                        value: client.id,
                        label: client.name,
                      }))
                }
                searchable // enable search box
              />

              {(errors.thirdPartyAgentId || errors.memberId) && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <FaExclamationTriangle className="w-3 h-3" />
                  {errors.memberId || errors.thirdPartyAgentId}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoiceDate">Invoice date *</Label>
              <ReeveDatePicker
                value={formData.invoiceDate}
                onChange={handleInvoiceDateChange}
                placeholder="Select invoice date"
              />
              {errors.invoiceDate && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <FaExclamationTriangle className="w-3 h-3" />
                  {errors.invoiceDate}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">Due date *</Label>
              <ReeveDatePicker
                value={formData.dueDate ?? ""}
                onChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    dueDate: value,
                  }))
                }
                placeholder="Select due date"
              />
              {errors.dueDate && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <FaExclamationTriangle className="w-3 h-3" />
                  {errors.dueDate}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <StyledSelect
                value={formData.status}
                onChange={(value) => setField("status", value)}
                placeholder="Select invoice status"
                options={[
                  { value: "draft", label: "Draft" },
                  { value: "sent", label: "Sent" },
                ]}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center justify-between">
                <span>VAT setting</span>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <div className="relative">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={formData.vatInclusive}
                      onChange={(e) =>
                        handleVatInclusiveChange(e.target.checked)
                      }
                    />
                    {/* Track */}
                    <div className="w-10 h-5 bg-red-500 rounded-full peer-checked:bg-green-500 transition-colors" />
                    {/* Thumb */}
                    <div className="absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full shadow transition-transform peer-checked:translate-x-5" />
                  </div>
                  <span
                    className={`text-xs ${
                      formData.vatInclusive ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {formData.vatInclusive ? "Inclusive" : "Exclusive"}
                  </span>
                </label>
              </Label>
            </div>
          </div>
        </div>

        {/* Items */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl border-gray-200 shadow-sm p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <FaCalculator className="w-5 h-5 text-green-600" />
              Items
            </h3>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={addItem}
              className="hover:bg-[#f08c2b]"
            >
              <FaPlus className="w-3 h-3 mr-1" />
              Add item
            </Button>
          </div>

          {formData.items.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              <FaCalculator className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              No items yet. Use &quot;Add item&quot; to begin.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-12 gap-2 items-center p-3 bg-gray-100 rounded-lg font-medium text-gray-700 text-xs">
                <div className="col-span-1 flex justify-center">VAT</div>
                <div className="col-span-1 flex justify-center">Qty</div>
                <div className="col-span-1 flex justify-center">Unit</div>
                <div className="col-span-4 flex justify-center">
                  Description
                </div>
                <div className="col-span-2 flex justify-center">Unit price</div>
                <div className="col-span-2 flex justify-center">Total</div>
                <div className="col-span-1 flex justify-center">Actions</div>
              </div>

              {formData.items.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="grid grid-cols-12 gap-2 items-center p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="col-span-1 flex justify-center">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                      checked={item.onVat}
                      onChange={(e) =>
                        updateItem(item.id, "onVat", e.target.checked)
                      }
                    />
                  </div>
                  <div className="col-span-1">
                    <input
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(
                          item.id,
                          "quantity",
                          Number(e.target.value) || 0,
                        )
                      }
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-md bg-white text-gray-900 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400
                         transition-all duration-200"
                    />
                  </div>
                  <div className="col-span-1">
                    <input
                      value={item.unit}
                      onChange={(e) =>
                        updateItem(item.id, "unit", e.target.value)
                      }
                      placeholder="Unit"
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-md bg-white text-gray-900 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400
                         transition-all duration-200"
                    />
                  </div>
                  <div className="col-span-4">
                    <input
                      value={item.description}
                      onChange={(e) =>
                        updateItem(item.id, "description", e.target.value)
                      }
                      placeholder="Product / description"
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-md bg-white text-gray-900 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400
                         transition-all duration-200"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      value={item.unitPrice}
                      onChange={(e) =>
                        updateItem(
                          item.id,
                          "unitPrice",
                          Number(e.target.value) || 0,
                        )
                      }
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-md bg-white text-gray-900 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400
                         transition-all duration-200"
                    />
                  </div>
                  <div className="col-span-2 items-center">
                    <div className="px-2 py-1.5 bg-white border border-gray-300 rounded-md text-right font-semibold text-gray-900 text-sm">
                      {formatCurrency(item.totalPrice)}
                    </div>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <button
                      type="button"
                      className="p-2 text-red-500 hover:text-red-600 hover:bg-red-100 rounded-md transition-colors duration-200"
                      onClick={() => removeItem(item.id)}
                    >
                      <FaTrash className="w-3 h-3" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {errors.items && (
            <p className="mt-3 text-xs text-red-600 flex items-center gap-1">
              <FaExclamationTriangle className="w-3 h-3" />
              {errors.items}
            </p>
          )}
        </motion.div>

        {/* Totals */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg border shadow-sm p-6"
        >
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FaDollarSign className="w-5 h-5 text-green-600" />
            Summary
          </h3>
          <div className="space-y-2 text-sm text-gray-700 max-w-sm ml-auto">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(formData.subTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>VAT (18%)</span>
              <span>{formatCurrency(formData.vat)}</span>
            </div>
            <div className="border-t pt-2 mt-2 flex justify-between font-semibold">
              <span>
                {formData.vatInclusive
                  ? "Total (VAT included)"
                  : "Total (VAT excluded)"}
              </span>
              <span>{formatCurrency(formData.totalAmount)}</span>
            </div>
            {formData.amountInWords && (
              <p className="mt-3 text-xs text-gray-600">
                <span className="font-medium">Amount in words:</span>
                <br />
                {formData.amountInWords}
              </p>
            )}
          </div>
        </motion.div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
          >
            <FaTimes className="w-3 h-3" />
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-black hover:bg-[#f08c2b] text-white rounded-lg text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <FaSave className="w-3 h-3" />
                {editMode ? "Update invoice" : "Create invoice"}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default InvoiceForm;
