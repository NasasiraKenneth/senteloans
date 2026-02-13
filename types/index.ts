import type {ColDef} from "ag-grid-community";
import React from "react";

export interface LinkProps {
    label: string;
    url?: string;
}
export interface SubMenuItem {
    label: string;
    url?: string;
    icon?: { provider: string; iconName: string; color: string; size: number };
    links?: LinkProps[];
}

export interface NavItem {
    url: string;
    label: string;
    icon: { provider: string; iconName: string; color: string; size: number };
    subMenu?: SubMenuItem[];
}

export interface IAccountRow {
    id: number;
    fullName: string;
    loginId: string;
    address: string;
    email:string;
    phone: string;
}

export type RowSelectionMode={
    mode: 'singleRow' | 'multiRow';
    checkboxes: boolean | false
}
export interface Filter {
    label: string;
    value: string | number;
}

export interface DateFilter {
    field: string;        // The column field to filter on
    label: string;        // Display label for the filter
    mode: 'single' | 'range';  // Filter mode
    placeholder?: string; // Optional placeholder text
}

export interface TabularFiltersProps {
    filters: Filter[];
    onChange: (value: Filter["value"]) => void;
    value?: Filter["value"];
}

export interface SearchTerm {
    name: string;
    label: string;
    type?: 'text'|'date'|'dateRange'
}

export interface DefaultQueryParams {
    limit: number;
    offset: number;
    after?:string;
    before?:string;
}

export interface RowDataType {
    results: Array<any> | [];
    count: number;
    next?:string|null;
    previous?:string|null;
}

export interface DataTableProps {
    rowMode?: RowSelectionMode;
    columns:ColDef[]
    rowData:RowDataType
    title?:string
    filters?:Filter[] | undefined
    filterField:string | ''
    showDateFilter?:boolean  // Legacy prop for backward compatibility
    createForm?: React.ReactNode
    updateForm?: React.ReactNode
    dateFilterMode?: 'single' | 'range'  // Legacy prop for backward compatibility
    dateFilters?: DateFilter[]  // New prop for column-specific date filters
    optionFilters?:OptionFilter[]
    searchTerms?:SearchTerm[],
    exportData?:boolean,
    pageName?:string,
    onRowClick?: (rowData: any) => void;
}

export interface OptionFilter  {
    field: string;
    label: string;
    value?: any;
    options: { value: any; label: string }[] | [];
    multiple?: boolean;
}
