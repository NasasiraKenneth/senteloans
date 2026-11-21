'use client'

import React, {useEffect, useMemo, useState} from 'react'
import TablePagination from '@mui/material/TablePagination'
import {motion, AnimatePresence} from 'framer-motion'
import {Filter} from "@/types";
import {FilterField} from "@/components/datatables/TableFilter";
import {Icon, TabularFilters} from "@/components/datatables/index";
import TableFilters from "@/components/datatables/TableFilters";
import {convertDate} from "@/app/lib/utils";
import { RiFileExcel2Line } from "react-icons/ri"
import { BsFileEarmarkPdf, BsFiletypePdf } from "react-icons/bs"
import { Loader2 } from "lucide-react"
import TooltipButton from "@/components/newUI/tooltip_button";

export interface DataTableColumn<Row> {
    key: string
    header: string
    width?: string
    headerClassName?: string
    cellClassName?: string
    accessor?: (row: Row) => React.ReactNode
    render?: (row: Row) => React.ReactNode
}

export interface DataTablePaginationConfig {
    page: number
    rowsPerPage: number
    total: number
    onPageChange: (event: unknown, page: number) => void
    onRowsPerPageChange: (event: React.ChangeEvent<HTMLInputElement>) => void
    rowsPerPageOptions?: number[]
    className?: string
}

export interface DataTableProps<Row> {
    columns: DataTableColumn<Row>[]
    title?: string
    rows: Row[]
    loading?: boolean
    emptyMessage?: string
    onQueryParamsChange?:(params:object)=>void
    filterFields?: FilterField[],
    tabularFilters?: Filter[],
    tabularFilterField?: string,
    getRowId?: (row: Row, index: number) => string | number
    onRowClick?: (row: Row) => void
    renderDetail?: (row: Row) => React.ReactNode
    expandedRowIds?: Set<string | number>
    onToggleExpand?: (rowId: string | number) => void
    pagination?: DataTablePaginationConfig
    exportButtons?: React.ReactNode
    exportActions?: {
        onExcel?: () => void
        onPdf?: () => void
        onSummaryPdf?: () => void
        excelDisabled?: boolean
        pdfDisabled?: boolean
        summaryPdfDisabled?: boolean
        excelLoading?: boolean
        pdfLoading?: boolean
        summaryPdfLoading?: boolean
    }
    className?: string
}

