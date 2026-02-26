'use client'

import React, {useEffect, useMemo, useState} from 'react'
import TablePagination from '@mui/material/TablePagination'
import {motion, AnimatePresence} from 'framer-motion'
import {Filter, SearchTerm} from "@/types";
import {FilterField} from "@/components/datatables/TableFilter";
import {Icon, TabularFilters} from "@/components/datatables/index";
import Tooltip from "@mui/material/Tooltip";
import TableFilters from "@/components/datatables/TableFilters";
import {convertDate} from "@/app/lib/utils";

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
        let params = {}
        if(tabularFilterField){
            // @ts-ignore
            params[tabularFilterField]=filter;
            setQueryParameters({...params});
        }

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

    const buttonVariants = {
        rest: {scale: 1},
        hover: {scale: 1.05, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", transition: {duration: 0.2}},
        tap: {scale: 0.98}
    };

    const headerCells = useMemo(() => (
        <tr>
            {hasDetail && (
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8"></th>
            )}
            {columns.map(col => (
                <th
                    key={col.key}
                    className={`px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${col.headerClassName ?? ''}`}
                    style={col.width ? {width: col.width} : undefined}
                >
                    {col.header}
                </th>
            ))}
        </tr>
    ), [columns, hasDetail])

    return (
        <div className={`flex flex-col rounded-lg shadow-sm border border-gray-200 ${className ?? ''}`}>

            {/*
                ➤ TOP SECTION
                This section now grows naturally without clipping.
                You can stack ANYTHING here.
            */}
            <div className="flex flex-col w-full space-y-4 p-4">

                {title && (
                    <motion.div
                        variants={itemVariants}
                        initial="hidden"
                        animate="visible"
                        className="bg-white rounded-xl p-4 shadow-sm border border-gray-200"
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <motion.div
                                    whileHover={{rotate: [0, 10, -10, 0], scale: 1.1}}
                                    transition={{duration: 0.4}}
                                    className="bg-[#de4925] p-2 rounded-lg"
                                >
                                    <Icon provider="fa" iconName="FaTable" size={20} color="white"/>
                                </motion.div>
                                <span className="text-base font-semibold text-gray-900">
                                    {title}
                                </span>
                            </div>

                            <div className="flex space-x-3">
                                {[
                                    {
                                        icon: "ImFilePdf",
                                        color: "red",
                                        className: "border border-[#77a5d2] bg-[#D3D3D3] hover:bg-[#5e8fc1]",
                                        label: "PDF",
                                        tooltip: "Export as PDF",
                                        provider: "mi",
                                        size: 16
                                    },
                                    {
                                        icon: "RiFileExcel2Line",
                                        color: "green",
                                        className: "border border-[#282f40] bg-[#D3D3D3] hover:bg-[#1a202e]",
                                        label: "Excel",
                                        tooltip: "Export as Spreadsheet",
                                        provider: "ri",
                                        size: 16
                                    }
                                ].map((btn, idx) => (
                                    <Tooltip
                                        key={idx}
                                        title={btn.tooltip}
                                        placement="top"
                                        arrow
                                        enterDelay={300}
                                        slotProps={{
                                            tooltip: {
                                                sx: {
                                                    bgcolor: "white",
                                                    color: "#282f40",
                                                    fontSize: "0.75rem",
                                                    padding: "6px 10px",
                                                    boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                                                    borderRadius: "8px",
                                                },
                                            },
                                            arrow: {sx: {color: "white"}}
                                        }}
                                    >
                                        <motion.button
                                            variants={buttonVariants}
                                            initial="rest"
                                            whileHover="hover"
                                            whileTap="tap"
                                            className={`flex items-center gap-2 px-4 py-2 ${btn.className} text-white rounded-lg shadow-md text-sm font-medium`}
                                        >
                                            <Icon provider={btn.provider as any} iconName={btn.icon} color={btn.color}
                                                  size={btn.size}/>
                                            {btn.label && <span className={`text-[${btn.color}]`}>{btn.label}</span>}
                                        </motion.button>
                                    </Tooltip>
                                ))}
                            </div>

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
                    <div className="w-full ">
                        <TabularFilters
                            filters={tabularFilters}
                            onChange={handleOnTabularFilterChange}
                        />
                    </div>
                )}
            </div>

            {/*
                ➤ TABLE WRAPPER
                ONLY the scrollable table area uses overflow-x-auto
            */}
            <div className="px-2 overflow-x-auto">
                <table className="w-full min-w-[700px]">
                    <thead className="bg-gray-50">
                    {headerCells}
                    </thead>

                    <tbody className="bg-white divide-y divide-gray-200">
                    {loading ? (
                        <tr>
                            <td colSpan={(columns.length + (hasDetail ? 1 : 0))}
                                className="px-4 py-6 text-center text-gray-500">Loading...
                            </td>
                        </tr>
                    ) : rows.length === 0 ? (
                        <tr>
                            <td colSpan={(columns.length + (hasDetail ? 1 : 0))}
                                className="px-4 py-6 text-center text-gray-500">{emptyMessage}</td>
                        </tr>
                    ) : rows.map((row, idx) => {
                        const id = getId(row, idx)
                        return (
                            <React.Fragment key={String(id)}>
                                <motion.tr
                                    initial={{opacity: 0}}
                                    animate={{opacity: 1}}
                                    transition={{duration: 0.3}}
                                    className={`hover:bg-gray-50 ${onRowClick ? 'cursor-pointer' : ''}`}
                                    onClick={() => onRowClick?.(row)}
                                >
                                    {hasDetail && (
                                        <td className="px-4 py-2 whitespace-nowrap">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggle(id);
                                                }}
                                                className="text-gray-400 hover:text-gray-600 transition-colors"
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
                                            className={`px-4 py-2 whitespace-nowrap text-sm text-gray-900 ${col.cellClassName ?? ''}`}>
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
                                                className="bg-gray-50"
                                            >
                                                <td colSpan={(columns.length + (hasDetail ? 1 : 0))}
                                                    className="px-4 py-4">
                                                    <div
                                                        className="bg-white rounded-lg border border-gray-200 shadow-sm">
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
                <TablePagination
                    component="div"
                    count={pagination.total}
                    page={pagination.page}
                    onPageChange={pagination.onPageChange}
                    rowsPerPage={pagination.rowsPerPage}
                    onRowsPerPageChange={pagination.onRowsPerPageChange}
                    rowsPerPageOptions={pagination.rowsPerPageOptions ?? [5, 10, 25]}
                    className={pagination.className ?? 'border-t border-gray-200 min-w-[700px]'}
                />
            )}
        </div>
    )
}
