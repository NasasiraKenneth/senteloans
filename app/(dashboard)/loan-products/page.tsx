"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Plus,
  Edit,
  Calendar,
} from "lucide-react"
import DataTable from "@/components/datatables/DataTable"
import { DataTableColumn } from "@/components/datatables/DataTable"
import { FilterField } from "@/components/datatables/TableFilter"
import { ActionButtons } from "@/components/datatables/ActionButtons"
import { getInstitutionCurrency } from "@/lib/session"
import { withBranchFilterFirst } from "@/lib/filters/branch-first-filter"
import { downloadLoanProductsExport } from "./export/export"
import AddNewLoanProduct from "./components/add/addNewLoanProduct"
import EditLoanProduct from "./components/edit/editLoanProduct"
import LoanProductExpandableContent from "./components/LoanProductExpandableContent"
import Tooltip from "@mui/material/Tooltip"
import { useToast } from "@/components/ui/toast"

type LoanProduct = {
  id: string
  product_name: string
  product_code: string
  description: string | null
  minimum_amount: number
  maximum_amount: number
  interest_rate: number
  minimum_tenure_months: number
  maximum_tenure_months: number
  interest_calculation_method: string
  collateral_required: boolean
  guarantors_required: number
  processing_fee_percentage: number
  insurance_required: boolean
  status: string
  eligibilities: Array<{ id: string; eligibility: string; status: string }>
}

