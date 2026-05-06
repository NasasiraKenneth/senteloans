"use client";

import { useEffect, useMemo, useState } from "react";
import { SlideModal } from "@/components/modals/SlideModal";
import { Button } from "@/components/ui/button";
import { Download, Edit, ZoomIn, ZoomOut } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { downloadInvoicePdfFile } from "@/lib/invoices/download";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

interface ViewInvoicePdfProps {
  isOpen: boolean;
  invoiceId: string | null;
  onClose: () => void;
  onEdit: () => void;
}

export default function ViewInvoicePdf({
  isOpen,
  invoiceId,
  onClose,
  onEdit,
}: ViewInvoicePdfProps) {
  const [pdfModule, setPdfModule] = useState<null | typeof import("react-pdf")>(null);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1);
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;
    const loadPdf = async () => {
      const mod = await import("react-pdf");
      mod.pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${mod.pdfjs.version}/build/pdf.worker.min.mjs`;
      if (mounted) setPdfModule(mod);
    };
    void loadPdf();
    return () => {
      mounted = false;
    };
  }, []);

  const previewUrl = useMemo(() => {
    if (!invoiceId) return "";
    return `/api/institution/invoices/${invoiceId}/pdf`;
  }, [invoiceId]);

  const handleDownload = () => {
    if (!invoiceId) return;
    const download = async () => {
      toast({
        variant: "warning",
        title: "Generating PDF",
        description: "Preparing invoice PDF...",
      });

      try {
        await downloadInvoicePdfFile({
          invoiceId,
          fallbackName: `${invoiceId}.pdf`,
        })

        toast({
          variant: "success",
          title: "Download invoice PDF successfully",
          description: "Invoice PDF downloaded.",
        });
      } catch (e: unknown) {
        const message = String((e as Error)?.message || "Unexpected error")
        if (message === "missing_permission:download_invoice") {
          toast({
            variant: "warning",
            title: "Access denied",
            description: "You do not have permission to download invoices.",
          })
          return
        }
        toast({
          variant: "destructive",
          title: "Download invoice PDF failed",
          description: message,
        });
      }
    };

    void download();
  };

  return (
    <SlideModal
      isOpen={isOpen}
      onClose={onClose}
      title="Invoice Preview"
      className="z-10"
    >
      <div className="p-4 space-y-4">
        {invoiceId ? (
          <div className="space-y-3">
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setScale((prev) => Math.max(0.6, Number((prev - 0.1).toFixed(2))))}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <div className="min-w-14 text-center text-sm font-medium">{Math.round(scale * 100)}%</div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setScale((prev) => Math.min(2.5, Number((prev + 0.1).toFixed(2))))}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>

            <div className="h-[70vh] overflow-auto rounded-md border border-gray-800 bg-gray-500 p-2">
              {pdfModule ? (
                <pdfModule.Document
                  file={previewUrl}
                  loading={<div className="p-4 text-sm text-gray-600">Loading invoice preview...</div>}
                  error={<div className="p-4 text-sm text-red-600">Failed to load invoice PDF preview.</div>}
                  onLoadSuccess={({ numPages: loadedPages }) => setNumPages(loadedPages)}
                >
                  <div className="space-y-3">
                    {Array.from({ length: numPages }, (_, i) => (
                      <div key={`page-${i + 1}`} className="flex justify-center">
                        <pdfModule.Page pageNumber={i + 1} scale={scale} />
                      </div>
                    ))}
                  </div>
                </pdfModule.Document>
              ) : (
                <div className="p-4 text-sm text-gray-600">Loading invoice preview...</div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-gray-200 p-6 text-sm text-gray-600">
            Select an invoice to preview.
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-3">
          <Button variant="outline" onClick={onEdit} disabled={!invoiceId}>
            <Edit className="h-4 w-4 mr-2" />
            Edit Invoice
          </Button>
          <Button onClick={handleDownload} disabled={!invoiceId}>
            <Download className="h-4 w-4 mr-2" />
            Download Invoice
          </Button>
        </div>
      </div>
    </SlideModal>
  );
}
