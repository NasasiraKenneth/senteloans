'use client';

import React  from "react";
import {FilterField} from "@/components/datatables/TableFilter";
import {TableFilter} from "@/components/datatables/index";

export interface SelectFiltersProps {
  filterFields: FilterField[];
  onFilterChange: (field: string, type: string, value: any) => void;
  className?: string;
  layout?: 'grid' | 'horizontal';
}

export function TableFilters({
  filterFields,
  onFilterChange,
  className = '',
  layout = 'horizontal'
}: SelectFiltersProps) {
  if (filterFields.length === 0) {
    return null;
  }

  const containerClass = layout === 'horizontal'
    ? 'flex flex-row gap-2 items-center flex-wrap'
    : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';

  const wrapperClass = layout === 'horizontal'
    ? className
    : `space-y-4 ${className}`;

  return (
    <div className={wrapperClass}>
      {/* Filter Controls */}
      <div className={containerClass}>
        {filterFields.map((filter,index) => (
          <TableFilter
            key={`${filter.field}-${index}`}
            filter={filter}
            onChange={(value) =>
                onFilterChange(filter.field, filter.type === "date-range" ? 'date-range': filter.type==='select' && filter.multiple ? 'checkbox':'radio', value)}
            layout={layout}
          />
        ))}
      </div>
      <hr className="border-gray-400 mt-4" />
    </div>
  );
}



export default TableFilters;