export default function DataTable<Row>({
                                           columns,
                                           rows,
                                           onQueryParamsChange,
                                           title,
                                           tabularFilters,
                                           filterFields,
                                           tabularFilterField,
                                           loading,
                                           emptyMessage = 'No data',
                                           getRowId,
                                           onRowClick,
                                           renderDetail,
                                           expandedRowIds,
                                           onToggleExpand,
                                           pagination,
                                           exportButtons,
                                           exportActions,
                                           className,
                                       }: DataTableProps<Row>) {

    const [internalExpanded, setInternalExpanded] = useState<Set<string | number>>(new Set())
    const [queryParameters, setQueryParameters] = useState<object>({});
    const hasDetail = Boolean(renderDetail)
    const getId = (row: Row, i: number) => getRowId ? getRowId(row, i) : ((row as any)?.id ?? i)

    const isExpanded = (id: string | number) =>
        expandedRowIds ? expandedRowIds.has(id) : internalExpanded.has(id)

    useEffect(() => {
        if(onQueryParamsChange){
            onQueryParamsChange(queryParameters)
        }
    }, [queryParameters]);
    const toggle = (id: string | number) => {
        if (onToggleExpand) {
            onToggleExpand(id);
            return;
        }
        setInternalExpanded(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    const itemVariants = {
        hidden: {opacity: 0, y: 20},
        visible: {opacity: 1, y: 0}
    };

    const handleOnTabularFilterChange = (filter: string | number) => {
        if (!tabularFilterField) return;
        const params: Record<string, any> = { ...(queryParameters as Record<string, any>) };
        if (filter === undefined || filter === null || filter === "") {
            delete params[tabularFilterField];
        } else {
            params[tabularFilterField] = filter;
        }
        setQueryParameters(params);
    }

    const handleOnSelectFilterChange = (field: string, type:string, value: any) => {
        const params: Record<string, any> = { ...(queryParameters as Record<string, any>) };
        switch (type){
            case  'text':
                if (value === undefined || value === null || value === '') {
                    delete params[field]
                } else {
                    params[field] = value
                }
                break;
            case 'radio':
                if (value === undefined || value === null || value === '') {
                    delete params[field]
                } else {
                    params[field] = value
                }
                break;
            case 'checkbox':
                if(Array.isArray(value)){
                    if (value.length > 0) {
                        params[field] = value.join(",")
                    } else {
                        delete params[field]
                    }
                }
                break;
            default:
                if ((Array.isArray(value) && value.length >= 1)) {
                    const startDate = value[0]
                    const endDate = value[1] || value[0]
                    const start = convertDate(startDate)
                    const end = convertDate(endDate, true)
                    params[field] = {start,end}
                } else {
                    // Ensure clicking X on date filters removes any prior range
                    delete params[field]
                }
                // handle daterange
                break;
        }
        setQueryParameters(params);
    }

    const headerCells = useMemo(() => (
        <tr className="border-b border-gray-200 dark:border-zinc-800">
            {hasDetail && (
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider w-8"></th>
            )}
            {columns.map(col => (
                <th
                    key={col.key}
                    className={`px-4 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider ${col.headerClassName ?? ''}`}
                    style={col.width ? {width: col.width} : undefined}
                >
                    {col.header}
                </th>
            ))}
        </tr>
    ), [columns, hasDetail])

    const defaultExportButtons = exportActions ? (
      <div className="flex items-center gap-2">
        {exportActions.onExcel ? (
          <TooltipButton
            tooltip={exportActions.excelLoading ? "Preparing XLS…" : "Export XLS"}
            onClick={() => exportActions.onExcel?.()}
            disabled={!!exportActions.excelDisabled || !!exportActions.excelLoading}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-green-200 dark:border-green-800/40 bg-white dark:bg-zinc-900 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 hover:border-green-300 dark:hover:border-green-700/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
          >
            {exportActions.excelLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RiFileExcel2Line className="h-4 w-4" />
            )}
          </TooltipButton>
        ) : null}
        {exportActions.onPdf ? (
          <TooltipButton
            tooltip={exportActions.pdfLoading ? "Preparing PDF…" : "Export PDF"}
            onClick={() => exportActions.onPdf?.()}
            disabled={!!exportActions.pdfDisabled || !!exportActions.pdfLoading}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 dark:border-red-800/40 bg-white dark:bg-zinc-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-300 dark:hover:border-red-700/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
          >
            {exportActions.pdfLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BsFileEarmarkPdf className="h-4 w-4" />
            )}
          </TooltipButton>
        ) : null}
        {exportActions.onSummaryPdf ? (
          <TooltipButton
            tooltip={exportActions.summaryPdfLoading ? "Preparing PDF…" : "Summary PDF"}
            onClick={() => exportActions.onSummaryPdf?.()}
            disabled={!!exportActions.summaryPdfDisabled || !!exportActions.summaryPdfLoading}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 dark:border-red-800/40 bg-white dark:bg-zinc-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-300 dark:hover:border-red-700/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
          >
            {exportActions.summaryPdfLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BsFiletypePdf className="h-4 w-4" />
            )}
          </TooltipButton>
        ) : null}
      </div>
    ) : null

    return (
        <div className={`flex flex-col rounded-xl shadow-xs border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 transition-colors ${className ?? ''}`}>

            {/*
                ➤ TOP SECTION
                This section grows naturally without clipping.
            */}
            <div className="flex flex-col w-full space-y-4 p-4">

                {title && (
                    <motion.div
                        variants={itemVariants}
                        initial="hidden"
                        animate="visible"
                        className="bg-white dark:bg-zinc-900/90 rounded-xl p-4 shadow-xs border border-gray-200 dark:border-zinc-800"
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <motion.div
                                    whileHover={{rotate: [0, 10, -10, 0], scale: 1.1}}
                                    transition={{duration: 0.4}}
                                    className="bg-brand text-brand-foreground p-2 rounded-lg shadow-sm shadow-brand/20"
                                >
                                    <Icon provider="fa" iconName="FaTable" size={18} color="currentColor"/>
                                </motion.div>
                                <span className="text-base font-semibold text-gray-900 dark:text-zinc-100">
                                    {title}
                                </span>
                            </div>

                            {exportButtons ? <div className="flex space-x-3">{exportButtons}</div> : defaultExportButtons}

                        </div>
                    </motion.div>
                )}
                {
                    filterFields && filterFields?.length > 0 &&(
                        <div className="w-full">
                            <TableFilters filterFields={filterFields}
                                          onFilterChange={handleOnSelectFilterChange}/>
                        </div>
                    )
                }

                {tabularFilters && tabularFilters?.length > 0 && (
                    <div className="w-full">
                        <TabularFilters
                            filters={tabularFilters}
                            onChange={handleOnTabularFilterChange}
                        />
                    </div>
                )}
            </div>

            {/*
                ➤ TABLE WRAPPER
                Uses overflow-x-auto with auto-hiding scrollbar
            */}
            <div className="px-2 overflow-x-auto scrollbar-autohide">
                <table className="w-full min-w-[700px]">
                    <thead className="bg-gray-50/90 dark:bg-zinc-900/90 sticky top-0 z-10 backdrop-blur-xs">
                    {headerCells}
                    </thead>

                    <tbody className="bg-white dark:bg-zinc-950 divide-y divide-gray-100 dark:divide-zinc-800/80">
                    {loading ? (
                        <tr>
                            <td colSpan={(columns.length + (hasDetail ? 1 : 0))}
                                className="px-4 py-12 text-center text-gray-500 dark:text-zinc-400">
                                <div className="flex flex-col items-center justify-center gap-3">
                                    <Loader2 className="h-6 w-6 animate-spin text-brand" />
                                    <span className="text-sm font-medium">Loading data...</span>
                                </div>
                            </td>
                        </tr>
                    ) : rows.length === 0 ? (
                        <tr>
                            <td colSpan={(columns.length + (hasDetail ? 1 : 0))}
                                className="px-4 py-12 text-center text-gray-500 dark:text-zinc-400">
                                <div className="flex flex-col items-center justify-center gap-2">
                                    <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-zinc-900 flex items-center justify-center text-gray-400 dark:text-zinc-500 border border-gray-200/60 dark:border-zinc-800">
                                        <Icon provider="fa" iconName="FaTable" size={16} />
                                    </div>
                                    <span className="text-sm font-medium text-gray-600 dark:text-zinc-400">{emptyMessage}</span>
                                </div>
                            </td>
                        </tr>
                    ) : rows.map((row, idx) => {
                        const id = getId(row, idx)
                        return (
                            <React.Fragment key={String(id)}>
                                <motion.tr
                                    initial={{opacity: 0}}
                                    animate={{opacity: 1}}
                                    transition={{duration: 0.3}}
                                    className={`hover:bg-brand/[0.04] dark:hover:bg-zinc-900/70 transition-colors ${isExpanded(id) ? 'bg-brand/[0.04] dark:bg-brand/[0.07]' : ''} ${onRowClick ? 'cursor-pointer' : ''}`}
                                    onClick={(e) => {
                                        const target = e.target as HTMLElement | null
                                        if (target && target.closest('button, a, input, select, textarea, [data-no-row-click], .actions-cell, [role="button"]')) {
                                            return
                                        }
                                        onRowClick?.(row)
                                    }}
                                >
                                    {hasDetail && (
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggle(id);
                                                }}
                                                className={`inline-flex items-center justify-center rounded-md p-1 transition-colors cursor-pointer ${
                                                    isExpanded(id)
                                                        ? 'bg-brand/15 text-brand'
                                                        : 'text-gray-400 hover:bg-brand/10 hover:text-brand dark:text-zinc-500 dark:hover:text-brand'
                                                }`}
                                            >
                                                <motion.div animate={{rotate: isExpanded(id) ? 90 : 0}}
                                                            transition={{duration: 0.2}}>
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor"
                                                         viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round"
                                                              strokeWidth={2} d="M9 5l7 7-7 7"/>
                                                    </svg>
                                                </motion.div>
                                            </button>
                                        </td>
                                    )}

                                    {columns.map(col => (
                                        <td key={col.key}
                                            onClick={col.key === 'actions' ? (e) => e.stopPropagation() : undefined}
                                            className={`px-4 py-3.5 whitespace-nowrap text-sm text-gray-800 dark:text-zinc-200 ${col.cellClassName ?? ''}`}>
                                            {col.render ? col.render(row) : col.accessor ? col.accessor(row) : null}
                                        </td>
                                    ))}
                                </motion.tr>

                                {hasDetail && (
                                    <AnimatePresence>
                                        {isExpanded(id) && (
                                            <motion.tr
                                                initial={{opacity: 0, height: 0, scaleY: 0}}
                                                animate={{opacity: 1, height: 'auto', scaleY: 1}}
                                                exit={{opacity: 0, height: 0, scaleY: 0}}
                                                transition={{
                                                    duration: 0.4,
                                                    ease: 'easeInOut',
                                                    opacity: {duration: 0.3},
                                                    height: {duration: 0.4}
                                                }}
                                                className="bg-brand/[0.02] dark:bg-zinc-900/50"
                                            >
                                                <td colSpan={(columns.length + (hasDetail ? 1 : 0))}
                                                    className="px-4 py-4">
                                                    <div
                                                        className="bg-card text-card-foreground rounded-xl border border-border border-l-3 border-l-brand shadow-sm overflow-hidden">
                                                        {renderDetail?.(row)}
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        )}
                                    </AnimatePresence>
                                )}
                            </React.Fragment>
                        )
                    })}
                    </tbody>
                </table>
            </div>
            {pagination && (
                <div className="border-t border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-gray-700 dark:text-zinc-300 min-w-[700px]">
                    <TablePagination
                        component="div"
                        count={pagination.total}
                        page={pagination.page}
                        onPageChange={pagination.onPageChange}
                        rowsPerPage={pagination.rowsPerPage}
                        onRowsPerPageChange={pagination.onRowsPerPageChange}
                        rowsPerPageOptions={pagination.rowsPerPageOptions ?? [5, 10, 25]}
                        SelectProps={{
                            MenuProps: {
                                PaperProps: {
                                    sx: {
                                        backgroundColor: 'var(--color-card, #18181b)',
                                        color: 'var(--color-foreground, #f4f4f5)',
                                        border: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                                        boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
                                        borderRadius: '12px',
                                        mt: 0.5,
                                        '& .MuiMenuItem-root': {
                                            fontSize: '0.8125rem',
                                            color: 'inherit',
                                            padding: '8px 16px',
                                            borderRadius: '6px',
                                            margin: '2px 4px',
                                            transition: 'background-color 0.15s ease',
                                            '&:hover': {
                                                backgroundColor: 'rgba(var(--ui-p-rgb, 240, 140, 43), 0.12)',
                                            },
                                            '&.Mui-selected': {
                                                backgroundColor: 'rgba(var(--ui-p-rgb, 240, 140, 43), 0.2)',
                                                color: 'var(--color-brand, #f08c2b)',
                                                fontWeight: 600,
                                                '&:hover': {
                                                    backgroundColor: 'rgba(var(--ui-p-rgb, 240, 140, 43), 0.28)',
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }}
                        sx={{
                            color: 'inherit',
                            '.MuiTablePagination-toolbar': {
                                minHeight: '52px',
                                paddingLeft: '16px',
                                paddingRight: '16px',
                            },
                            '.MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows': {
                                fontSize: '0.8125rem',
                                fontWeight: 500,
                                opacity: 0.85,
                            },
                            '.MuiTablePagination-select': {
                                fontSize: '0.8125rem',
                                fontWeight: 600,
                                paddingLeft: '8px',
                                paddingRight: '24px !important',
                                color: 'inherit'
                            },
                            '.MuiTablePagination-selectIcon': {
                                color: 'inherit',
                                opacity: 0.65,
                            },
                            '.MuiTablePagination-actions': {
                                marginLeft: '16px',
                            },
                            '.MuiTablePagination-actions button': {
                                color: 'inherit',
                                padding: '6px',
                                borderRadius: '8px',
                                transition: 'all 0.15s ease',
                                '&:disabled': {
                                    opacity: 0.3,
                                },
                                '&:not(:disabled):hover': {
                                    color: 'var(--color-brand, #f08c2b)',
                                    backgroundColor: 'rgba(var(--ui-p-rgb, 240, 140, 43), 0.12)',
                                }
                            }
                        }}
                        className={pagination.className}
                    />
                </div>
            )}
        </div>
    )
}
