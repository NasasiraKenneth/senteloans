"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Plus,
  Edit,
  Percent,
  Calendar,
  Shield,
  Users,
  FileText,
} from "lucide-react"
import DataTable from "@/components/datatables/DataTable"
import { DataTableColumn } from "@/components/datatables/DataTable"
import { FilterField } from "@/components/datatables/TableFilter"
import { ActionButtons } from "@/components/datatables/ActionButtons"
import { getSession } from "@/lib/session"
import AddNewLoanProduct from "./components/add/addNewLoanProduct"
import EditLoanProduct from "./components/edit/editLoanProduct"

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
}

export default function LoanProductsPage() {
  const [products, setProducts] = useState<LoanProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [currency, setCurrency] = useState("UGX")
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editProductId, setEditProductId] = useState<string | null>(null)

  useEffect(() => {
    const s = getSession()
    if (s?.institution?.config?.currency) setCurrency(s.institution.config.currency)
  }, [])

  const onPageChange = (_: unknown, newPage: number) => setPage(newPage)
  const onRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPage(0)
    setRowsPerPage(parseInt(e.target.value, 10))
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

  async function loadProducts(queryParams?: object) {
    setLoading(true)
    setError("")
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
      params.set("limit", "200")
      const res = await fetch(`/api/institution/loan-products?${params.toString()}`, { cache: "no-store" })
      if (!res.ok) throw new Error(`Failed to load: ${res.status}`)
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
        })),
      )
    } catch (e: any) {
      setError(e?.message || "Failed to load loan products")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProducts()
  }, [])

  const handleQueryParamsChange = useCallback((params: object) => {
    loadProducts(params)
  }, [])

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
      render: (row) => (
        <div className="flex flex-wrap gap-1.5">
          {row.collateral_required && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 border border-blue-200">
              <Shield className="h-3 w-3" /> Collateral
            </span>
          )}
          {row.guarantors_required > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700 border border-purple-200">
              <Users className="h-3 w-3" /> {row.guarantors_required} Guarantor{row.guarantors_required > 1 ? "s" : ""}
            </span>
          )}
          {row.insurance_required && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200">
              <FileText className="h-3 w-3" /> Insurance
            </span>
          )}
          {row.processing_fee_percentage > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600 border border-gray-200">
              {row.processing_fee_percentage}% Fee
            </span>
          )}
          {!row.collateral_required && row.guarantors_required === 0 && !row.insurance_required && row.processing_fee_percentage === 0 && (
            <span className="text-xs text-muted-foreground">None</span>
          )}
        </div>
      ),
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
    },
  ]

  const filterFields: FilterField[] = [
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
        <Button
          className="hover:bg-black/70 hover:text-[#f08c2b]"
          onClick={() => setIsAddOpen(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Loan Product
        </Button>
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
      {error && <div className="text-sm text-red-600">{error}</div>}
      <DataTable<LoanProduct>
        columns={columns}
        rows={products.slice(page * rowsPerPage, (page + 1) * rowsPerPage)}
        loading={loading}
        title={`Loan Products (${products.length})`}
        filterFields={filterFields}
        onQueryParamsChange={handleQueryParamsChange}
        emptyMessage="No loan products found"
        getRowId={(row) => row.id}
        pagination={{
          page,
          rowsPerPage,
          total: products.length,
          onPageChange,
          onRowsPerPageChange,
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