export default function LoanProductsPage() {
  const { toast } = useToast()
  const [products, setProducts] = useState<LoanProduct[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [activeQueryParams, setActiveQueryParams] = useState<Record<string, unknown>>({})
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({})
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null)
  const [currency, setCurrency] = useState("UGX")
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editProductId, setEditProductId] = useState<string | null>(null)
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string | number>>(new Set())
  const [loanProductPermissions, setLoanProductPermissions] = useState({
    viewLoanProducts: false,
    createLoanProduct: false,
    editLoanProduct: false,
    isSuperAdmin: false,
    branches: [] as Array<{ value: string; label: string }>,
  })
  const permissionToastShown = useRef(false)

  useEffect(() => {
    setCurrency(getInstitutionCurrency("UGX"))
  }, [])

  const toggleRowExpand = (rowId: string | number) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) {
        next.delete(rowId)
      } else {
        next.add(rowId)
      }
      return next
    })
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
    }).format(amount)

  const formatMethod = (method: string) => {
    switch (method) {
      case "reducing_balance":
        return "Reducing Balance"
      case "flat_rate":
        return "Flat Rate"
      case "compound":
        return "Compound"
      default:
        return method
    }
  }

  async function loadProducts(queryParams?: object, pageOverride?: number, rowsPerPageOverride?: number) {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (queryParams) {
        Object.entries(queryParams).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== "") {
            params.set(key, String(value))
          }
        })
      }
      if (!params.has("status")) params.set("status", "")
      const requestPage = typeof pageOverride === "number" ? pageOverride : page
      const requestRows = typeof rowsPerPageOverride === "number" ? rowsPerPageOverride : rowsPerPage
      params.set("page", String(requestPage + 1))
      params.set("pageSize", String(requestRows))
      const res = await fetch(`/api/institution/loan-products?${params.toString()}`, { cache: "no-store" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (res.status === 403 && body?.error === "missing_permission:view_loan_products") {
          throw new Error("missing_permission:view_loan_products")
        }
        throw new Error(body.error || `Failed to load: ${res.status}`)
      }
      const json = await res.json()
      const items: LoanProduct[] = Array.isArray(json.items) ? json.items : []
      setProducts(
        items.map((p) => ({
          ...p,
          minimum_amount: Number(p.minimum_amount || 0),
          maximum_amount: Number(p.maximum_amount || 0),
          interest_rate: Number(p.interest_rate || 0),
          minimum_tenure_months: Number(p.minimum_tenure_months || 0),
          maximum_tenure_months: Number(p.maximum_tenure_months || 0),
          guarantors_required: Number(p.guarantors_required || 0),
          processing_fee_percentage: Number(p.processing_fee_percentage || 0),
          eligibilities: Array.isArray(p.eligibilities) ? p.eligibilities : [],
        })),
      )
      setTotalRows(Number(json?.total ?? items.length ?? 0))
      permissionToastShown.current = false
    } catch (e: any) {
      const message = e?.message || "Failed to load loan products"
      setError(message === "missing_permission:view_loan_products" ? null : message)
      setTotalRows(0)
      if (message === "missing_permission:view_loan_products") {
        if (!permissionToastShown.current) {
          toast({
            variant: "warning",
            title: "Access denied",
            description: "You do not have permission to view loan products.",
          })
          permissionToastShown.current = true
        }
      } else {
        toast({
          variant: "destructive",
          title: "Failed to load loan products",
          description: message,
        })
      }
    } finally {
      setLoading(false)
    }
  }

  async function loadLoanProductPermissions() {
    try {
      const res = await fetch("/api/institution/loan-products/permissions", { cache: "no-store" })
      if (!res.ok) return
      const data = (await res.json()) as {
        permissions?: {
          viewLoanProducts?: boolean
          createLoanProduct?: boolean
          editLoanProduct?: boolean
          isSuperAdmin?: boolean
          branches?: Array<{ id: string; name: string }>
        }
      }
      setLoanProductPermissions({
        viewLoanProducts: !!data.permissions?.viewLoanProducts,
        createLoanProduct: !!data.permissions?.createLoanProduct,
        editLoanProduct: !!data.permissions?.editLoanProduct,
        isSuperAdmin: !!data.permissions?.isSuperAdmin,
        branches: (data.permissions?.branches || []).map((b) => ({ value: b.id, label: b.name })),
      })
    } catch {
      // keep defaults
    }
  }

  useEffect(() => {
    loadLoanProductPermissions()
    loadProducts()
  }, [])

  const handleQueryParamsChange = useCallback((params: object) => {
    setPage(0)
    const normalized = params as Record<string, unknown>
    const flat: Record<string, string> = {}
    Object.entries(normalized).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== "") flat[k] = String(v)
    })
    setActiveFilters(flat)
    setActiveQueryParams(normalized)
    void loadProducts(normalized, 0, rowsPerPage)
  }, [rowsPerPage])

  const handlePageChange = useCallback(
    (_: unknown, newPage: number) => {
      setPage(newPage)
      void loadProducts(activeQueryParams, newPage, rowsPerPage)
    },
    [activeQueryParams, rowsPerPage]
  )

  const handleRowsPerPageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = parseInt(e.target.value, 10)
      setRowsPerPage(next)
      setPage(0)
      void loadProducts(activeQueryParams, 0, next)
    },
    [activeQueryParams]
  )

  const downloadExport = async (format: "excel" | "pdf") => {
    if (!loanProductPermissions.viewLoanProducts) {
      toast({
        variant: "warning",
        title: "Access denied",
        description: "You do not have permission to export loan products.",
      })
      return
    }
    setExporting(format)
    try {
      await downloadLoanProductsExport(activeFilters, format)
      toast({
        variant: "success",
        title: `${format === "excel" ? "Excel" : "PDF"} downloaded`,
        description: `Successfully downloaded loan products ${format.toUpperCase()} report.`,
      })
    } catch (e: any) {
      const message = String(e?.message || "")
      if (message === "missing_permission:view_loan_products") {
        toast({
          variant: "warning",
          title: "Access denied",
          description: "You do not have permission to export loan products.",
        })
      } else {
        toast({
          variant: "destructive",
          title: `Download ${format.toUpperCase()} failed`,
          description: message || `Failed to download ${format.toUpperCase()}.`,
        })
      }
    } finally {
      setExporting(null)
    }
  }

  const handleEdit = (row: LoanProduct) => {
    setEditProductId(row.id)
    setIsEditOpen(true)
  }

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "Active":
        return { bg: "bg-green-100 text-green-700 border border-green-200", dot: "bg-green-500" }
      case "Inactive":
        return { bg: "bg-gray-100 text-gray-600 border border-gray-200", dot: "bg-gray-400" }
      case "Suspended":
        return { bg: "bg-red-100 text-red-700 border border-red-200", dot: "bg-red-500" }
      default:
        return { bg: "bg-yellow-100 text-yellow-700 border border-yellow-200", dot: "bg-yellow-500" }
    }
  }

  const activeProducts = products.filter((p) => p.status === "Active").length
  const inactiveProducts = products.filter((p) => p.status !== "Active").length
  const avgInterestRate =
    products.length > 0
      ? (products.reduce((sum, p) => sum + p.interest_rate, 0) / products.length).toFixed(1)
      : "0"
  const getRequirementsCount = (row: LoanProduct) =>
    (row.collateral_required ? 1 : 0) +
    (row.guarantors_required > 0 ? 1 : 0) +
    (row.insurance_required ? 1 : 0) +
    (row.processing_fee_percentage > 0 ? 1 : 0)

  const columns: DataTableColumn<LoanProduct>[] = [
    {
      key: "product_code",
      header: `Product ID`,
      render: (row) => (
        <div className="text-sm font-mono font-medium text-gray-700">{row.product_code}</div>
      ),
    },
    {
      key: "product_name",
      header: "Product",
      render: (row) => (
        <div>
          <div className="font-semibold">{row.product_name}</div>
        </div>
      ),
    },
    {
      key: "interest_rate",
      header: "Interest Rate",
      render: (row) => (
        <div className="flex items-center gap-1.5">
 
          <span className="font-medium">{row.interest_rate}%</span>
          <span className="text-xs text-muted-foreground">/ {formatMethod(row.interest_calculation_method)}</span>
        </div>
      ),
    },
    {
      key: "amount_range",
      header: "Amount Range",
      render: (row) => (
        <div className="text-sm">
          <span className="font-medium">{formatCurrency(row.minimum_amount)}</span>
          <span className="text-muted-foreground mx-1">—</span>
          <span className="font-medium">{formatCurrency(row.maximum_amount)}</span>
        </div>
      ),
    },
    {
      key: "tenure_range",
      header: "Tenure",
      render: (row) => (
        <div className="flex items-center gap-1.5 text-sm">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <span>
            {row.minimum_tenure_months}–{row.maximum_tenure_months} months
          </span>
        </div>
      ),
    },
    {
      key: "requirements",
      header: "Requirements",
      render: (row) => <span className="font-semibold text-gray-800">{getRequirementsCount(row)}</span>,
    },
    {
      key: "eligibilities",
      header: "Eligibilities",
      render: (row) => <span className="font-semibold text-gray-800">{row.eligibilities.length}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const style = getStatusStyle(row.status)
        return (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
            {row.status}
          </span>
        )
      },
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => <ActionButtons actions={productActions} row={row} />,
    },
  ]

  const productActions = [
    {
      label: "Edit",
      onClick: handleEdit,
      variant: "primary",
      icon: <Edit className="h-4 w-4" />,
      disabled: !loanProductPermissions.editLoanProduct,
    },
  ]

  const filterFields: FilterField[] = useMemo(() => {
    const fields: FilterField[] = [
      {
        field: "q",
        label: "Search by product name or code",
        type: "text",
      },
      {
        field: "status",
        label: "Status",
        options: [
          { value: "", label: "All" },
          { value: "Active", label: "Active" },
          { value: "Inactive", label: "Inactive" },
          { value: "Suspended", label: "Suspended" },
        ],
        multiple: false,
        type: "select",
      },
    ]

    return withBranchFilterFirst(fields, {
      isSuperAdmin: loanProductPermissions.isSuperAdmin,
      branchOptions: loanProductPermissions.branches,
    })
  }, [loanProductPermissions.isSuperAdmin, loanProductPermissions.branches])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-balance">Loan Products</h2>
          <p className="text-muted-foreground text-pretty">
            Configure and manage the loan products offered by your institution.
          </p>
        </div>
        <Tooltip
          title={loanProductPermissions.createLoanProduct ? "" : "You do not have permission to create loan products"}
          arrow
          placement="top"
        >
          <span className="inline-flex">
            <Button
              className="hover:bg-black/70 hover:text-[#f08c2b]"
              onClick={() => setIsAddOpen(true)}
              disabled={!loanProductPermissions.createLoanProduct}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Loan Product
            </Button>
          </span>
        </Tooltip>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{products.length}</div>
            <p className="text-xs text-muted-foreground">{activeProducts} active, {inactiveProducts} inactive</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average Interest Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgInterestRate}%</div>
            <p className="text-xs text-muted-foreground">Across all products</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Products</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeProducts}</div>
            <p className="text-xs text-muted-foreground">Available for new loans</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <DataTable<LoanProduct>
        columns={columns}
        rows={products}
        loading={loading}
        title={`Loan Products (${totalRows})`}
        exportActions={{
          onExcel: () => void downloadExport("excel"),
          onPdf: () => void downloadExport("pdf"),
          excelDisabled: loading || products.length === 0 || exporting !== null || !loanProductPermissions.viewLoanProducts,
          pdfDisabled: loading || products.length === 0 || exporting !== null || !loanProductPermissions.viewLoanProducts,
        }}
        filterFields={filterFields}
        onQueryParamsChange={handleQueryParamsChange}
        emptyMessage="No loan products found"
        getRowId={(row) => row.id}
        renderDetail={(row) => <LoanProductExpandableContent loanProduct={row} />}
        expandedRowIds={expandedRowIds}
        onToggleExpand={toggleRowExpand}
        onRowClick={(row) => toggleRowExpand(row.id)}
        pagination={{
          page,
          rowsPerPage,
          total: totalRows,
          onPageChange: handlePageChange,
          onRowsPerPageChange: handleRowsPerPageChange,
          rowsPerPageOptions: [10, 25, 50],
        }}
      />

      <AddNewLoanProduct
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSuccess={() => loadProducts()}
      />

      <EditLoanProduct
        isOpen={isEditOpen}
        productId={editProductId}
        onClose={() => { setIsEditOpen(false); setEditProductId(null) }}
        onSuccess={() => loadProducts()}
      />
    </div>
  )
}
